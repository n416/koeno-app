import os
import torch
from pydub import AudioSegment
import whisper
from pyannote.audio import Pipeline
from pyannote.core import Segment
import warnings
import numpy as np
from scipy.spatial.distance import cosine
from collections import defaultdict # ★ クラスタリングのための辞書

# speechbrain (声紋AI) のインポート
try:
    from speechbrain.pretrained import EncoderClassifier
except ImportError:
    print("エラー: 'speechbrain' がインストールされていません。")
    print("py -3.12 -m pip install speechbrain")
    exit()

# -----------------------------------------------------------
# 1. 設定
# -----------------------------------------------------------
TARGET_THRESHOLD = 0.70 # (本人 0.83 vs 他人 0.53 だったので、余裕をもって 0.70 を設定)
AUDIO_FILE = "test.webm" 
TARGET_VOICE_FILE = "my_voice.webm" 
TEMP_SEGMENT_FILE = "temp_segment.wav"
TARGET_LOUDNESS_DBFS = -20.0 
MIN_SPEECH_DURATION_S = 0.5 

# -----------------------------------------------------------
# 2. ユーティリティ関数 (PoC 1b で検証済み)
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
# 3. AIモデルのロード
# -----------------------------------------------------------
print("AIモデル（Diarization, VAD, 声紋, Whisper）をロード中です...")
device = torch.device("cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu"))
print(f"使用デバイス: {device}")
warnings.filterwarnings("ignore", category=UserWarning)
try:
    os.add_dll_directory(r"C:\ffmpeg\bin")
except AttributeError:
    pass 

try:
    diarization_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
    embedding_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=os.path.join(os.path.expanduser("~"), ".cache", "torch", "speechbrain"),
    ).to(device)
    vad_pipeline = Pipeline.from_pretrained("pyannote/voice-activity-detection")
    whisper_model = whisper.load_model("small")
except Exception as e:
    print(f"エラー: AIモデルのロードに失敗しました。詳細: {e}")
    exit()
print("AIモデルのロード完了。")

# -----------------------------------------------------------
# 4. メイン処理 (ステップ1c: 2パス・クラスタリング)
# -----------------------------------------------------------
try:
    # --- ターゲット声紋の「登録」 ---
    print(f"\n--- ターゲット声紋の登録 ({TARGET_VOICE_FILE}) ---")
    
    target_audio_pydub = load_and_normalize_audio(TARGET_VOICE_FILE, TARGET_LOUDNESS_DBFS)
    target_audio_data = pydub_to_tensor_dict(target_audio_pydub)
    target_vad_result = vad_pipeline(target_audio_data)
    target_embedding = extract_average_embedding(target_audio_data, target_vad_result, embedding_model, device)
    
    if target_embedding is None:
        print("\nエラー: ターゲット音声が短すぎるか、「声」を検出できませんでした。")
        exit()
    print("ターゲット声紋の登録が完了しました。")


    # --- 会話の「分離」と「クラスタリング」 ---
    print(f"\n--- [Pass 1] 会話の分離・文字起こし・声紋収集 ({AUDIO_FILE}) ---")
    
    mixed_audio_pydub = load_and_normalize_audio(AUDIO_FILE, TARGET_LOUDNESS_DBFS)
    mixed_audio_data = pydub_to_tensor_dict(mixed_audio_pydub)

    print("話者分離（誰がいつ話したか）を実行中...")
    diarization = diarization_pipeline(mixed_audio_data, min_speakers=1, max_speakers=3)

    # ★★★★★ 2パス・ロジック ★★★★★
    
    # [Pass 1]
    # 1. クラスタ（SPEAKER_00, 01...）ごとに、声紋と文字起こし結果を「すべて」集める
    cluster_embeddings = defaultdict(list)
    segments_data = [] # (speaker_label, turn, text) を保存するリスト
    
    print("Pass 1: 区間ごとに「文字起こし」と「声紋抽出」を実行中...")
    for turn, _, speaker_label in diarization.itertracks(yield_label=True):
        
        start_ms = int(turn.start * 1000)
        end_ms = int(turn.end * 1000)
        
        # (A) pydubでその区間の音声だけを切り出す
        segment_audio = mixed_audio_pydub[start_ms:end_ms]
        
        # (B) Whisperで「先に」文字起こし
        segment_audio.export(TEMP_SEGMENT_FILE, format="wav")
        result = whisper_model.transcribe(TEMP_SEGMENT_FILE, language="ja")
        transcript = result['text'].strip()

        # (C) 切り出した区間の「声紋」を抽出
        current_embedding = get_embedding_for_segment(segment_audio, embedding_model, device)
        
        # (D) 結果を一時保存
        if current_embedding is not None:
            cluster_embeddings[speaker_label].append(current_embedding)
            
        # (E) 文字起こし結果を（判定前でも）保存
        if transcript:
            segments_data.append( (speaker_label, turn, transcript) )

    # [Pass 2]
    # 2. クラスタごとに「平均声紋」を計算し、ターゲットと比較する
    print("\n--- [Pass 2] クラスタの「平均声紋」をターゲットと比較中 ---")
    
    target_speaker_label = None # ターゲット（本人）のラベル (例: 'SPEAKER_01')
    
    for speaker_label, embeddings in cluster_embeddings.items():
        if not embeddings:
            continue
            
        stacked_embeddings = torch.stack(embeddings) # [N, 192]
        mean_embedding = torch.mean(stacked_embeddings, dim=0) # [192] (1D)
        mean_embedding = torch.nn.functional.normalize(mean_embedding, p=2, dim=0)
        
        similarity = compare_embeddings(target_embedding, mean_embedding)
        
        print(f"  -> クラスタ '{speaker_label}' の平均類似度: {similarity:.4f}")

        # 3. 閾値（0.70）を超えたら、そのクラスタを「ターゲット」として確定する
        if similarity >= TARGET_THRESHOLD:
            target_speaker_label = speaker_label
            print(f"--- 判定完了: '{target_speaker_label}' がターゲットです ---")


    # [Pass 3]
    # 4. 保存した「segments_data」を（遡及的に）ラベル付けして出力
    print("\n--- [Pass 3] カルテ記録（全発話リスト）---")

    if not segments_data:
        print("（文字起こし結果がありませんでした）")
        
    for speaker_label, turn, transcript in segments_data:
        
        # ★ ここが「遡及」判定 ★
        if speaker_label == target_speaker_label:
            print(f"[TARGET] ({turn.start:.1f}s - {turn.end:.1f}s): {transcript}")
        else:
            print(f"[OTHER] ({turn.start:.1f}s - {turn.end:.1f}s): {transcript}")


except FileNotFoundError:
    print(f"エラー: 音声ファイルが見つかりません。")
except Exception as e:
    print(f"処理中にエラーが発生しました: {e}")

finally:
    if os.path.exists(TEMP_SEGMENT_FILE):
        os.remove(TEMP_SEGMENT_FILE)

print("処理完了。")