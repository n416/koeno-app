import os
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import databases
import sqlalchemy
from pydantic import BaseModel
import datetime # ★ datetime がインポートされていることを確認

# -----------------------------------------------------------
# 1. 設定 (Task 1: DB基盤)
# -----------------------------------------------------------

# サーバー内で完結するSQLiteデータベース
DATABASE_URL = "sqlite:///./koeno_app.db"

# SQLAlchemyのデータベースエンジンとメタデータ
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# -----------------------------------------------------------
# 2. DBスキーマ設計
# -----------------------------------------------------------

# Task 7.1: 介護士ID (NFCシリアルNo, PIN) を管理するテーブル
caregivers = sqlalchemy.Table(
    "caregivers",
    metadata,
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("name", sqlalchemy.String, nullable=True), # (将来的な拡張用)
    
    # ★★★ 修正: utcnow() -> now(datetime.UTC) ★★★
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC)),
)

# Task 1: recordings テーブル
recordings = sqlalchemy.Table(
    "recordings",
    metadata,
    sqlalchemy.Column("recording_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, index=True),
    
    sqlalchemy.Column("audio_file_path", sqlalchemy.String), 
    sqlalchemy.Column("memo_text", sqlalchemy.Text),
    
    sqlalchemy.Column("ai_status", sqlalchemy.String, default="pending", index=True),
    
    sqlalchemy.Column("transcription_result", sqlalchemy.JSON), # (List[Dict] を想定)
    sqlalchemy.Column("summary_result", sqlalchemy.Text),
    
    sqlalchemy.Column("created_at", sqlalchemy.DateTime), # (defaultはstartupで制御)
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
    transcription_result: Optional[List[Dict[str, Any]]] # (Task 6 修正済み)
    summary_result: Optional[str]
    created_at: datetime.datetime

# Task 7.1: /authenticate リクエストのボディ
class AuthRequest(BaseModel):
    caregiver_id: str

# -----------------------------------------------------------
# 4. FastAPI アプリケーションの定義
# -----------------------------------------------------------
app = FastAPI()

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

# (注: Task 7 の指示書では @app.on_event を修正する指示はなかったため、
#  DeprecationWarning は出ますが、ロジックは Task 7 修正版のままにします)
@app.on_event("startup")
async def startup():
    """ サーバー起動時にDBテーブルを作成し、接続する """
    engine = sqlalchemy.create_engine(DATABASE_URL)
    metadata.create_all(engine) # recordings と caregivers が作成される
    
    await database.connect()
    print("データベースに接続し、テーブル定義を確認しました。")

    # Task 7.1 (テスト用IDの登録)
    try:
        # 既に存在する場合は無視 (IGNORE) する
        query_pin_user = caregivers.insert().prefix_with("OR IGNORE").values(
            caregiver_id="pin-user", name="PIN User"
        )
        query_1234 = caregivers.insert().prefix_with("OR IGNORE").values(
            caregiver_id="1234", name="PIN 1234"
        )
        query_nfc_test = caregivers.insert().prefix_with("OR IGNORE").values(
            caregiver_id="3f:12:53:0d", name="Test NFC Card"
        )
        
        await database.execute(query_pin_user)
        await database.execute(query_1234)
        await database.execute(query_nfc_test)
        
        print("テスト用 Caregiver ID ('pin-user', '1234', '3f:12:53:0d') を確認・登録しました。")
    except Exception as e:
        print(f"警告: テスト用IDの登録に失敗しました: {e}")

@app.on_event("shutdown")
async def shutdown():
    """ サーバー終了時にDBから切断する """
    await database.disconnect()
    print("データベース接続を切断しました。")

# -----------------------------------------------------------
# 6. APIエンドポイント
# -----------------------------------------------------------

@app.get("/")
def read_root():
    return {"status": "KOENO-APP API (Session-based) is running"}

@app.post("/upload_recording", response_model=RecordingResponse)
async def upload_recording(
    audio_blob: UploadFile = File(...),
    caregiver_id: str = Form(...),
    memo_text: str = Form(...)
):
    # (Task 7 修正済み: utcnow() -> now(datetime.UTC))
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
# ★★★ ここから修正 ★★★
    # caregiver_id に含まれるコロン(:)やスラッシュ(/)などをアンダースコア(_)に置換
    safe_caregiver_id = caregiver_id.replace(":", "_").replace("/", "_").replace("\\", "_")
    
    # (念のため filename もサニタイズ)
    safe_filename = audio_blob.filename.replace(":", "_").replace("/", "_").replace("\\", "_")
    
    file_path = os.path.join(upload_dir, f"{safe_caregiver_id}_{timestamp}_{safe_filename}")
    # ★★★ ここまで修正 ★★★
    
    try:
        with open(file_path, "wb") as f:
            f.write(await audio_blob.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"音声ファイルの保存に失敗しました: {e}")

    query = recordings.insert().values(
        caregiver_id=caregiver_id,
        audio_file_path=file_path,
        memo_text=memo_text,
        ai_status="pending",
        transcription_result=None,
        summary_result=None,
        
        # ★★★ 修正: utcnow() -> now(datetime.UTC) ★★★
        created_at=datetime.datetime.now(datetime.UTC) 
    )
    
    try:
        last_record_id = await database.execute(query)
        return {
            "recording_id": last_record_id,
            "ai_status": "pending",
            "message": "録音データを受け付けました。AI処理待ちです。"
        }
    except Exception as e:
        print(f"DB INSERT エラー: {e}")
        raise HTTPException(status_code=500, detail=f"データベースへの保存に失敗しました: {e}")


@app.get("/my_records", response_model=List[RecordSummary])
async def get_my_records(
    caregiver_id: str
):
    # (Task 6 修正済み: Pydanticモデルが List[Dict] に対応)
    query = recordings.select().where(
        (recordings.c.caregiver_id == caregiver_id) &
        (recordings.c.ai_status == "completed")
    ).order_by(recordings.c.created_at.desc())
    
    try:
        completed_records = await database.fetch_all(query)
        return completed_records
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"記録の取得に失敗しました: {e}")

# Task 7.1 (Task 7.4 バグ修正済み)
@app.post("/authenticate")
async def authenticate_caregiver(
    auth_request: AuthRequest = Body(...)
):
    
    result = None
    try:
        # (バグ修正済み: 401が500にならない)
        query = caregivers.select().where(caregivers.c.caregiver_id == auth_request.caregiver_id)
        result = await database.fetch_one(query)
        
    except Exception as e:
        print(f"認証DBエラー (500): {e}")
        raise HTTPException(status_code=500, detail=f"Authentication error: {e}")

    if result:
        print(f"認証成功: ID {auth_request.caregiver_id}")
        return {"status": "authenticated", "caregiver_id": auth_request.caregiver_id}
    else:
        print(f"認証失敗: ID {auth_request.caregiver_id}")
        raise HTTPException(status_code=401, detail="Caregiver ID not found")

# -----------------------------------------------------------
# 7. サーバーの起動 (開発用)
# -----------------------------------------------------------
if __name__ == "__main__":
    print("開発サーバーを http://127.0.0.1:8000 で起動します")
    
    # ★ Task 7 修正: ngrok プロキシ対応
    uvicorn.run(
        "main:app", # "ファイル名:FastAPIインスタンス名" の文字列形式
        host="127.0.0.1", 
        port=8000,
        proxy_headers=True, # ngrok が追加する X-Forwarded-Host などを信頼する
        forwarded_allow_ips="*" # すべてのIPからのプロキシを許可（開発用）
        # reload=True # (お好みで: コード変更時に自動リロード)
    )