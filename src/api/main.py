import os
import uvicorn
# ★ List, Optional, Any, Dict, Query をインポート
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Body, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import databases
import sqlalchemy
from pydantic import BaseModel
import datetime # ★ datetime がインポートされていることを確認

# ★★★ デバッグ用 (v2.1) ★★★
import logging
from fastapi.requests import Request
from fastapi.responses import JSONResponse
# ★★★ デバッグ用 (v2.1) ここまで ★★★


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
    # ★★★ 削除 (v2.1) GM指示に基づき、要約は別テーブルで管理 ★★★
    # sqlalchemy.Column("summary_result", sqlalchemy.Text),
    
    sqlalchemy.Column("created_at", sqlalchemy.DateTime), # (defaultはstartupで制御)
)

# ★★★ 新設 (v2.1) ★★★
# GM指示: 画面Aのマーカー と 画面Bのテキストエリア 用のテーブル
care_records = sqlalchemy.Table(
    "care_records",
    metadata,
    sqlalchemy.Column("care_record_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    # (注: v2.1では user_id は "u1", "u2" などのハードコードされた文字列を想定)
    sqlalchemy.Column("user_id", sqlalchemy.String, index=True), 
    sqlalchemy.Column("record_date", sqlalchemy.String, index=True), # (例: "2025-11-09")
    sqlalchemy.Column("final_text", sqlalchemy.Text),
    sqlalchemy.Column("last_updated_by", sqlalchemy.String), # (保存した caregiver_id)
    sqlalchemy.Column("updated_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC))
)


# -----------------------------------------------------------
# 3. Pydanticモデル (APIリクエスト/レスポンス用)
# -----------------------------------------------------------

class RecordingResponse(BaseModel):
    """ アップロード成功時に返すレスポンス """
    recording_id: int
    ai_status: str
    message: str

# ★★★ 削除 (v2.1) ★★★
# class RecordSummary(BaseModel):
#    ... (旧ダッシュボード用モデル)

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
    created_at: Optional[datetime.datetime]


# ★★★ 新設 (v2.1) GM指示に基づく新API用モデル ★★★

# POST /save_care_record のリクエストボディ
class CareRecordInput(BaseModel):
    user_id: str
    record_date: str # (例: "2025-11-09")
    final_text: str

# GET /care_records のレスポンス
class CareRecordDateList(BaseModel):
    dates: List[str] # (例: ["2025-11-05", "2025-11-07"])

# GET /care_record_detail のレスポンス
class CareRecordDetail(BaseModel):
    user_id: str
    record_date: str
    final_text: str
    last_updated_by: Optional[str] = None # ★ Optionalを明示
    updated_at: Optional[datetime.datetime] = None # ★ Optionalを明示

# GET /unassigned_recordings のレスポンス形式
class UnassignedRecording(BaseModel):
    recording_id: int
    caregiver_id: str
    memo_text: Optional[str]
    ai_status: str
    # (文字起こし結果は重いので一覧には含めず、画面Cで別途取得)
    created_at: datetime.datetime

# ★★★ 新設 (v2.1 / Turn 85) ★★★
# GET /recording_transcription/{id} のレスポンス形式
class TranscriptionResponse(BaseModel):
    recording_id: int
    ai_status: str
    # (v2.1では List[Dict] は Pydantic で Any として扱う)
    transcription_result: Optional[Any] 


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

@app.on_event("startup")
async def startup():
    """ サーバー起動時にDBテーブルを作成し、接続する """
    engine = sqlalchemy.create_engine(DATABASE_URL)
    # ★ (v2.1) care_records テーブルもここで作成される
    metadata.create_all(engine) 
    
    await database.connect()
    print("--- データベースに接続し、テーブル定義を確認しました ---")

    # ★★★ デバッグログ (v2.1) ★★★
    print("--- 登録済みAPIルートの確認 ---")
    for route in app.routes:
        if hasattr(route, "path"):
            # (uvicorn実行時のログと重複しないようインデント)
            print(f"  -> PATH: {route.path}, METHODS: {getattr(route, 'methods', 'N/A')}")
    print("--- ルート確認 完了 ---")
    # ★★★ デバッグログ (v2.1) ここまで ★★★

    # ★★★ Task 1.1: ハードコードされたテストID登録ロジックを削除 ★★★
    print("（Task 1.1: ハードコードされたテストIDの登録は行われません）")


@app.on_event("shutdown")
async def shutdown():
    """ サーバー終了時にDBから切断する """
    await database.disconnect()
    print("データベース接続を切断しました。")

# -----------------------------------------------------------
# 6. APIエンドポイント (一般ユーザー)
# -----------------------------------------------------------

# ★★★ v2.1 修正: /api プレフィックスを【削除】 ★★★
@app.get("/")
def read_root():
    return {"status": "KOENO-APP API (v2.1) is running"}

# ★★★ v2.1 修正: /api プレフィックスを【削除】 ★★★
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
        # ★★★ 削除 (v2.1): summary_result の挿入を削除
        
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


# ★★★ 削除 (v2.1) ★★★
# @app.get("/my_records", response_model=List[RecordSummary])
# async def get_my_records(
#     caregiver_id: str
# ):
#    ... (旧ダッシュボード用のAPI)

# Task 7.1 (Task 7.4 バグ修正済み)
# ★★★ v2.1 修正: /api プレフィックスを【削除】 ★★★
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
# 7. ★★★ 新設 (v2.1): PCレビュー画面用 API ( /api プレフィックス【無し】) ★★★
# -----------------------------------------------------------

@app.get("/care_records", response_model=CareRecordDateList)
async def get_care_record_dates(
    user_id: str = Query(...)
):
    """ [v2.1] 画面A用: 特定の入居者の介護記録が「存在する日付」のリストを取得 """
    try:
        query = sqlalchemy.select(care_records.c.record_date).where(
            care_records.c.user_id == user_id
        ).distinct()
        results = await database.fetch_all(query)
        dates = [row.record_date for row in results]
        return {"dates": dates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"記録日付の取得に失敗: {e}")


@app.get("/care_record_detail", response_model=CareRecordDetail)
async def get_care_record_detail(
    user_id: str = Query(...),
    record_date: str = Query(...) # (例: "2025-11-09")
):
    """ [v2.1] 画面B用: 特定の入居者・日付の介護記録テキストを取得 """
    try:
        query = care_records.select().where(
            (care_records.c.user_id == user_id) &
            (care_records.c.record_date == record_date)
        ).order_by(care_records.c.updated_at.desc()).limit(1) # 常に最新のものを1件
        
        result = await database.fetch_one(query)
        
        # ★★★★★ 修正 (Turn 78) ★★★★★
        # GMのご指摘 [n46_p1_55] に従い、404を返さず200 OKと空のデータを返す
        if not result:
            print(f"[API /care_record_detail] 記録なし (user_id: {user_id}, date: {record_date})。デフォルト値を返します。")
            return CareRecordDetail(
                user_id=user_id,
                record_date=record_date,
                final_text="", # (空のテキスト)
                last_updated_by=None,
                updated_at=None
            )
        
        # Pydanticモデルが Optional なので、None の場合も許容される
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"記録詳細の取得に失敗: {e}")


@app.post("/save_care_record", status_code=201)
async def save_care_record(
    record_input: CareRecordInput = Body(...),
    # (PC版Kioskからの呼び出しを想定し、AuthContextからIDを取得)
    caller_id: str = Header(..., alias="X-Caller-ID")
):
    """ [v2.1] 画面B用: 介護記録テキストを保存 (UPSERT: 更新または挿入) """
    try:
        # 1. 既存の記録があるか確認
        query_check = care_records.select().where(
            (care_records.c.user_id == record_input.user_id) &
            (care_records.c.record_date == record_input.record_date)
        )
        existing_record = await database.fetch_one(query_check)
        
        current_time = datetime.datetime.now(datetime.UTC)
        
        if existing_record:
            # 2a. 存在すれば UPDATE
            query_update = care_records.update().where(
                care_records.c.care_record_id == existing_record.care_record_id
            ).values(
                final_text=record_input.final_text,
                last_updated_by=caller_id,
                updated_at=current_time
            )
            await database.execute(query_update)
            return {"status": "updated"}
        else:
            # 2b. 存在しなければ INSERT
            query_insert = care_records.insert().values(
                user_id=record_input.user_id,
                record_date=record_input.record_date,
                final_text=record_input.final_text,
                last_updated_by=caller_id,
                updated_at=current_time
            )
            await database.execute(query_insert)
            return {"status": "created"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"記録の保存に失敗: {e}")


@app.get("/unassigned_recordings", response_model=List[UnassignedRecording])
async def get_unassigned_recordings(
    # ★★★ v2.1 修正 (Turn 82) ★★★
    caregiver_id: str = Query(...),
    record_date: str = Query(...) # (例: "2025-11-09")
):
    """ [v2.1] 画面B用: 未紐づけ録音リストを取得 """
    try:
        # ★★★ v2.1 修正 (Turn 82) ★★★
        # (GM指示: 当該日のデータのみに絞り込む)
        # (SQLiteはDATETIME型を文字列として比較するため、DATE()関数で日付部分のみを抽出)
        query = recordings.select().where(
            (recordings.c.caregiver_id == caregiver_id) &
            (sqlalchemy.func.date(recordings.c.created_at) == record_date)
        ).order_by(recordings.c.created_at.desc())
        
        results = await database.fetch_all(query)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"録音リストの取得に失敗: {e}")

