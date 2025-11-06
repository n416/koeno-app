import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { db, type LocalRecording } from '../db'; // (import type)

// main.py の RecordSummary に合わせた型定義
interface CompletedRecord {
  recording_id: number;
  ai_status: string;
  memo_text?: string;
  transcription_result?: any; // JSON
  summary_result?: string;
  created_at: string; // (JSONはDate型をstringで返す)
}

/**
 * Task 6.2: 記録一覧 (ダッシュボード)
 */
export const ReviewDashboardPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CompletedRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // .env から API のベース URL を取得
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const API_URL = `${API_BASE_URL}/my_records`;

  useEffect(() => {
    if (!auth.caregiverId) {
      // 認証されていない場合はAdminAuthにリダイレクト
      navigate('/review');
      return;
    }
    
    // Task 1 で構築した /my_records エンドポイントを呼び出す
    const fetchRecords = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_URL}?caregiver_id=${auth.caregiverId}`);
        
        if (response.ok) {
          const data: CompletedRecord[] = await response.json();
          // Task 5 で処理された "completed" のものだけが表示されるはず
          setRecords(data);
        } else {
          const errMsg = await response.text();
          console.error("APIエラー詳細:", errMsg);
          setError(`APIエラー: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        // ★★★ TSエラー (ts18046) 修正 ★★★
        console.error("通信エラー詳細:", err);
        // 'err' が 'unknown' 型のため、型ガードを行う
        if (err instanceof Error) {
          setError(`通信エラー: ${err.message}`);
        } else {
          setError(`通信エラー: 不明なエラーが発生しました (${String(err)})`);
        }
        // ★★★ ここまで修正 ★★★
      }
      setLoading(false);
    };

    fetchRecords();
  }, [auth.caregiverId, navigate, API_URL]);

  const handleLogout = () => {
    auth.logout();
    navigate('/review');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1024px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>記録レビュー ({auth.caregiverId} さん)</h1>
        <button onClick={handleLogout} style={{ color: 'red' }}>ログアウト</button>
      </header>

      {loading && <p>読み込み中...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #555' }}>
            <th style={{ padding: '8px', textAlign: 'left' }}>録音ID</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>日時</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>メモ</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>ステータス</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {records.map(record => (
            <tr key={record.recording_id} style={{ borderBottom: '1px solid #333' }}>
              <td style={{ padding: '8px' }}>{record.recording_id}</td>
              <td style={{ padding: '8px' }}>{new Date(record.created_at).toLocaleString('ja-JP')}</td>
              <td style={{ padding: '8px', maxWidth: '300px', whiteSpace: 'pre-wrap' }}>{record.memo_text}</td>
              <td style={{ padding: '8px', color: 'green' }}>{record.ai_status}</td>
              <td style={{ padding: '8px' }}>
                
                {/* (前回の修正: Link に state を追加) */}
                <Link 
                  to={`/review/detail/${record.recording_id}`}
                  state={{ recordData: record }} 
                >
                  <button>レビュー・修正</button>
                </Link>

              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
    </div>
  );
};