import os
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import databases
import sqlalchemy
from pydantic import BaseModel
import datetime

# -----------------------------------------------------------
# 1. 設定 (Task 1: DB基盤)
# -----------------------------------------------------------

# サーバー内で完結するSQLiteデータベース
DATABASE_URL = "sqlite:///./koeno_app.db"

# SQLAlchemyのデータベースエンジンとメタデータ
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# -----------------------------------------------------------
# 2. DBスキーマ設計 (Task 1: recordings テーブル)
# -----------------------------------------------------------
recordings = sqlalchemy.Table(
    "recordings",
    metadata,
    sqlalchemy.Column("recording_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, index=True),
    
    # Task 1時点ではファイルパスを保存 (BLOBはDBを肥大化させるため)
    sqlalchemy.Column("audio_file_path", sqlalchemy.String), 
    sqlalchemy.Column("memo_text", sqlalchemy.Text),
    
    # AI処理ステータス: 'pending', 'processing', 'completed', 'failed'
    sqlalchemy.Column("ai_status", sqlalchemy.String, default="pending", index=True),
    
    sqlalchemy.Column("transcription_result", sqlalchemy.JSON), # 文字起こし結果 (JSON)
    sqlalchemy.Column("summary_result", sqlalchemy.Text),       # 要約結果 (TEXT)
    
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, default=datetime.datetime.utcnow),
)

# -----------------------------------------------------------
# 3. Pydanticモデル (APIリクエスト/レスポンス用)
# -----------------------------------------------------------

class RecordingResponse(BaseModel):
    """ アップロード成功時に返すレスポンス """
    recording_id: int
    ai_status: str
    message: str

class RecordSummary(BaseModel):
    """ /my_records で返す一覧の形式 """
    recording_id: int
    ai_status: str
    memo_text: Optional[str]
    transcription_result: Optional[Dict[str, Any]] # JSON想定
    summary_result: Optional[str]
    created_at: datetime.datetime

# -----------------------------------------------------------
# 4. FastAPI アプリケーションの定義
# -----------------------------------------------------------
app = FastAPI()

# (PoCから流用) CORS許可設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 本番では 'http://localhost:5173' 等に制限
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------
# 5. ライフサイクルイベント (DB接続/切断)
# -----------------------------------------------------------

@app.on_event("startup")
async def startup():
    """ サーバー起動時にDBテーブルを作成し、接続する """
    engine = sqlalchemy.create_engine(DATABASE_URL)
    metadata.create_all(engine)
    await database.connect()
    print("データベースに接続し、テーブル定義を確認しました。")
    # (Task 1ではAIモデルはロードしない)

@app.on_event("shutdown")
async def shutdown():
    """ サーバー終了時にDBから切断する """
    await database.disconnect()
    print("データベース接続を切断しました。")

# -----------------------------------------------------------
# 6. APIエンドポイント (Task 1)
# -----------------------------------------------------------

@app.get("/")
def read_root():
    return {"status": "KOENO-APP API (Session-based) is running"}

# ★★★★★ Task 1 新設 ★★★★★
@app.post("/upload_recording", response_model=RecordingResponse)
async def upload_recording(
    audio_blob: UploadFile = File(...),
    caregiver_id: str = Form(...),
    memo_text: str = Form(...)
):
    """
    リクエスト: (フォームデータで) caregiver_id, audio_blob, memo_text を受け取る
    処理: データをDBに (ai_status = pending) で保存し、IDを返す
    """
    
    # 1. 音声データをファイルとして保存 (Task 2以降のバッチ処理のため)
    # (ここでは 'uploads' フォルダを想定)
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    # 衝突を避けるためユニークなファイル名を生成
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = os.path.join(upload_dir, f"{caregiver_id}_{timestamp}_{audio_blob.filename}")
    
    try:
        with open(file_path, "wb") as f:
            f.write(await audio_blob.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"音声ファイルの保存に失敗しました: {e}")

    # 2. DBにメタデータを保存 (ai_status = 'pending')
    query = recordings.insert().values(
        caregiver_id=caregiver_id,
        audio_file_path=file_path,
        memo_text=memo_text,
        ai_status="pending",
        transcription_result=None, # AI未処理
        summary_result=None        # AI未処理
    )
    
    try:
        last_record_id = await database.execute(query)
        
        return {
            "recording_id": last_record_id,
            "ai_status": "pending",
            "message": "録音データを受け付けました。AI処理待ちです。"
        }
    except Exception as e:
        # (もしDB保存に失敗したら、保存した音声ファイルも削除するロールバック処理が望ましいが、ここでは省略)
        raise HTTPException(status_code=500, detail=f"データベースへの保存に失敗しました: {e}")


# ★★★★★ Task 1 新設 ★★★★★
@app.get("/my_records", response_model=List[RecordSummary])
async def get_my_records(
    caregiver_id: str # (Task 6の認証実装まではクエリパラメータで受け取る)
):
    """
    リクエスト: 認証済みの caregiver_id を使用
    処理: ai_status = completed かつ caregiver_id が一致する記録一覧を返却
    """
    
    query = recordings.select().where(
        (recordings.c.caregiver_id == caregiver_id) &
        (recordings.c.ai_status == "completed")
    ).order_by(recordings.c.created_at.desc())
    
    try:
        completed_records = await database.fetch_all(query)
        return completed_records
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"記録の取得に失敗しました: {e}")

# ★★★★★ Task 1 廃止 ★★★★★
# (PoC用の /transcribe エンドポイントは削除)

# -----------------------------------------------------------
# 7. サーバーの起動 (開発用)
# -----------------------------------------------------------
if __name__ == "__main__":
    print("開発サーバーを http://127.0.0.1:8000 で起動します")
    uvicorn.run(app, host="127.0.0.1", port=8000)