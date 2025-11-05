import os
import torch
from pydub import AudioSegment
import warnings
import numpy as np
from scipy.spatial.distance import cosine

from pyannote.audio import Pipeline
from pyannote.core import Segment # 区間を扱うためにインポート
try:
    from speechbrain.pretrained import EncoderClassifier
except ImportError:
    print("エラー: 'speechbrain' がインストールされていません。")
    print("py -3.12 -m pip install speechbrain")
    exit()

# -----------------------------------------------------------
# 1. 設定
# -----------------------------------------------------------
AUDIO_FILE_1 = "my_voice.webm"
AUDIO_FILE_2 = "other_voice.webm"

# ★★★★★ 修正 ★★★★★
# 声紋AIに渡す「標準音量」(dBFS) を定義
TARGET_LOUDNESS_DBFS = -20.0 

# -----------------------------------------------------------
# 2. ユーティリティ関数
# -----------------------------------------------------------
def load_and_normalize_audio(file_path, target_dbfs):
    """ 
    .webm を読み込み、16kHz モノラルに変換し、
    さらに音量を「ターゲットdBFS」に正規化する
    """
    try:
        audio = AudioSegment.from_file(file_path)
        
        # 1. 16kHz モノラルに変換
        audio = audio.set_frame_rate(16000).set_channels(1)
        
        # ★★★★★ 修正 ★★★★★
        # 2. 音量を正規化 (大きな声も小さな声も -20dBFS に揃える)
        if audio.dBFS > -float('inf'): # 音声が空でないことを確認
            change_in_dbfs = target_dbfs - audio.dBFS
            audio = audio.apply_gain(change_in_dbfs)
        
        # 3. Pyannote用のTensor形式に変換
        samples = np.array(audio.get_array_of_samples()).astype(np.float32) / 32768.0
        waveform_tensor = torch.tensor(samples).unsqueeze(0)
        
        return {'waveform': waveform_tensor, 'sample_rate': audio.frame_rate}
        
    except Exception as e:
        print(f"エラー: {file_path} の読み込みに失敗。FFmpeg v7 がPATHに設定されていますか？詳細: {e}")
        return None

def extract_speech_tensor(audio_data, vad_result):
    """
    VAD（無音検出）の結果を使い、
    オーディオデータから「最も長い発話区間」だけを切り抜く
    (※前回のバグ修正コードと同じ)
    """
    longest_segment = None
    max_duration = 0.0

    for segment in vad_result.itersegments():
        if segment.duration > max_duration:
            max_duration = segment.duration
            longest_segment = segment
            
    if longest_segment is None:
        return None

    waveform = audio_data['waveform']
    sample_rate = audio_data['sample_rate']
    
    start_sample = int(longest_segment.start * sample_rate)
    end_sample = int(longest_segment.end * sample_rate)
    
    # [1, N] のテンソルから、 [1, start:end] の部分を切り抜く
    cropped_waveform = waveform[:, start_sample:end_sample]
    
    # ★★★★★ 修正 ★★★★★
    # 声紋AIは短すぎる音声（1秒未満など）を嫌うため、長さをチェック
    if cropped_waveform.shape[1] < (sample_rate * 0.5): # 0.5秒未満
        return None # 短すぎる場合は無視

    return cropped_waveform

# -----------------------------------------------------------
# 3. AIモデルのロード
# -----------------------------------------------------------
print("AIモデル（VADと声紋）をロード中です...")
device = torch.device("cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu"))
print(f"使用デバイス: {device}")
warnings.filterwarnings("ignore", category=UserWarning)
try:
    os.add_dll_directory(r"C:\ffmpeg\bin")
except AttributeError:
    pass 

try:
    embedding_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=os.path.join(os.path.expanduser("~"), ".cache", "torch", "speechbrain"),
    ).to(device)
    vad_pipeline = Pipeline.from_pretrained("pyannote/voice-activity-detection")
except Exception as e:
    print(f"エラー: Pyannoteパイプラインのロードに失敗しました。詳細: {e}")
    exit()
print("AIモデルのロード完了。")

# -----------------------------------------------------------
# 4. メイン処理の実行
# -----------------------------------------------------------
try:
    print(f"音声1 ({AUDIO_FILE_1}) をロード中 (音量正規化)...")
    # ★★★★★ 修正 ★★★★★
    audio_data_1 = load_and_normalize_audio(AUDIO_FILE_1, TARGET_LOUDNESS_DBFS)
    
    print(f"音声2 ({AUDIO_FILE_2}) をロード中 (音量正規化)...")
    # ★★★★★ 修正 ★★★★★
    audio_data_2 = load_and_normalize_audio(AUDIO_FILE_2, TARGET_LOUDNESS_DBFS)

    if not audio_data_1 or not audio_data_2:
        exit()

    print("音声1から「声」の区間を検出中...")
    vad_result_1 = vad_pipeline(audio_data_1)
    speech_tensor_1 = extract_speech_tensor(audio_data_1, vad_result_1)

    print("音声2から「声」の区間を検出中...")
    vad_result_2 = vad_pipeline(audio_data_2)
    speech_tensor_2 = extract_speech_tensor(audio_data_2, vad_result_2)

    if speech_tensor_1 is None or speech_tensor_2 is None:
        print("\nエラー: 音声が短すぎるか、VAD（無音検出）が「声」を見つけられませんでした。")
        print("（record.html で、1秒以上はっきりと録音してください）")
        exit()

    print("音声1の声紋を抽出中...")
    embedding_1 = embedding_model.encode_batch(speech_tensor_1.to(device))
    print("音声2の声紋を抽出中...")
    embedding_2 = embedding_model.encode_batch(speech_tensor_2.to(device))

    embedding_1 = embedding_1.squeeze()
    embedding_2 = embedding_2.squeeze()
    embedding_1_np = embedding_1.detach().cpu().numpy()
    embedding_2_np = embedding_2.detach().cpu().numpy()

    distance = cosine(embedding_1_np, embedding_2_np) 
    similarity = 1.0 - (distance / 2.0) 

    print("\n--- PoC (ステップ1b) 音量正規化版 結果 ---")
    print(f"音声1と音声2の「声の類似度」: {similarity:.4f}")

    if similarity > 0.8: # 閾値 (0.8)
        print(f"（判定: {similarity:.0%} の確率で「同一人物」です）")
    else:
        print(f"（判定: 「別人」の可能性が高いです）")

except Exception as e:
    print(f"処理中にエラーが発生しました: {e}")

print("処理完了。")