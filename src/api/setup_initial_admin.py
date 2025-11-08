import asyncio
import datetime
import sqlalchemy

# main.py からDB定義（接続情報、テーブル定義）をインポート
from main import database, caregivers, administrators, metadata, DATABASE_URL

async def main():
    """
    [Task 8.2] 対話形式で初回管理者を登録するスクリプト
    """
    print("--- KOENO-APP: 初回管理者セットアップ ---")
    
    # --- 1. DBテーブルのセットアップ ---
    # (スクリプトを単体実行してもテーブルが作成されるように)
    try:
        engine = sqlalchemy.create_engine(DATABASE_URL)
        metadata.create_all(engine)
        print(f"データベース '{DATABASE_URL}' のテーブル定義を確認しました。")
    except Exception as e:
        print(f"エラー: DBテーブルの定義に失敗しました: {e}")
        return

    # --- 2. ユーザー入力の受付 ---
    print("\nシステムの「最初の管理者」となるユーザー情報を入力してください。")
    caregiver_id = input("1. 管理者のID（NFCカードID または PINコード）: ").strip()
    name = input("2. 管理者の名前（表示名）: ").strip()
    role = "owner" # (PO 1.1 の例に基づき 'owner' で固定)

    if not caregiver_id or not name:
        print("\nエラー: IDと名前の両方が必要です。処理を中断します。")
        return

    # --- 3. DB登録処理 ---
    try:
        await database.connect()
        print(f"\nID: {caregiver_id} ({name}) を登録しています...")

        # データベースのトランザクション内で実行
        async with database.transaction():
            
            # --- (A) caregivers テーブルへの登録 (存在しない場合のみ) ---
            query_cg_check = caregivers.select().where(caregivers.c.caregiver_id == caregiver_id)
            existing_cg = await database.fetch_one(query_cg_check)
            
            if not existing_cg:
                # 存在しない場合のみ、caregivers に新規登録
                query_cg_insert = caregivers.insert().values(
                    caregiver_id=caregiver_id,
                    name=name,
                    created_at=datetime.datetime.now(datetime.UTC)
                )
                await database.execute(query_cg_insert)
                print(f"-> 'caregivers' テーブルに ID {caregiver_id} を登録しました。")
            else:
                print(f"-> 'caregivers' テーブルには ID {caregiver_id} は既に存在します。（スキップ）")

            # --- (B) administrators テーブルへの登録 (存在しない場合のみ) ---
            query_admin_check = administrators.select().where(administrators.c.caregiver_id == caregiver_id)
            existing_admin = await database.fetch_one(query_admin_check)
            
            if not existing_admin:
                # 存在しない場合のみ、administrators に新規登録
                query_admin_insert = administrators.insert().values(
                    caregiver_id=caregiver_id,
                    role=role,
                    granted_at=datetime.datetime.now(datetime.UTC)
                )
                await database.execute(query_admin_insert)
                print(f"-> 'administrators' テーブルに ID {caregiver_id} を '{role}' として登録しました。")
            else:
                print(f"-> 'administrators' テーブルには ID {caregiver_id} は既に登録されています。（スキップ）")

        print("\n--- 正常に完了しました ---")
        print(f"ID: {caregiver_id} ({name}) がシステム管理者（{role}）として設定されました。")

    except Exception as e:
        print(f"\n!!! エラー: データベース処理中に失敗しました: {e}")
    finally:
        if database.is_connected:
            await database.disconnect()
            print("データベース接続を切断しました。")

if __name__ == "__main__":
    # (Windowsで async/await を使うための標準的な記述)
    asyncio.run(main())