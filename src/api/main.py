import os
import torch
from pydub import AudioSegment
import whisper
from pyannote.audio import Pipeline
from pyannote.core import Segment
import warnings
import numpy as np
from scipy.spatial.distance import cosine
from collections import defaultdict
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
import tempfile
import shutil
from typing import List, Dict, Any

# ★★★★★ 修正 1 ★★★★★
# CORS許可証（ミドルウェア）をインポート
from fastapi.middleware.cors import CORSMiddleware

# speechbrain (声紋AI) のインポート
try:
    from speechbrain.pretrained import EncoderClassifier
except ImportError:
    print("致命的エラー: 'speechbrain' がインストールされていません。")
    print("(.venv) > pip install speechbrain")
    exit()

# -----------------------------------------------------------
# 1. 設定
# -----------------------------------------------------------
TARGET_THRESHOLD = 0.70 # PoCで決定した閾値
TARGET_LOUDNESS_DBFS = -20.0 
MIN_SPEECH_DURATION_S = 0.5 
TEMP_SEGMENT_FILE = "api_temp_segment.wav" # スクリプトとは別名にする

# -----------------------------------------------------------
# 2. ユーティリティ関数 (PoC から移植)
# -----------------------------------------------------------

def load_and_normalize_audio(file_path, target_dbfs):
    """ .webm を読み込み、16kHz モノラル / 音量正規化 する """
    try:
        audio = AudioSegment.from_file(file_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        if audio.dBFS > -float('inf'):
            change_in_dbfs = target_dbfs - audio.dBFS
            audio = audio.apply_gain(change_in_dbfs)
        return audio
    except Exception as e:
        print(f"エラー: {file_path} の読み込みに失敗。FFmpeg v7 がPATHに設定されていますか？詳細: {e}")
        return None

def pydub_to_tensor_dict(pydub_audio):
    """ Pydub Segment を Pyannote/Speechbrain 用のTensor辞書に変換 """
    samples = np.array(pydub_audio.get_array_of_samples()).astype(np.float32) / 32768.0
    waveform_tensor = torch.tensor(samples).unsqueeze(0)
    return {'waveform': waveform_tensor, 'sample_rate': pydub_audio.frame_rate}

def extract_average_embedding(audio_data, vad_result, embedding_model, device):
    """ VAD結果を使い、全ての発話区間の「平均声紋」を抽出する """
    embeddings = [] 
    waveform = audio_data['waveform']
    sample_rate = audio_data['sample_rate']
    for segment in vad_result.itersegments():
        if segment.duration < MIN_SPEECH_DURATION_S:
            continue
        start_sample = int(segment.start * sample_rate)
        end_sample = int(segment.end * sample_rate)
        cropped_waveform = waveform[:, start_sample:end_sample]
        if cropped_waveform.shape[1] == 0:
            continue
        embedding = embedding_model.encode_batch(cropped_waveform.to(device))
        embeddings.append(embedding.squeeze()) # 1D [192]
    if not embeddings:
        return None
    stacked_embeddings = torch.stack(embeddings) # [N, 192]
    mean_embedding = torch.mean(stacked_embeddings, dim=0) # [192] (1D)
    mean_embedding = torch.nn.functional.normalize(mean_embedding, p=2, dim=0)
    return mean_embedding

def get_embedding_for_segment(pydub_segment, embedding_model, device):
    """ (VAD無し) pydubセグメントから直接、単一の声紋を抽出する """
    if pydub_segment.duration_seconds < MIN_SPEECH_DURATION_S:
        return None
    audio_data = pydub_to_tensor_dict(pydub_segment)
    waveform = audio_data['waveform'].to(device)
    embedding = embedding_model.encode_batch(waveform) # [1, 1, 192]
    embedding = embedding.squeeze() # [192] (1D)
    embedding = torch.nn.functional.normalize(embedding, p=2, dim=0)
    return embedding

def compare_embeddings(emb1, emb2):
    """ 2つの声紋(Tensor)の類似度を計算する """
    emb1_np = emb1.detach().cpu().numpy()
    emb2_np = emb2.detach().cpu().numpy()
    distance = cosine(emb1_np, emb2_np) 
    similarity = 1.0 - (distance / 2.0)
    return similarity

# -----------------------------------------------------------
# 3. AIモデルのロード (グローバルスコープで起動時に1回だけ実行)
# -----------------------------------------------------------
print("AIモデル（Diarization, VAD, 声紋, Whisper）をロード中です...")
device = torch.device("cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu"))
print(f"使用デバイス: {device}")
warnings.filterwarnings("ignore", category=UserWarning)
try:
    os.add_dll_directory(r"C:\ffmpeg\bin")
