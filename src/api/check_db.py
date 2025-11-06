import asyncio
from main import database, recordings

async def check_database():
    """
    recordings テーブルの内容を読み出してコンソールに表示する
    """
    try:
        await database.connect()
        
        # recordings テーブルから全てのレコードを選択
        query = recordings.select()
        results = await database.fetch_all(query)
        
        if not results:
            print("DB_CHECK: 'recordings' テーブルは空です。")
            return

        print("--- 'koeno_app.db' の 'recordings' テーブル内容 ---")
        print("-----------------------------------------------------")
        print("| ID | Caregiver ID         | AI Status   |")
        print("-----------------------------------------------------")
        
        for row in results:
            # (辞書ライクなアクセス)
            print(f"| {row['recording_id']:<2} | {row['caregiver_id']:<20} | {row['ai_status']:<11} |")
            
        print("-----------------------------------------------------")

    except Exception as e:
        print(f"DB_CHECK: データベースの読み込みに失敗しました: {e}")
    finally:
        if database.is_connected:
            await database.disconnect()

if __name__ == "__main__":
    print("DB_CHECK: データベースに接続して 'recordings' テーブルを読み込みます...")
    asyncio.run(check_database())