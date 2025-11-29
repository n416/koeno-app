import asyncio
import sqlalchemy
from sqlalchemy.engine import create_engine
from sqlalchemy.inspection import inspect

try:
    from main import database, DATABASE_URL
except ImportError as e:
    print(f"!!! エラー: main.py のインポートに失敗: {e}")
    exit()

async def run_migration():
    print(f"--- [MIGRATE v5] 時系列イベントテーブルの作成 ---")
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    
    # care_events テーブルが存在しなければ作成
    if not inspector.has_table("care_events"):
        print("テーブル 'care_events' を作成します...")
        metadata = sqlalchemy.MetaData()
        
        # 定義 (main.py と合わせる)
        care_events = sqlalchemy.Table(
            "care_events", metadata,
            sqlalchemy.Column("event_id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
            sqlalchemy.Column("user_id", sqlalchemy.String, index=True),
            sqlalchemy.Column("event_timestamp", sqlalchemy.DateTime, index=True), # 発生日時
            sqlalchemy.Column("event_type", sqlalchemy.String), # 'care_touch', 'voice', etc
            sqlalchemy.Column("care_touch_data", sqlalchemy.JSON, nullable=True), # 構造化データ
            sqlalchemy.Column("note_text", sqlalchemy.Text, nullable=True), # 個別メモ
            sqlalchemy.Column("recorded_by", sqlalchemy.String), # 記録者
            sqlalchemy.Column("created_at", sqlalchemy.DateTime), # システム登録日時
        )
        
        metadata.create_all(engine)
        print("完了。")
    else:
        print("テーブル 'care_events' は既に存在します。")

if __name__ == "__main__":
    asyncio.run(run_migration())