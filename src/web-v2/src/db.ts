/*
 * ファイルパス: src/db.ts
 * (Task 2 で作成したファイル)
 */
import Dexie, { type Table } from 'dexie';

/**
 * Task 2.2: ローカルDB (IndexedDB) スキーマ
 * ★★★ 修正: GM指摘に基づき、string (ISO) ではなく Date オブジェクトで保存 ★★★
 */
export interface LocalRecording {
  local_id?: number;         // (主キー, auto-incrementing)
  caregiver_id: string;   // (セッションID)
  audio_blob: Blob;         // (録音データ)
  memo_text: string;      // (メモ)
  upload_status: 'pending' | 'uploaded'; // (例: pending, uploaded)
  created_at: Date;       // ★ JSTの Date オブジェクト
}

export class KoenoDexie extends Dexie {
  // 'local_recordings' テーブルを定義
  local_recordings!: Table<LocalRecording>; 

  constructor() {
    super('koenoAppDatabase');
    this.version(1).stores({
      // スキーマ定義:
      // ++local_id (AutoIncrement PK), caregiver_id (Index), upload_status (Index)
      // ★★★ 修正: created_at をインデックスに追加 ★★★
      local_recordings: '++local_id, caregiver_id, upload_status, created_at',
    });
    
    // (v2 へのマイグレーションは不要)
  }
}

export const db = new KoenoDexie();