except AttributeError:
    pass # 古いPythonやWindows以外では無視

# グローバル変数としてAIモデルを初期化
diarization_pipeline = None
embedding_model = None
vad_pipeline = None
whisper_model = None

try:
    diarization_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
    embedding_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=os.path.join(os.path.expanduser("~"), ".cache", "torch", "speechbrain"),
    ).to(device)
    vad_pipeline = Pipeline.from_pretrained("pyannote/voice-activity-detection")
    whisper_model = whisper.load_model("small")
    print("AIモデルのロード完了。")
except Exception as e:
    print(f"致命的エラー: AIモデルのロードに失敗しました。Hugging Face 認証と規約同意を確認してください。詳細: {e}")
    # (エラーがあっても起動は継続し、API側でエラーを返す)

# -----------------------------------------------------------
# 4. FastAPI アプリケーションの定義
# -----------------------------------------------------------
app = FastAPI()

# ★★★★★ 修正 2 ★★★★★
# すべてのオリジン（*）からの通信を許可するCORS設定
# (PoCなので "*" にしていますが、本番では 'http://localhost:5173' に絞ります)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "PoC API is running"}

@app.post("/transcribe")
async def transcribe_audio(
    target_voice: UploadFile = File(...), # (my_voice.webm)
    mixed_audio: UploadFile = File(...)  # (test.webm)
) -> Dict[str, Any]:
    
    print("API: /transcribe が呼び出されました。")

    # (起動時のAIモデルロード失敗をここで検知)
    if not all([diarization_pipeline, embedding_model, vad_pipeline, whisper_model]):
        raise HTTPException(
            status_code=500, 
            detail="AIモデルが正しくロードされていません。サーバーの起動ログを確認してください。"
        )

    
    # UploadFile を一時ファイルに保存 (pydubがファイルパスを要求するため)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_target:
        shutil.copyfileobj(target_voice.file, tmp_target)
        target_voice_path = tmp_target.name

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_mixed:
        shutil.copyfileobj(mixed_audio.file, tmp_mixed)
        mixed_audio_path = tmp_mixed.name

    try:
        # --- ステップ1b： ターゲット声紋の「登録」 ---
        print(f"--- ターゲット声紋の登録 ({target_voice.filename}) ---")
        target_audio_pydub = load_and_normalize_audio(target_voice_path, TARGET_LOUDNESS_DBFS)
        if target_audio_pydub is None:
            raise HTTPException(status_code=500, detail=f"ターゲット音声 ({target_voice.filename}) のロードに失敗")
            
        target_audio_data = pydub_to_tensor_dict(target_audio_pydub)
        target_vad_result = vad_pipeline(target_audio_data)
        target_embedding = extract_average_embedding(target_audio_data, target_vad_result, embedding_model, device)
        
        if target_embedding is None:
            raise HTTPException(status_code=400, detail=f"ターゲット音声 ({target_voice.filename}) が短すぎるか、声を検出できませんでした")
        print("ターゲット声紋の登録が完了しました。")

        # --- ステップ1a： 会話の「分離」と「クラスタリング」 ---
        print(f"--- [Pass 1] 会話の分離・文字起こし・声紋収集 ({mixed_audio.filename}) ---")
        mixed_audio_pydub = load_and_normalize_audio(mixed_audio_path, TARGET_LOUDNESS_DBFS)
        if mixed_audio_pydub is None:
            raise HTTPException(status_code=500, detail=f"会話音声 ({mixed_audio.filename}) のロードに失敗")
            
        mixed_audio_data = pydub_to_tensor_dict(mixed_audio_pydub)

        print("話者分離（誰がいつ話したか）を実行中...")
        diarization = diarization_pipeline(mixed_audio_data, min_speakers=1, max_speakers=3)

        # [Pass 1]
        print("Pass 1: 区間ごとに「文字起こし」と「声紋抽出」を実行中...")
        cluster_embeddings = defaultdict(list)
        segments_data = [] # (speaker_label, turn, text) を保存
        
        for turn, _, speaker_label in diarization.itertracks(yield_label=True):
            start_ms = int(turn.start * 1000)
            end_ms = int(turn.end * 1000)
            segment_audio = mixed_audio_pydub[start_ms:end_ms]
            
            segment_audio.export(TEMP_SEGMENT_FILE, format="wav")
            result = whisper_model.transcribe(TEMP_SEGMENT_FILE, language="ja")
            transcript = result['text'].strip()

            current_embedding = get_embedding_for_segment(segment_audio, embedding_model, device)
            
            if current_embedding is not None:
                cluster_embeddings[speaker_label].append(current_embedding)
            if transcript:
                segments_data.append( (speaker_label, turn, transcript) )

        # [Pass 2]
        print("\n--- [Pass 2] クラスタの「平均声紋」をターゲットと比較中 ---")
        target_speaker_label = None
        cluster_similarities = {} # (デバッグ用)
        
        for speaker_label, embeddings in cluster_embeddings.items():
            if not embeddings:
                continue
            stacked_embeddings = torch.stack(embeddings)
            mean_embedding = torch.mean(stacked_embeddings, dim=0)
            mean_embedding = torch.nn.functional.normalize(mean_embedding, p=2, dim=0)
            similarity = compare_embeddings(target_embedding, mean_embedding)
            cluster_similarities[speaker_label] = similarity
            
            print(f"  -> クラスタ '{speaker_label}' の平均類似度: {similarity:.4f}")
            if similarity >= TARGET_THRESHOLD:
                target_speaker_label = speaker_label
                print(f"--- 判定完了: '{target_speaker_label}' がターゲットです ---")

        # [Pass 3]
        print("\n--- [Pass 3] カルテ記録（全発話リスト）---")
        final_transcription = []
        for speaker_label, turn, transcript in segments_data:
            label = "TARGET" if (speaker_label == target_speaker_label) else "OTHER"
            final_transcription.append({
                "speaker": label,
                "start": round(turn.start, 1),
                "end": round(turn.end, 1),
                "text": transcript
            })
            print(f"[{label}] ({turn.start:.1f}s - {turn.end:.1f}s): {transcript}")

        return {
            "transcription": final_transcription,
            "debug_info": {
                "target_label": target_speaker_label,
                "cluster_similarities": cluster_similarities
            }
        }
    
    except Exception as e:
        print(f"処理中にエラーが発生しました: {e}")
        raise HTTPException(status_code=500, detail=f"サーバー内部エラー: {e}")
    
    finally:
        # 一時ファイルを削除
        if os.path.exists(target_voice_path):
            os.remove(target_voice_path)
        if os.path.exists(mixed_audio_path):
            os.remove(mixed_audio_path)
        if os.path.exists(TEMP_SEGMENT_FILE):
            os.remove(TEMP_SEGMENT_FILE)

# -----------------------------------------------------------
# 5. サーバーの起動 (開発用)
# -----------------------------------------------------------
if __name__ == "__main__":
    print("開発サーバーを http://127.0.0.1:8000 で起動します")
    uvicorn.run(app, host="127.0.0.1", port=8000)