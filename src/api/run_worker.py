import asyncio
import torch
import whisper
import json
import os
import pydub
from pyannote.audio import Pipeline
from speechbrain.pretrained import EncoderClassifier
import time

# 警告を非表示にする (AIモデルロード時の定型文)
import warnings
warnings.filterwarnings("ignore")

# Task 1 で定義したDB接続情報とテーブル定義を main.py からインポートする
from main import database, recordings

# (DB操作は SQLAlchemy Core の構文も使うため)
import sqlalchemy
from sqlalchemy.sql import update

# --- Task 5: AIモデルのグローバルロード ---
# (ワーカー起動時に一度だけロードする)

print("AIワーカー: AIモデルのロードを開始します...")
print("（HuggingFace トークン（HF_TOKEN）が環境変数に設定されている必要があります）")

# デバイスの決定 (CUDAが使えるか)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"AIワーカー: 使用デバイス: {DEVICE}")

# 1. 話者分離 (Pyannote)
print("AIワーカー: Pyannote (話者分離) モデルをロード中...")
try:
    # (HuggingFaceの認証トークンが .env (HF_TOKEN) や環境変数に必要)
    diarization_pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        # (use_auth_token=True は古い引数。環境変数 HUGGING_FACE_HUB_TOKEN を自動参照)
    )
    diarization_pipeline.to(DEVICE)
    print("AIワーカー: Pyannote ロード完了。")
except Exception as e:
    print(f"AIワーカー: Pyannote のロードに失敗しました。HuggingFaceトークンが設定されていますか？ {e}")
    diarization_pipeline = None

# 2. 文字起こし (Whisper)
print("AIワーカー: Whisper (文字起こし) モデルをロード中...")
whisper_model = whisper.load_model("base") # or "medium"
print("AIワーカー: Whisper ロード完了。")

# 3. 話者埋め込み (SpeechBrain) - PO指示では不要だが、Pyannoteが内部で使う可能性
print("AIワーカー: SpeechBrain (話者埋め込み) モデルをロード中...")
try:
    # ★★★ ここを修正 ★★★
    # (誤: spkrec-apa-voxceleb)
    # (正: spkrec-ecapa-voxceleb)
    embedding_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb", 
        savedir=os.path.join("pretrained_models", "spkrec-ecapa-voxceleb"),
        run_opts={"device": DEVICE}
    )
    # ★★★ ここまで修正 ★★★
    print("AIワーカー: SpeechBrain ロード完了。")
except Exception as e:
    print(f"AIワーカー: SpeechBrain のロードに失敗しました: {e}")
    embedding_model = None

print("--- AIモデルのロード完了 ---")


async def set_status_async(record_id: int, status: str, result_data: dict = None):
    """
    DBのステータスと結果を更新する (databases ライブラリ版)
    (result_data は Python dict で受け取る)
    """
    try:
        query = (
            update(recordings)
            .where(recordings.c.recording_id == record_id)
            .values(
                ai_status=status,
                transcription_result=result_data # Python辞書をそのまま渡す (JSONに自動変換)
            )
        )
        await database.execute(query)
        print(f"DB更新: ID {record_id} を {status} に更新しました。")
    except Exception as e:
        print(f"DBエラー: ID {record_id} の更新に失敗: {e}")


def merge_diarization_and_transcription(diarization, transcription):
    """
    Pyannote の結果と Whisper の結果をマージする（Task 5 PO指示準拠）
    """
    results = []
    
    # Whisper のセグメント単位でループ
    for segment in transcription.get('segments', []):
        start_time = segment['start']
        end_time = segment['end']
        text = segment['text']
        
        # このセグメント（発話）の話者を見つける
        # (セグメントの中心時間で判断)
        segment_center = start_time + (end_time - start_time) / 2
        
        speaker_label = "UNKNOWN" # デフォルト
        
        # Pyannote の結果 (diarization) から該当する話者を探す
        for turn, _, label in diarization.itertracks(yield_label=True):
            if turn.start <= segment_center <= turn.end:
                # PO指示: ターゲット比較はせず、'SPEAKER_00' 等をそのまま使用
                speaker_label = label
                break
        
        results.append({
            "speaker": speaker_label,
            "start": round(start_time, 2), # (見やすさのため丸める)
            "end": round(end_time, 2),
            "text": text.strip()
        })
        
    return results


