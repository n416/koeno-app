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

# (デバッグ用 imports は削除)

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

# Task 7.1: caregivers (変更なし)
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

# Task 8.1: administrators (変更なし)
administrators = sqlalchemy.Table(
    "administrators",
    metadata,
    sqlalchemy.Column("admin_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    # (FK: caregivers.caregiver_id に連動)
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, sqlalchemy.ForeignKey("caregivers.caregiver_id"), unique=True),
    sqlalchemy.Column("role", sqlalchemy.String, default="owner"), # (例: 'owner', 'manager')
    sqlalchemy.Column("granted_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC))
)


# Task 1: recordings (v2.1 最終版)
recordings = sqlalchemy.Table(
    "recordings",
    metadata,
    sqlalchemy.Column("recording_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, index=True),
    
    sqlalchemy.Column("audio_file_path", sqlalchemy.String), 
    sqlalchemy.Column("memo_text", sqlalchemy.Text),
    
    sqlalchemy.Column("ai_status", sqlalchemy.String, default="pending", index=True),
    
    sqlalchemy.Column("transcription_result", sqlalchemy.JSON), # (List[Dict] を想定)
    # (summary_result は削除)
    
    # ★ (v2.1 / Turn 96)
    sqlalchemy.Column("assignment_snapshot", sqlalchemy.JSON, nullable=True),
    
    # ★★★ 新設 (v2.1 / Turn 106) ★★★
    # 画面Cの要約テキスト [n46_p1_106] ({"u1": "...", "u3": "..."}) を保存
    sqlalchemy.Column("summary_drafts", sqlalchemy.JSON, nullable=True),
    
    sqlalchemy.Column("created_at", sqlalchemy.DateTime), # (defaultはstartupで制御)
)

# v2.1: care_records (変更なし)
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

# v2.1: recording_assignments (変更なし)
recording_assignments = sqlalchemy.Table(
    "recording_assignments",
    metadata,
    sqlalchemy.Column("assignment_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    # (どの録音が)
    sqlalchemy.Column("recording_id", sqlalchemy.Integer, sqlalchemy.ForeignKey("recordings.recording_id"), index=True),
    # (どの入居者に紐づいたか)
    sqlalchemy.Column("user_id", sqlalchemy.String, index=True), 
    sqlalchemy.Column("assigned_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC)),
    sqlalchemy.Column("assigned_by", sqlalchemy.String) # (保存した caregiver_id)
)


# -----------------------------------------------------------
# 3. Pydanticモデル (APIリクエスト/レスポンス用)
# -----------------------------------------------------------

class RecordingResponse(BaseModel):
    recording_id: int
    ai_status: str
    message: str

# (v2.1 旧UI用モデルは削除)

class AuthRequest(BaseModel):
    caregiver_id: str

class CaregiverInput(BaseModel):
    caregiver_id: str
    name: Optional[str] = None

class CaregiverInfo(BaseModel):
    caregiver_id: str
    name: Optional[str]
    created_at: Optional[datetime.datetime]

# (v2.1 新API用モデル)
class CareRecordInput(BaseModel):
    user_id: str
    record_date: str 
    final_text: str

class CareRecordDateList(BaseModel):
    dates: List[str] 

class CareRecordDetail(BaseModel):
    user_id: str
    record_date: str
    final_text: str
    last_updated_by: Optional[str] = None 
    updated_at: Optional[datetime.datetime] = None 

class UnassignedRecording(BaseModel):
    recording_id: int
    caregiver_id: str
    memo_text: Optional[str]
    ai_status: str
    created_at: datetime.datetime

class TranscriptionResponse(BaseModel):
    recording_id: int
    ai_status: str
    # ★★★ 修正 (v2.1 / Turn 106) ★★★
    transcription_data: Optional[Any] # (生の文字起こし結果か、編集済みのスナップショット)
    summary_drafts: Optional[Dict[str, str]] = None # (保存済みの要約テキスト)


class AssignmentInput(BaseModel):
    recording_id: int
    user_ids: List[str] # (例: ["u1", "u3"])
    assignment_snapshot: List[Dict[str, Any]] # (画面Cの tableRows)
    # ★★★ 新設 (v2.1 / Turn 106) ★★★
    summary_drafts: Dict[str, str] # (画面Cの summaryTexts)


class AssignedRecording(BaseModel):
    recording_id: int
    caregiver_id: str
    memo_text: Optional[str]
    created_at: datetime.datetime


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
    metadata.create_all(engine) 
    
    await database.connect()
    print("--- データベースに接続し、テーブル定義を確認しました ---")
    # (デバッグログは削除)
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
    return {"status": "KOENO-APP API (v2.1) is running"}

@app.post("/upload_recording", response_model=RecordingResponse)
async def upload_recording(
    audio_blob: UploadFile = File(...),
    caregiver_id: str = Form(...),
    memo_text: str = Form(...)
):
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_caregiver_id = caregiver_id.replace(":", "_").replace("/", "_").replace("\\", "_")
    safe_filename = audio_blob.filename.replace(":", "_").replace("/", "_").replace("\\", "_")
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
        audio_file_path=absolute_file_path, 
        memo_text=memo_text,
        ai_status="pending",
        transcription_result=None,
        assignment_snapshot=None, # (v2.1 / Turn 96)
        summary_drafts=None, # ★ (v2.1 / Turn 106)
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


@app.post("/authenticate")
async def authenticate_caregiver(
    auth_request: AuthRequest = Body(...)
):
    
    result = None
    try:
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
        
        if not result:
            # (GM指示 [n46_p1_55] 準拠: 404を返さず200 OKと空データを返す)
            return CareRecordDetail(
                user_id=user_id,
                record_date=record_date,
                final_text="", # (空のテキスト)
                last_updated_by=None,
                updated_at=None
            )
        
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"記録詳細の取得に失敗: {e}")


@app.post("/save_care_record", status_code=201)
async def save_care_record(
    record_input: CareRecordInput = Body(...),
    caller_id: str = Header(..., alias="X-Caller-ID")
):
    """ [v2.1] 画面B用: 介護記録テキストを保存 (UPSERT: 更新または挿入) """
    try:
        query_check = care_records.select().where(
            (care_records.c.user_id == record_input.user_id) &
            (care_records.c.record_date == record_input.record_date)
        )
        existing_record = await database.fetch_one(query_check)
        
        current_time = datetime.datetime.now(datetime.UTC)
        
        if existing_record:
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
    caregiver_id: str = Query(...),
    record_date: str = Query(...) # (例: "2025-11-09")
):
    """ [v2.1] 画面B用: 未紐づけ録音リストを取得 """
    
    try:
        # 1. 既に割り当て済みの recording_id のリストを取得
        query_assigned_ids = sqlalchemy.select(
            recording_assignments.c.recording_id
        ).distinct()
        assigned_ids_result = await database.fetch_all(query_assigned_ids)
        assigned_ids = [row.recording_id for row in assigned_ids_result]
        
        # 2. (GM指示: 当該日のデータのみに絞り込む)
        query = recordings.select().where(
            (recordings.c.caregiver_id == caregiver_id) &
            (sqlalchemy.func.date(recordings.c.created_at) == record_date)
        )
        
        # (v2.1 / Turn 99 バグ修正)
        if assigned_ids:
             query = query.where(
                 (sqlalchemy.not_(recordings.c.recording_id.in_(assigned_ids)))
             )
        
        query = query.order_by(recordings.c.created_at.desc())
        
        results = await database.fetch_all(query)
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"録音リストの取得に失敗: {e}")

@app.get("/assigned_recordings", response_model=List[AssignedRecording])
async def get_assigned_recordings(
    user_id: str = Query(...),
    record_date: str = Query(...)
):
    """ [v2.1] 画面B用: 指定した入居者・日付に紐づく録音リストを取得 """
    try:
        j = sqlalchemy.join(
            recording_assignments,
            recordings,
            recording_assignments.c.recording_id == recordings.c.recording_id
        )
        query = sqlalchemy.select(
           recordings.c.recording_id,
           recordings.c.caregiver_id,
           recordings.c.memo_text,
           recordings.c.created_at
        ).select_from(j).where(
            (recording_assignments.c.user_id == user_id) &
            # (v2.1 / Turn 94 修正)
            (sqlalchemy.func.date(recordings.c.created_at) == record_date)
        ).order_by(recordings.c.created_at.asc())
        
        results = await database.fetch_all(query)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"紐づけ済み録音の取得に失敗: {e}")


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
            
        if result.caregiver_id != caller_id:
             raise HTTPException(status_code=403, detail="この録音データへのアクセス権がありません。")

        # (v2.1 / Turn 96)
        transcription_data = result.assignment_snapshot or result.transcription_result
        
        return {
            "recording_id": result.recording_id,
            "ai_status": result.ai_status,
            "transcription_data": transcription_data,
            # ★★★ 修正 (v2.1 / Turn 106) ★★★
            "summary_drafts": result.summary_drafts or {}
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文字起こしデータの取得に失敗: {e}")


@app.post("/save_assignments", status_code=201)
async def save_assignments(
    assignment_input: AssignmentInput = Body(...),
    caller_id: str = Header(..., alias="X-Caller-ID")
):
    """ [v2.1] 画面C用: 録音IDと入居者IDの紐付けを上書き保存 """
    
    recording_id = assignment_input.recording_id
    user_ids = assignment_input.user_ids
    
    async with database.transaction():
        try:
            # 1. 古い割り当てを「すべて削除」
            query_delete = recording_assignments.delete().where(
                recording_assignments.c.recording_id == recording_id
            )
            await database.execute(query_delete)
            
            # 2. 新しい割り当てを挿入
            if user_ids:
                current_time = datetime.datetime.now(datetime.UTC)
                new_assignments = []
                for user_id in user_ids:
                    new_assignments.append({
                        "recording_id": recording_id,
                        "user_id": user_id,
                        "assigned_at": current_time,
                        "assigned_by": caller_id
                    })
                
                query_insert = recording_assignments.insert()
                await database.execute_many(query_insert, new_assignments)
            
            # ★★★ 修正 (v2.1 / Turn 106) ★★★
            # 3. 画面Cの編集結果（スナップショットと要約）を recordings テーブルに保存
            query_update_snapshot = recordings.update().where(
                recordings.c.recording_id == recording_id
            ).values(
                assignment_snapshot=assignment_input.assignment_snapshot,
                summary_drafts=assignment_input.summary_drafts # ★ 追加
            )
            await database.execute(query_update_snapshot)
            # ★★★ 修正ここまで ★★★

            return {"status": "success", "recording_id": recording_id, "assigned_users": user_ids}

        except Exception as e:
            print(f"!!! 割り当て保存エラー: {e}")
            raise HTTPException(status_code=500, detail=f"割り当ての保存に失敗しました: {e}")


# -----------------------------------------------------------
# 8. 管理者用 認可Dependency (変更なし)
# -----------------------------------------------------------

async def verify_admin(x_caller_id: str = Header(None)):
    if x_caller_id is None:
        print("管理者API 認可エラー: X-Caller-ID ヘッダーがありません。")
        raise HTTPException(status_code=401, detail="Unauthorized: X-Caller-ID header is missing")
    try:
        query = administrators.select().where(administrators.c.caregiver_id == x_caller_id)
        result = await database.fetch_one(query)
        if not result:
            print(f"管理者API 認可エラー: ID {x_caller_id} には管理者権限がありません。")
            raise HTTPException(status_code=403, detail="Forbidden: User does not have admin privileges")
        return x_caller_id 
    except Exception as e:
        print(f"管理者API 認可エラー (500): {e}")
        raise HTTPException(status_code=500, detail=f"Authorization check failed: {e}")

# -----------------------------------------------------------
# 9. 管理者用CRUDエンドポイント (変更なし)
# -----------------------------------------------------------

@app.get("/admin/caregivers", response_model=List[CaregiverInfo])
async def admin_get_caregivers(
    admin_id: str = Depends(verify_admin) # ★ Task 8.1 適用
):
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
    try:
        query = caregivers.insert().values(
            caregiver_id=caregiver_input.caregiver_id,
            name=caregiver_input.name,
            created_at=datetime.datetime.now(datetime.UTC) # ← 明示的に指定
        )
        await database.execute(query)
        query_result = caregivers.select().where(caregivers.c.caregiver_id == caregiver_input.caregiver_id)
        created_record = await database.fetch_one(query_result)
        return created_record
    except sqlalchemy.exc.IntegrityError:
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
    try:
        query_check = caregivers.select().where(caregivers.c.caregiver_id == caregiver_id)
        existing = await database.fetch_one(query_check)
        if not existing:
            print(f"管理者API (DELETE) エラー: ID {caregiver_id} が見つかりません。")
            raise HTTPException(status_code=404, detail=f"ID '{caregiver_id}' が見つかりません。")
        query = caregivers.delete().where(caregivers.c.caregiver_id == caregiver_id)
        await database.execute(query)
        print(f"管理者API (DELETE): ID {caregiver_id} を削除しました。")
        return
    except Exception as e:
        print(f"管理者API (DELETE) エラー: {e}")
        raise HTTPException(status_code=500, detail=f"IDの削除に失敗しました: {e}")


# ★★★ デバッグログ (v2.1) 削除 ★★★
# (キャッチオールルートを削除)


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