# ★★★ 新設 (v2.1 / Turn 85) ★★★
@app.get("/recording_transcription/{recording_id}", response_model=TranscriptionResponse)
async def get_recording_transcription(
    recording_id: int,
    caller_id: str = Header(..., alias="X-Caller-ID") # (認証用)
):
    """ [v2.1] 画面C用: 単一の録音IDから文字起こし結果(JSON)を取得 """
    try:
        query = recordings.select().where(
            recordings.c.recording_id == recording_id
        )
        result = await database.fetch_one(query)
        
        if not result:
            raise HTTPException(status_code=404, detail="該当の録音IDが見つかりません。")
            
        # (念のため、呼び出し元が所有者か確認)
        if result.caregiver_id != caller_id:
             raise HTTPException(status_code=403, detail="この録音データへのアクセス権がありません。")

        return result # (Pydanticが自動で整形)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文字起こしデータの取得に失敗: {e}")


# -----------------------------------------------------------
# 8. ★★★ Task 8.1: 管理者用 認可Dependency ★★★ ( /api プレフィックス【無し】)
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
# 9. ★★★ Task 1.2 & 8.1: 管理者用CRUDエンドポイント ( /api プレフィックス【無し】) ★★★
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


# ★★★ デバッグログ (v2.1) ★★★
# どのルートにも一致しなかったリクエストをすべてキャッチ
# (注: このハンドラは、他のどの @app ルートよりも「最後」に定義する必要があります)
# ★★★ v2.1 修正: methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"] を追加 ★★★
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
async def log_unmatched_requests(request: Request, full_path: str):
    print(f"--- !!! 404 未定義ルートへのアクセス !!! ---")
    print(f"PATH: /{full_path}")
    print(f"METHOD: {request.method}")
    print(f"HEADERS: {request.headers}")
    print(f"--------------------------------------")
    return JSONResponse(
        status_code=404,
        content={"detail": "Not Found (PMAI Debug: Endpoint not defined)", "requested_path": f"/{full_path}"}
    )


# -----------------------------------------------------------
# 10. サーバーの起動 (開発用)
# -----------------------------------------------------------
if __name__ == "__main__":
    print("開発サーバー(v2.1)を http://127.0.0.1:8000 で起動します")
    
    # ★ Task 7 修正: ngrok プロキシ対応
    uvicorn.run(
        "main:app", # "ファイル名:FastAPIインスタンス名" の文字列形式
        host="127.0.0.1", 
        port=8000,
        proxy_headers=True, # ngrok が追加する X-Forwarded-Host などを信頼する
        forwarded_allow_ips="*" # すべてのIPからのプロキシを許可（開発用）
        # reload=True # (お好みで: コード変更時に自動リロード)
    )