async def process_recording_task(record_id: int, audio_file_path: str):
    """
    単一の録音ファイルを処理する (Task 5 の中核ロジック)
    (AI処理は同期的 (ブロッキング) に実行される)
    """
    print(f"処理開始: ID {record_id} (ファイル: {audio_file_path})")
    
    # --- 1. 音声ファイルのロードと前処理 ---
    try:
        # (ファイルが存在しない場合)
        if not os.path.exists(audio_file_path):
            print(f"エラー: ID {record_id} の音声ファイルが見つかりません: {audio_file_path}")
            await set_status_async(record_id, "failed")
            return

        # (pydub の .from_file() を使用)
        audio = pydub.AudioSegment.from_file(audio_file_path)
        # (Pyannote用に16kHz, モノラルに変換)
        audio = audio.set_frame_rate(16000).set_channels(1)
        # (Whisperはファイルパスで処理するため、一時ファイルに保存)
        temp_audio_path = audio_file_path + "_whisper_temp.wav"
        audio.export(temp_audio_path, format="wav")
    except Exception as e:
        print(f"エラー: ID {record_id} の音声ファイルロード失敗: {e}")
        await set_status_async(record_id, "failed")
        return

    # --- 2. 話者分離 (Pyannote) ---
    if diarization_pipeline is None:
        print(f"エラー: ID {record_id} - Pyannote がロードされていません。")
        await set_status_async(record_id, "failed")
        return
        
    try:
        print(f"ID {record_id}: 話者分離を実行中...")
        diarization = diarization_pipeline(temp_audio_path)
    except Exception as e:
        print(f"エラー: ID {record_id} の話者分離に失敗: {e}")
        await set_status_async(record_id, "failed")
        if os.path.exists(temp_audio_path): os.remove(temp_audio_path)
        return

    # --- 3. 文字起こし (Whisper) ---
    try:
        print(f"ID {record_id}: 文字起こしを実行中...")
        # language="ja" を指定
        transcription = whisper_model.transcribe(temp_audio_path, language="ja")
    except Exception as e:
        print(f"エラー: ID {record_id} の文字起こしに失敗: {e}")
        await set_status_async(record_id, "failed")
        if os.path.exists(temp_audio_path): os.remove(temp_audio_path)
        return
    
    # --- 4. 結果のマージとDB書き戻し ---
    print(f"ID {record_id}: 結果をマージ中...")
    try:
        # Python辞書 (dict) として受け取る
        result_json: dict = merge_diarization_and_transcription(diarization, transcription)
        
        print(f"ID {record_id}: 処理成功。DBに書き戻します。")
        
        # Python辞書をそのまま渡す (json.dumps() はしない)
        await set_status_async(record_id, "completed", result_json)
        
    except Exception as e:
        print(f"エラー: ID {record_id} の結果マージまたはDB書き込みに失敗: {e}")
        await set_status_async(record_id, "failed")

    # --- 5. 最後に一時ファイルを削除 ---
    if os.path.exists(temp_audio_path):
        os.remove(temp_audio_path)


async def main_worker_loop():
    """
    Task 5 のメインポーリングループ
    """
    print("AIワーカー: 起動完了。 'pending' ステータスのレコードを検索します...")
    
    while True:
        pending_record = None
        try:
            # 1. 'pending' のレコードを1件探す (databases ライブラリ使用)
            query = recordings.select().where(recordings.c.ai_status == "pending").limit(1)
            pending_record = await database.fetch_one(query)

            if pending_record:
                record_id = pending_record.recording_id
                audio_file_path = pending_record.audio_file_path
                
                # 2. 'processing' にステータス更新
                await set_status_async(record_id, "processing")
                
                # 3. AI処理の実行 (ブロッキングだが、1件ずつなのでOK)
                await process_recording_task(record_id, audio_file_path)
                
            else:
                # 4. pending がなければ待機
                print(f"AIワーカー: 現在処理対象はありません。60秒後に再検索します... (Ctrl+Cで停止)")
                await asyncio.sleep(60) # 60秒ポーリング
        
        except Exception as e:
            print(f"AIワーカー: メインループで致命的なエラーが発生しました: {e}")
            if pending_record:
                # もし処理中に予期せぬエラーが起きたら 'failed' にする
                await set_status_async(pending_record.record_id, "failed")
            
            print("AIワーカー: 60秒後にリトライします...")
            await asyncio.sleep(60)

async def main():
    """
    ワーカープロセスのエントリーポイント
    """
    if diarization_pipeline is None or embedding_model is None:
        print("致命的エラー: AIモデルのロードに失敗したため、ワーカーを起動できません。")
        print("HuggingFace トークン（HF_TOKEN）が正しく設定されているか確認してください。")
        return

    print("AIワーカー: データベース（非同期）に接続します...")
    await database.connect()
    try:
        await main_worker_loop()
    finally:
        await database.disconnect()
        print("AIワーカー: データベース接続を切断しました。")

if __name__ == "__main__":
    # ワーカーの実行
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nAIワーカー: 手動で停止されました。")