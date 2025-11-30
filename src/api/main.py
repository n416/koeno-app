import os
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Body, Depends, Header, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional
import databases
import sqlalchemy
from pydantic import BaseModel
import datetime
from datetime import timezone
import uuid

# --- 設定 ---
DATABASE_URL = "sqlite:///./koeno_app.db"
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# --- テーブル定義 ---

# 1. 介護士マスタ
caregivers = sqlalchemy.Table(
    "caregivers", metadata,
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("name", sqlalchemy.String, nullable=True),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC), nullable=True),
    sqlalchemy.Column("qr_token", sqlalchemy.String, nullable=True),
)

# 2. 管理者テーブル
administrators = sqlalchemy.Table(
    "administrators", metadata,
    sqlalchemy.Column("admin_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, sqlalchemy.ForeignKey("caregivers.caregiver_id"), unique=True),
    sqlalchemy.Column("role", sqlalchemy.String, default="owner"),
    sqlalchemy.Column("granted_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC))
)

# 3. 録音データ
recordings = sqlalchemy.Table(
    "recordings", metadata,
    sqlalchemy.Column("recording_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("caregiver_id", sqlalchemy.String, index=True),
    sqlalchemy.Column("audio_file_path", sqlalchemy.String),
    sqlalchemy.Column("memo_text", sqlalchemy.Text),
    sqlalchemy.Column("ai_status", sqlalchemy.String, default="pending", index=True),
    sqlalchemy.Column("transcription_result", sqlalchemy.JSON),
    sqlalchemy.Column("assignment_snapshot", sqlalchemy.JSON, nullable=True),
    sqlalchemy.Column("summary_drafts", sqlalchemy.JSON, nullable=True),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime),
)

# 4. 日報
care_records = sqlalchemy.Table(
    "care_records", metadata,
    sqlalchemy.Column("care_record_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("user_id", sqlalchemy.String, index=True),
    sqlalchemy.Column("record_date", sqlalchemy.String, index=True),
    sqlalchemy.Column("final_text", sqlalchemy.Text),
    sqlalchemy.Column("care_touch_data", sqlalchemy.JSON, nullable=True),
    sqlalchemy.Column("last_updated_by", sqlalchemy.String),
    sqlalchemy.Column("updated_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC))
)

# 5. 録音の紐づけ管理
recording_assignments = sqlalchemy.Table(
    "recording_assignments", metadata,
    sqlalchemy.Column("assignment_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("recording_id", sqlalchemy.Integer, sqlalchemy.ForeignKey("recordings.recording_id"), index=True),
    sqlalchemy.Column("user_id", sqlalchemy.String, index=True),
    sqlalchemy.Column("assigned_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC)),
    sqlalchemy.Column("assigned_by", sqlalchemy.String)
)

# 6. ケアイベント
care_events = sqlalchemy.Table(
    "care_events", metadata,
    sqlalchemy.Column("event_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
    sqlalchemy.Column("user_id", sqlalchemy.String, index=True),
    sqlalchemy.Column("event_timestamp", sqlalchemy.DateTime, index=True),
    sqlalchemy.Column("event_type", sqlalchemy.String, default="care_touch"),
    sqlalchemy.Column("care_touch_data", sqlalchemy.JSON, nullable=True),
    sqlalchemy.Column("note_text", sqlalchemy.Text, nullable=True),
    sqlalchemy.Column("recorded_by", sqlalchemy.String),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, default=datetime.datetime.now(datetime.UTC)),
)

# --- Pydanticモデル ---
class RecordingResponse(BaseModel):
    recording_id: int
    ai_status: str
    message: str

class AuthRequest(BaseModel):
    caregiver_id: str

# ★ 追加: QR認証用リクエストモデル
class QrAuthRequest(BaseModel):
    qr_token: str

class CaregiverInput(BaseModel):
    caregiver_id: str
    name: Optional[str] = None

class CaregiverInfo(BaseModel):
    caregiver_id: str
    name: Optional[str]
    created_at: Optional[datetime.datetime]
    qr_token: Optional[str] = None

class CareRecordInput(BaseModel):
    user_id: str
    record_date: str 
    final_text: str
    care_touch_data: Optional[Dict[str, Any]] = None

class CareRecordDateList(BaseModel):
    dates: List[str] 

class CareRecordDetail(BaseModel):
    user_id: str
    record_date: str
    final_text: str
    care_touch_data: Optional[Dict[str, Any]] = None
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
    transcription_data: Optional[Any]
    summary_drafts: Optional[Dict[str, str]] = None

class AssignmentInput(BaseModel):
    recording_id: int
    user_ids: List[str]
    assignment_snapshot: List[Dict[str, Any]]
    summary_drafts: Dict[str, str]

class AssignedRecording(BaseModel):
    recording_id: int
    caregiver_id: str
    memo_text: Optional[str]
    created_at: datetime.datetime
    assignment_snapshot: Optional[Any] = None
    summary_drafts: Optional[Dict[str, str]] = None

class CareEventInput(BaseModel):
    user_id: str
    event_timestamp: str
    event_type: str = "care_touch"
    care_touch_data: Optional[Dict[str, Any]] = None
    note_text: Optional[str] = None

class CareEventOutput(BaseModel):
    event_id: int
    user_id: str
    event_timestamp: datetime.datetime
    event_type: str
    care_touch_data: Optional[Dict[str, Any]] = None
    note_text: Optional[str] = None
    recorded_by: Optional[str] = None

# --- ライフサイクル管理 ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = sqlalchemy.create_engine(DATABASE_URL)
    metadata.create_all(engine)
    await database.connect()
    print("--- データベース接続完了 ---")
    yield
    await database.disconnect()
    print("データベース接続を切断しました。")

# --- アプリ定義 ---
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        new_path = request.url.path[4:]
        request.scope["path"] = new_path
    response = await call_next(request)
    return response

# --- APIエンドポイント ---

# 1. 録音アップロード
@app.post("/upload_recording", response_model=RecordingResponse)
async def upload_recording(
    audio_blob: UploadFile = File(...),
    caregiver_id: str = Form(...),
    memo_text: str = Form(...),
    created_at_iso: str = Form(...) 
):
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    try:
        client_created_at = datetime.datetime.fromisoformat(created_at_iso)
        created_at_utc = client_created_at.astimezone(timezone.utc)
    except (ValueError, TypeError):
        print(f"警告: ISO日時のパース失敗。サーバー時刻を使用: {created_at_iso}")
        created_at_utc = datetime.datetime.now(timezone.utc)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_id = caregiver_id.replace(":", "_")
    filename = os.path.join(upload_dir, f"{safe_id}_{timestamp}_{audio_blob.filename}")
    with open(filename, "wb") as f:
        f.write(await audio_blob.read())

    query = recordings.insert().values(
        caregiver_id=caregiver_id,
        audio_file_path=os.path.abspath(filename),
        memo_text=memo_text,
        ai_status="pending",
        created_at=created_at_utc
    )
    last_id = await database.execute(query)
    return {"recording_id": last_id, "ai_status": "pending", "message": "Accepted"}

# 2. 認証 (ID入力)
@app.post("/authenticate")
async def authenticate(req: AuthRequest = Body(...)):
    res = await database.fetch_one(caregivers.select().where(caregivers.c.caregiver_id == req.caregiver_id))
    if res: return {"status": "authenticated", "caregiver_id": req.caregiver_id}
    raise HTTPException(401, "ID not found")

# ★ 追加: 認証 (QRトークン)
@app.post("/authenticate_qr")
async def authenticate_qr(req: QrAuthRequest = Body(...)):
    # qr_token で検索
    res = await database.fetch_one(caregivers.select().where(caregivers.c.qr_token == req.qr_token))
    if res:
        # ヒットしたらそのIDを返す
        return {"status": "authenticated", "caregiver_id": res.caregiver_id}
    else:
        # ヒットしなければエラー
        raise HTTPException(401, "Invalid QR Token")

# 3. 日報関連
@app.get("/care_records", response_model=CareRecordDateList)
async def get_dates(user_id: str = Query(...)):
    q = sqlalchemy.select(care_records.c.record_date).where(care_records.c.user_id == user_id).distinct()
    return {"dates": [r.record_date for r in await database.fetch_all(q)]}

@app.get("/care_record_detail", response_model=CareRecordDetail)
async def get_detail(user_id: str = Query(...), record_date: str = Query(...)):
    q = care_records.select().where((care_records.c.user_id == user_id) & (care_records.c.record_date == record_date)).order_by(care_records.c.updated_at.desc()).limit(1)
    res = await database.fetch_one(q)
    if not res: 
        return CareRecordDetail(user_id=user_id, record_date=record_date, final_text="", care_touch_data=None)
    return res

@app.post("/save_care_record", status_code=201)
async def save_record(inp: CareRecordInput = Body(...), caller: str = Header(..., alias="X-Caller-ID")):
    q_check = care_records.select().where((care_records.c.user_id == inp.user_id) & (care_records.c.record_date == inp.record_date))
    exists = await database.fetch_one(q_check)
    now = datetime.datetime.now(datetime.UTC)
    if exists:
        await database.execute(care_records.update().where(care_records.c.care_record_id == exists.care_record_id).values(final_text=inp.final_text, care_touch_data=inp.care_touch_data, last_updated_by=caller, updated_at=now))
        return {"status": "updated"}
    await database.execute(care_records.insert().values(user_id=inp.user_id, record_date=inp.record_date, final_text=inp.final_text, care_touch_data=inp.care_touch_data, last_updated_by=caller, updated_at=now))
    return {"status": "created"}

# 4. 録音管理
@app.get("/unassigned_recordings", response_model=List[UnassignedRecording])
async def get_unassigned(caregiver_id: str = Query(...), record_date: str = Query(...)):
    assigned_ids = [r.recording_id for r in await database.fetch_all(sqlalchemy.select(recording_assignments.c.recording_id).distinct())]
    jst_date = sqlalchemy.func.date(sqlalchemy.func.datetime(recordings.c.created_at, '+9 hours'))
    q = recordings.select().where((recordings.c.caregiver_id == caregiver_id) & (jst_date == record_date))
    if assigned_ids: q = q.where(sqlalchemy.not_(recordings.c.recording_id.in_(assigned_ids)))
    return await database.fetch_all(q.order_by(recordings.c.created_at.desc()))

@app.get("/assigned_recordings", response_model=List[AssignedRecording])
async def get_assigned(user_id: str = Query(...), record_date: str = Query(...)):
    jst_date = sqlalchemy.func.date(sqlalchemy.func.datetime(recordings.c.created_at, '+9 hours'))
    j = sqlalchemy.join(recording_assignments, recordings, recording_assignments.c.recording_id == recordings.c.recording_id)
    q = sqlalchemy.select(recordings.c.recording_id, recordings.c.caregiver_id, recordings.c.memo_text, recordings.c.created_at, recordings.c.assignment_snapshot, recordings.c.summary_drafts).select_from(j).where((recording_assignments.c.user_id == user_id) & (jst_date == record_date)).order_by(recordings.c.created_at.asc())
    return await database.fetch_all(q)

@app.get("/recording_transcription/{recording_id}", response_model=TranscriptionResponse)
async def get_transcription(recording_id: int, caller: str = Header(..., alias="X-Caller-ID")):
    res = await database.fetch_one(recordings.select().where(recordings.c.recording_id == recording_id))
    if not res or res.caregiver_id != caller: raise HTTPException(403, "Access denied")
    return {"recording_id": res.recording_id, "ai_status": res.ai_status, "transcription_data": res.assignment_snapshot or res.transcription_result, "summary_drafts": res.summary_drafts or {}}

@app.post("/save_assignments", status_code=201)
async def save_assign(inp: AssignmentInput = Body(...), caller: str = Header(..., alias="X-Caller-ID")):
    async with database.transaction():
        await database.execute(recording_assignments.delete().where(recording_assignments.c.recording_id == inp.recording_id))
        if inp.user_ids:
            vals = [{"recording_id": inp.recording_id, "user_id": u, "assigned_at": datetime.datetime.now(datetime.UTC), "assigned_by": caller} for u in inp.user_ids]
            await database.execute_many(recording_assignments.insert(), vals)
        await database.execute(recordings.update().where(recordings.c.recording_id == inp.recording_id).values(assignment_snapshot=inp.assignment_snapshot, summary_drafts=inp.summary_drafts))
    return {"status": "success"}

# 5. 時系列イベントAPI
@app.post("/save_event", status_code=201)
async def save_event(inp: CareEventInput = Body(...), caller: str = Header(..., alias="X-Caller-ID")):
    try:
        ts = datetime.datetime.fromisoformat(inp.event_timestamp).astimezone(timezone.utc)
    except:
        ts = datetime.datetime.now(timezone.utc)
    query = care_events.insert().values(user_id=inp.user_id, event_timestamp=ts, event_type=inp.event_type, care_touch_data=inp.care_touch_data, note_text=inp.note_text, recorded_by=caller, created_at=datetime.datetime.now(timezone.utc))
    await database.execute(query)
    return {"status": "created"}

@app.get("/daily_events", response_model=List[CareEventOutput])
async def get_daily_events(user_id: str = Query(...), date: str = Query(...)):
    jst_date = sqlalchemy.func.date(sqlalchemy.func.datetime(care_events.c.event_timestamp, '+9 hours'))
    q = care_events.select().where((care_events.c.user_id == user_id) & (jst_date == date)).order_by(care_events.c.event_timestamp.desc())
    return await database.fetch_all(q)

# 6. 管理者機能
async def verify_admin(caller: str = Header(None, alias="X-Caller-ID")):
    if not caller or not await database.fetch_one(administrators.select().where(administrators.c.caregiver_id == caller)): 
        raise HTTPException(403)
    return caller

@app.get("/admin/caregivers", response_model=List[CaregiverInfo])
async def ad_list(a: str = Depends(verify_admin)):
    return await database.fetch_all(caregivers.select().order_by(caregivers.c.created_at.desc()))

@app.post("/admin/caregivers", response_model=CaregiverInfo)
async def ad_add(i: CaregiverInput = Body(...), a: str = Depends(verify_admin)):
    try:
        new_token = str(uuid.uuid4())
        await database.execute(caregivers.insert().values(caregiver_id=i.caregiver_id, name=i.name, created_at=datetime.datetime.now(datetime.UTC), qr_token=new_token))
        return await database.fetch_one(caregivers.select().where(caregivers.c.caregiver_id == i.caregiver_id))
    except: raise HTTPException(409, "Exists")

@app.delete("/admin/caregivers/{cid}", status_code=204)
async def ad_del(cid: str, a: str = Depends(verify_admin)):
    await database.execute(caregivers.delete().where(caregivers.c.caregiver_id == cid))

@app.post("/admin/caregivers/{cid}/reset_qr", response_model=CaregiverInfo)
async def ad_reset_qr(cid: str, a: str = Depends(verify_admin)):
    user = await database.fetch_one(caregivers.select().where(caregivers.c.caregiver_id == cid))
    if not user: raise HTTPException(404, "User not found")
    new_token = str(uuid.uuid4())
    await database.execute(caregivers.update().where(caregivers.c.caregiver_id == cid).values(qr_token=new_token))
    return await database.fetch_one(caregivers.select().where(caregivers.c.caregiver_id == cid))

# --- フロントエンド配信 ---
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "../web-v2/dist")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
    @app.exception_handler(404)
    async def spa_fallback(req, exc):
        if req.url.path.startswith("/api") or req.url.path.startswith("/upload_recording"): return await app.exception_handler(404)(req, exc)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, proxy_headers=True, forwarded_allow_ips="*")