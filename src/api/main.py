import os
import uvicorn
# ★ Task 8.1: Depends, Header をインポート
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Body, Depends, Header
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
    
    # ★★★ v1.8 エラー修正: nullable=True を追加 ★★★
    sqlalchemy.Column(
        "created_at", 
        sqlalchemy.DateTime, 
        default=datetime.datetime.now(datetime.UTC), 
        nullable=True # (古いデータがNULLでも許容)
    ),
)

# ★★★ Task 8.1 【PO 1.1】: administrators テーブルの定義 ★★★
administrators = sqlalchemy.Table(
    "administrators",
    metadata,
    sqlalchemy.Column("admin_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    # (FK: caregivers.caregiver_id に連動)
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, sqlalchemy.ForeignKey("caregivers.caregiver_id"), unique=True),
    sqlalchemy.Column("role", sqlalchemy.String, default="owner"), # (例: 'owner', 'manager')
    sqlalchemy.Column("granted_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC))
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

# ★★★ Task 1.2: /admin/caregivers (POST) リクエストのボディ ★★★
class CaregiverInput(BaseModel):
    caregiver_id: str
    name: Optional[str] = None

# ★★★ Task 1.2: /admin/caregivers (GET) レスポンスの形式 ★★★
class CaregiverInfo(BaseModel):
    caregiver_id: str
    name: Optional[str]
    # ★★★ v1.8 エラー修正: Optional[datetime.datetime] に変更 ★★★
    created_at: Optional[datetime.datetime]


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
    # ★ (Task 8.1) administrators テーブルもここで作成される
    metadata.create_all(engine) 
    
    await database.connect()
    print("データベースに接続し、テーブル定義を確認しました。")

    # ★★★ Task 1.1: ハードコードされたテストID登録ロジックを削除 ★★★
    # (ここにあった 'pin-user', '1234', '3f:12:53:0d' の登録処理を削除)
    print("（Task 1.1: ハードコードされたテストIDの登録は行われません）")


@app.on_event("shutdown")
async def shutdown():
    """ サーバー終了時にDBから切断する """
    await database.disconnect()
    print("データベース接続を切断しました。")

# -----------------------------------------------------------
# 6. APIエンドポイント (一般ユーザー)
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
    
    # (v1.7 修正: ファイル名のコロンを置換)
    safe_caregiver_id = caregiver_id.replace(":", "_").replace("/", "_").replace("\\", "_")
    safe_filename = audio_blob.filename.replace(":", "_").replace("/", "_").replace("\\", "_")
    
    # (v1.7 修正: 絶対パスを使用)
    relative_file_path = os.path.join(upload_dir, f"{safe_caregiver_id}_{timestamp}_{safe_filename}")
    absolute_file_path = os.path.abspath(relative_file_path)

    try:
        with open(absolute_file_path, "wb") as f:
            f.write(await audio_blob.read())
    except Exception as e:
        print(f"!!! ファイル保存エラー: {e} (Path: {absolute_file_path})") 
        raise HTTPException(status_code=500, detail=f"音声ファイルの保存に失敗しました: {e}")

    query = recordings.insert().values(
        caregiver_id=caregiver_id,
        audio_file_path=absolute_file_path, # (絶対パスを保存)
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
        print(f"!!! DB INSERT エラー: {e}")
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
# 7. ★★★ Task 8.1: 管理者用 認可Dependency ★★★
# -----------------------------------------------------------

async def verify_admin(x_caller_id: str = Header(None)):
    """
    [Task 8.1] API実行者が管理者テーブルに存在するか確認するDependency
    (PO 1.2 の指示に基づき、X-Caller-ID ヘッダーで簡易的に実行者を特定)
    """
    if x_caller_id is None:
        print("管理者API 認可エラー: X-Caller-ID ヘッダーがありません。")
        raise HTTPException(status_code=401, detail="Unauthorized: X-Caller-ID header is missing")

    try:
        query = administrators.select().where(administrators.c.caregiver_id == x_caller_id)
        result = await database.fetch_one(query)
        
        if not result:
            print(f"管理者API 認可エラー: ID {x_caller_id} には管理者権限がありません。")
            raise HTTPException(status_code=403, detail="Forbidden: User does not have admin privileges")
        
        # 権限があればIDを返す (API側では利用しないが、将来的な拡張用)
        return x_caller_id 

    except Exception as e:
        print(f"管理者API 認可エラー (500): {e}")
        raise HTTPException(status_code=500, detail=f"Authorization check failed: {e}")


# -----------------------------------------------------------
# 8. ★★★ Task 1.2 & 8.1: 管理者用CRUDエンドポイント (認可適用) ★★★
# -----------------------------------------------------------

@app.get("/admin/caregivers", response_model=List[CaregiverInfo])
async def admin_get_caregivers(
    admin_id: str = Depends(verify_admin) # ★ Task 8.1 適用
):
    """ [Task 1.2] 介護士IDマスタを一覧取得 """
    try:
        query = caregivers.select().order_by(caregivers.c.created_at.desc())
        all_caregivers = await database.fetch_all(query)
        return all_caregivers
    except Exception as e:
        print(f"管理者API (GET) エラー: {e}")
        raise HTTPException(status_code=500, detail=f"ID一覧の取得に失敗しました: {e}")

@app.post("/admin/caregivers", response_model=CaregiverInfo)
async def admin_create_caregiver(
    caregiver_input: CaregiverInput = Body(...),
    admin_id: str = Depends(verify_admin) # ★ Task 8.1 適用
):
    """ [Task 1.2] 新しい介護士IDを登録 """
    try:
        # ★★★ v1.8 エラー修正: datetime.datetime.now(datetime.UTC) を明示的に指定 ★★★
        query = caregivers.insert().values(
            caregiver_id=caregiver_input.caregiver_id,
            name=caregiver_input.name,
            created_at=datetime.datetime.now(datetime.UTC) # ← 明示的に指定
        )
        await database.execute(query)
        
        # 登録結果を再取得して返す
        query_result = caregivers.select().where(caregivers.c.caregiver_id == caregiver_input.caregiver_id)
        created_record = await database.fetch_one(query_result)
        
        return created_record
        
    except sqlalchemy.exc.IntegrityError:
        # (主キー重複エラー)
        print(f"管理者API (POST) エラー: ID {caregiver_input.caregiver_id} は既に存在します。")
        raise HTTPException(status_code=409, detail=f"ID '{caregiver_input.caregiver_id}' は既に存在します。")
    except Exception as e:
        print(f"管理者API (POST) エラー: {e}")
        raise HTTPException(status_code=500, detail=f"IDの登録に失敗しました: {e}")

@app.delete("/admin/caregivers/{caregiver_id}", status_code=204)
async def admin_delete_caregiver(
    caregiver_id: str,
    admin_id: str = Depends(verify_admin) # ★ Task 8.1 適用
):
    """ [Task 1.2] 介護士IDを削除 """
    try:
        # 削除対象が存在するか確認
        query_check = caregivers.select().where(caregivers.c.caregiver_id == caregiver_id)
        existing = await database.fetch_one(query_check)
        
        if not existing:
            print(f"管理者API (DELETE) エラー: ID {caregiver_id} が見つかりません。")
            raise HTTPException(status_code=404, detail=f"ID '{caregiver_id}' が見つかりません。")

        # 削除実行
        query = caregivers.delete().where(caregivers.c.caregiver_id == caregiver_id)
        await database.execute(query)
        
        print(f"管理者API (DELETE): ID {caregiver_id} を削除しました。")
        return # (204 No Content が自動で返る)

    except Exception as e:
        print(f"管理者API (DELETE) エラー: {e}")
        raise HTTPException(status_code=500, detail=f"IDの削除に失敗しました: {e}")


# -----------------------------------------------------------
# 9. サーバーの起動 (開発用)
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