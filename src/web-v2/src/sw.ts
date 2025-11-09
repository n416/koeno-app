/// <reference lib="WebWorker" />
import { precacheAndRoute } from 'workbox-precaching'
import { db } from './db' // Dexie (IndexedDB)

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any }

// .env から API のベース URL を取得 ( "/api" または undefined が入る)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

console.log('[SW] サービスワーカー (v2-full, env, proxy) が読み込まれました。')
console.log(`[SW] API_BASE_URL: ${API_BASE_URL}`)
console.log(`[SW] 開発モード(DEV): ${import.meta.env.DEV}`)

// 1. PWAのファイルキャッシュ (Workbox)
// ★★★★★ 修正 ★★★★★
// (if (!import.meta.env.DEV) の分岐を削除し、元の状態に戻す)
precacheAndRoute(self.__WB_MANIFEST || [])
// ★★★★★ 修正ここまで ★★★★★

// 2. 'install' イベント (すぐに有効化)
self.addEventListener('install', () => {
  console.log('[SW] \'install\' イベント発生。skipWaiting() します。')
  self.skipWaiting()
})

// 3. 'activate' イベント (すぐに制御を奪う)
self.addEventListener('activate', (event: any) => {
  console.log('[SW] \'activate\' イベント発生。clients.claim() します。')
  event.waitUntil(self.clients.claim())
})

// 4. 'sync' イベント (Background Sync)
const SYNC_TAG = 'koeno-sync'

/**
 * ★ サービスワーカー内で実行される「バックグラウンド同期」処理 ★
 */
const processSyncQueue = async () => {
  console.log('[SW] processSyncQueue が呼び出されました。');

  // ★ 修正: 相対パス (プロキシ 経由) にする
  const API_URL = `${API_BASE_URL}/upload_recording`; // -> /api/upload_recording

  try {
    const pendingRecords = await db.local_recordings.where('upload_status').equals('pending').toArray();
    
    if (pendingRecords.length === 0) {
      console.log('[SW] 同期対象のデータはありませんでした。');
      return; // 正常終了
    }

    console.log(`[SW] ${pendingRecords.length} 件のデータをアップロードします...`);
    
    const uploadPromises = pendingRecords.map(async (record) => {
      if (!record.local_id) return; // 型ガード

      const formData = new FormData();
      formData.append('caregiver_id', record.caregiver_id);
      formData.append('memo_text', record.memo_text); // (v2.2では空文字)
      formData.append('audio_blob', record.audio_blob, 'recording.webm');
      
      // ★★★ タイムゾーン修正 ★★★
      // (Date オブジェクトを ISO 文字列に変換して送信)
      formData.append('created_at_iso', record.created_at.toISOString());

      try {
        // (API_URL が /api/upload_recording になっている)
        const response = await fetch(API_URL, { method: 'POST', body: formData });
        
        if (response.ok) {
          // アップロード成功
          await db.local_recordings.update(record.local_id, { upload_status: 'uploaded' });
          console.log(`[SW] ${record.local_id} のアップロード成功。`);
        } else {
          // サーバーが 404 や 500 を返した場合
          console.error(`[SW] ${record.local_id} のアップロード失敗 (サーバーエラー):`, response.status);
        }
      } catch (fetchError) {
        // ネットワークエラー (APIサーバーが落ちている場合など)
        console.error(`[SW] ${record.local_id} のアップロード失敗 (ネットワーク):`, fetchError);
        throw fetchError;
      }
    });

    await Promise.all(uploadPromises);
    
    console.log('[SW] 同期処理が完了しました。');

  } catch (error) {
    console.error('[SW] 同期キューの処理中にエラーが発生しました:', error);
    throw new Error('Sync processing failed, will retry.');
  }
};

// 'sync' イベントリスナー
self.addEventListener('sync', (event: any) => {
  console.log(`[SW] 'sync' イベントを受信しました！ タグ: ${event.tag}`);
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processSyncQueue());
  }
});