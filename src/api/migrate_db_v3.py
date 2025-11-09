import asyncio
import sqlalchemy
from sqlalchemy.engine import create_engine
from sqlalchemy.inspection import inspect

# main.pyからDB定義（接続情報、テーブル定義）をインポート
# (Turn 106 の 'main.py' が 'summary_drafts' を含んでいる前提)
try:
    from main import database, metadata, DATABASE_URL, recordings
except ImportError as e:
    print(f"!!! エラー: main.py のインポートに失敗しました: {e}")
    print("!!! main.py が Turn 106 のコードで保存されているか確認してください。")
    exit()

async def run_migration():
    """
    [v2.1 / Turn 106] DBスキーマを非破壊で更新（マイグレーション）する
    1. recordings に summary_drafts カラムを追加
    """
    
    print(f"--- [MIGRATE v3] データベース '{DATABASE_URL}' への接続を開始します ---")
    engine = create_engine(DATABASE_URL)
    
    # 1. 既存のテーブルを検査
    inspector = inspect(engine)
    try:
        recording_columns = [col['name'] for col in inspector.get_columns('recordings')]
    except sqlalchemy.exc.OperationalError as e:
         print(f"!!! エラー: 'recordings' テーブルの検査に失敗しました: {e}")
         return
         
    print(f"[MIGRATE v3] 'recordings' テーブルの既存カラム: {recording_columns}")

    # 2. 'summary_drafts' カラムの追加 (Turn 106 [n46_p1_106] の要件)
    if 'summary_drafts' not in recording_columns:
        print("[MIGRATE v3] 'recordings' に 'summary_drafts' (JSON/TEXT) カラムを追加します...")
        try:
            async with database.connection() as connection:
                await connection.execute(sqlalchemy.text("ALTER TABLE recordings ADD COLUMN summary_drafts TEXT"))
            print("[MIGRATE v3] ... カラム追加 完了。")
        except Exception as e:
            print(f"!!! [MIGRATE v3] 'summary_drafts' カラムの追加に失敗: {e}")
            return
    else:
        print("[MIGRATE v3] 'summary_drafts' カラムは既に存在します。（スキップ）")

    print("--- [MIGRATE v3] データベースのマイグレーションが完了しました ---")

async def main_async():
    await database.connect()
    try:
        await run_migration()
    finally:
        if database.is_connected:
            await database.disconnect()
            print("[MIGRATE v3] データベース接続を切断しました。")

if __name__ == "__main__":
    print("DBマイグレーションスクリプト (v3 - summary_drafts) を実行します...")
    asyncio.run(main_async())