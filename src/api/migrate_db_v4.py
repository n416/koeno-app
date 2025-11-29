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
    print(f"--- [MIGRATE v4] DB接続: {DATABASE_URL} ---")
    engine = create_engine(DATABASE_URL)
    
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('care_records')]
    print(f"既存カラム: {columns}")

    if 'care_touch_data' not in columns:
        print("カラム 'care_touch_data' を追加します...")
        async with database.connection() as connection:
            await connection.execute(sqlalchemy.text("ALTER TABLE care_records ADD COLUMN care_touch_data TEXT"))
        print("完了。")
    else:
        print("カラムは既に存在します。")

if __name__ == "__main__":
    asyncio.run(run_migration())