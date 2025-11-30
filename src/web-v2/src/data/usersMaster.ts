// src/data/usersMaster.ts

export interface User {
  id: string;
  name: string;        // フルネーム (例: 佐藤 タロウ)
  displayName: string; // 表示名 (例: 佐藤 様)
  room: string;        // 居室番号
  adl: string;         // ADL状態
  color: string;       // UI用カラーコード
}

export const USERS_MASTER: User[] = [
  { 
    id: 'u1', 
    name: '佐藤 タロウ', 
    displayName: '佐藤 様', 
    room: '101', 
    adl: '自立', 
    color: '#28a745' 
  },
  { 
    id: 'u2', 
    name: '鈴木 ハナコ', 
    displayName: '鈴木 様', 
    room: '102', 
    adl: '一部介助', 
    color: '#17a2b8' 
  },
  { 
    id: 'u3', 
    name: '田中 ジロウ', 
    displayName: '田中 様', 
    room: '103', 
    adl: '全介助', 
    color: '#ffc107' 
  },
  { 
    id: 'u4', 
    name: '高橋 サブロウ', 
    displayName: '高橋 様', 
    room: '105', 
    adl: '見守り', 
    color: '#fd7e14' 
  },
  { 
    id: 'u5', 
    name: '渡辺 シロウ', 
    displayName: '渡辺 様', 
    room: '106', 
    adl: '自立', 
    color: '#6c757d' 
  },
  { 
    id: 'u6', 
    name: '伊藤 ゴロウ', 
    displayName: '伊藤 様', 
    room: '107', 
    adl: '全介助', 
    color: '#343a40' 
  }
];

/**
 * IDからユーザーを検索するヘルパー関数
 */
export const getUserById = (id: string | undefined): User | undefined => {
  return USERS_MASTER.find(u => u.id === id);
};