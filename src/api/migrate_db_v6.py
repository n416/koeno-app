import asyncio
import sqlalchemy
from sqlalchemy.engine import create_engine
from sqlalchemy.inspection import inspect
import uuid

# main.py から設定をインポート
try:
    from main import database, DATABASE_URL
except ImportError as e:
    print(f"!!! エラー: main.py のインポートに失敗: {e}")
    exit()

async def run_migration():
    print(f"--- [MIGRATE v6] QRトークンカラムの追加と初期データ生成 ---")
    
    # 1. カラム追加 (Schema Update)
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('caregivers')]
    
    if 'qr_token' not in columns:
        print("カラム 'qr_token' を追加します...")
        async with database.connection() as connection:
            # SQLiteでは ADD COLUMN は一度に1つ
            await connection.execute(sqlalchemy.text("ALTER TABLE caregivers ADD COLUMN qr_token TEXT"))
        print("...カラム追加完了。")
    else:
        print("カラム 'qr_token' は既に存在します。")

    # 2. データ移行 (Data Migration)
    # qr_token が NULL または空のユーザーに UUIDv4 を発行
    print("既存ユーザーのQRトークンを確認中...")
    await database.connect()
    try:
        # まず対象ユーザーを取得
        query_select = "SELECT caregiver_id FROM caregivers WHERE qr_token IS NULL OR qr_token = ''"
        rows = await database.fetch_all(query_select)
        
        if rows:
            print(f"{len(rows)} 名のユーザーにQRトークンを新規発行します...")
            count = 0
            for row in rows:
                cid = row['caregiver_id']
                new_token = str(uuid.uuid4())
                
                # 更新実行
                query_update = "UPDATE caregivers SET qr_token = :token WHERE caregiver_id = :cid"
                await database.execute(query_update, values={"token": new_token, "cid": cid})
                count += 1
            print(f"完了: {count} 件更新しました。")
        else:
            print("更新対象のユーザーはいませんでした（全員発行済み）。")
            
    finally:
        if database.is_connected:
            await database.disconnect()
            print("データベース接続を切断しました。")

if __name__ == "__main__":
    asyncio.run(run_migration())