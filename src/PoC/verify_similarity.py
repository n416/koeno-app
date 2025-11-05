import os
import torch
from pydub import AudioSegment
import warnings
import numpy as np
from scipy.spatial.distance import cosine

from pyannote.audio import Pipeline
from pyannote.audio import Model # Model は speechbrain ロードに必要
from pyannote.core.utils.distance import cdist

# ★★★★★ 修正 ★★★★★
# speechbrain (pyannote 3.1.1 互換) をロードするために必要
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

# -----------------------------------------------------------
# 2. ユーティリティ関数（verify_ai.py から流用）
# -----------------------------------------------------------
def load_audio_tensor(file_path):
    """ .webm を読み込み、Pyannote用のTensor形式に変換する """
    try:
        audio = AudioSegment.from_file(file_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        samples = np.array(audio.get_array_of_samples()).astype(np.float32) / 32768.0
        waveform_tensor = torch.tensor(samples).unsqueeze(0)
        return {'waveform': waveform_tensor, 'sample_rate': audio.frame_rate}
    except Exception as e:
        print(f"エラー: {file_path} の読み込みに失敗。FFmpeg v7 がPATHに設定されていますか？詳細: {e}")
        return None

# -----------------------------------------------------------
# 3. AIモデルのロード
# -----------------------------------------------------------
print("AIモデル（VADと声紋）をロード中です...")
device = torch.device("cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu"))
print(f"使用デバイス: {device}")

warnings.filterwarnings("ignore", category=UserWarning)

# FFmpeg のDLLパスを強制追加 (verify_ai.py から拝借)
try:
    os.add_dll_directory(r"C:\ffmpeg\bin")
except AttributeError:
    pass # 古いPythonやWindows以外では無視

try:
    # ★★★★★ 修正 ★★★★★
    # pyannote/embedding (v0.0.1) の代わりに、
    # pyannote 3.1.1 と互換性のある speechbrain (v1.0+) をロードする
    embedding_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=os.path.join(os.path.expanduser("~"), ".cache", "torch", "speechbrain"),
    ).to(device)
    
    # VAD（声の検出）AIのロード (これは変更なし)
    vad_pipeline = Pipeline.from_pretrained("pyannote/voice-activity-detection")

except Exception as e:
    print(f"エラー: Pyannoteパイプラインのロードに失敗しました。詳細: {e}")
    exit()

print("AIモデルのロード完了。")

# -----------------------------------------------------------
# 4. メイン処理の実行
# -----------------------------------------------------------
try:
    print(f"音声1 ({AUDIO_FILE_1}) をロード中...")
    audio_data_1 = load_audio_tensor(AUDIO_FILE_1)
    
    print(f"音声2 ({AUDIO_FILE_2}) をロード中...")
    audio_data_2 = load_audio_tensor(AUDIO_FILE_2)

    if not audio_data_1 or not audio_data_2:
        exit()

    print("音声1から声紋を抽出中...")
    vad_result_1 = vad_pipeline(audio_data_1)
    
    # ★★★★★ 修正 ★★★★★
    # speechbrain の .crop() は存在しない。
    # .encode_batch() メソッドを呼ぶ
    # VAD結果（vad_result_1）を使って音声を切り抜く処理が必要だが、
    # まずは VAD を無視してファイル全体で声紋を抽出する
    embedding_1 = embedding_model.encode_batch(audio_data_1['waveform'].to(device))

    print("音声2から声紋を抽出中...")
    vad_result_2 = vad_pipeline(audio_data_2)
    # ★★★★★ 修正 ★★★★★
    embedding_2 = embedding_model.encode_batch(audio_data_2['waveform'].to(device))

    # (speechbrain は [1, 1, 192] のような余分な次元を返すので、[192] に整形)
    embedding_1 = embedding_1.squeeze()
    embedding_2 = embedding_2.squeeze()

    # --- (C) 2つの声紋の類似度を計算 ---
    
    # (scipy.spatial.distance.cosine は PyTorch Tensor ではなく Numpy配列を要求する)
    embedding_1_np = embedding_1.detach().cpu().numpy()
    embedding_2_np = embedding_2.detach().cpu().numpy()

    # コサイン距離(0.0〜2.0)を計算
    distance = cosine(embedding_1_np, embedding_2_np) 
    
    # 距離(0.0) = 同一人物(類似度1.0)
    # 距離(1.0) = 無関係(類似度0.5)
    # 距離(2.0) = 正反対(類似度0.0)
    similarity = 1.0 - (distance / 2.0) 

    print("\n--- PoC (ステップ1b) 結果 ---")
    print(f"音声1と音声2の「声の類似度」: {similarity:.4f}")

    if similarity > 0.8: # 閾値 (0.8) は調整が必要
        print(f"（判定: {similarity:.0%} の確率で「同一人物」です）")
    else:
        print(f"（判定: 「別人」の可能性が高いです）")


except Exception as e:
    print(f"処理中にエラーが発生しました: {e}")

print("処理完了。")