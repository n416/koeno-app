import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Task 5 で生成される transcription_result のJSON内の型
interface TranscriptionSegment {
  speaker: string; // "SPEAKER_00", "SPEAKER_01" など
  start: number;
  end: number;
  text: string;
}

// 話者ごとの色を定義 (Task 6.3c)
const SPEAKER_COLORS: { [key: string]: string } = {
  'SPEAKER_00': '#E6B0C4', // (例: 薄い赤系)
  'SPEAKER_01': '#B0E0E6', // (例: 薄い青系)
  'SPEAKER_02': '#B0F2B0', // (例: 薄い緑系)
  'UNKNOWN': '#E0E0E0',    // (例: グレー)
};

/**
 * Task 6.3: 記録詳細・レビュー画面
 */
export const ReviewDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  
  // (Dashboardから渡された `state.recordData` を取得)
  const initialData = (location.state as { recordData: any })?.recordData;
  
  const [record, setRecord] = useState<any>(initialData);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth.caregiverId) {
      navigate('/review'); // 認証切れ
    }
    
    if (!record) {
      // (もし一覧から state で渡されなかった場合 - APIフェッチ処理)
      // (Task 6 の指示では /record/:id のAPIは無いため、ここではエラー扱いにします)
      setError('レコード情報がありません。ダッシュボードから戻り直してください。');
      return;
    }
    
    // Task 5 で生成された transcription_result (JSON文字列) をパース
    try {
      if (record.transcription_result && typeof record.transcription_result === 'string') {
        const parsedSegments = JSON.parse(record.transcription_result);
        setSegments(parsedSegments);
      } else if (record.transcription_result) {
        setSegments(record.transcription_result); // (もし既にJSONオブジェクトなら)
      } else {
        setError('文字起こし結果 (transcription_result) が空です。');
      }
    } catch (e) {
      setError(`文字起こし結果のJSONパースに失敗しました: ${e.message}`);
    }
  }, [record, auth.caregiverId, navigate]);

  /**
   * Task 6.3c: テキストの修正機能
   */
  const handleTextChange = (index: number, newText: string) => {
    const updatedSegments = [...segments];
    updatedSegments[index].text = newText;
    setSegments(updatedSegments);
  };

  /**
   * Task 6.3c: 承認ボタンのAPIコール (ダミー)
   */
  const handleApprove = async () => {
    alert('「承認」ボタンが押されました。\n(Task 6ではAPIコールはダミーです)\n修正後JSON:\n' + JSON.stringify(segments, null, 2));
    // (将来的にここで PUT /my_records/:id { segments, patient_id, status: "approved" } などを呼ぶ)
    navigate('/review/dashboard');
  };

  if (error) {
    return (
      <div>
        <p style={{ color: 'red' }}>{error}</p>
        <Link to="/review/dashboard">ダッシュボードに戻る</Link>
      </div>
    );
  }

  if (!record) {
    return <p>読み込み中...</p>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1024px', margin: '0 auto' }}>
      <header style={{ marginBottom: '20px' }}>
        <Link to="/review/dashboard">← ダッシュボードに戻る</Link>
        <h2>記録レビュー (ID: {id})</h2>
        <p><strong>録音日時:</strong> {new Date(record.created_at).toLocaleString('ja-JP')}</p>
        <p><strong>メモ:</strong> {record.memo_text || '(メモなし)'}</p>
      </header>

      {/* Task 6.3c: 介護者（患者）を紐付ける機能 (UIのみ) */}
      <section style={{ marginBottom: '20px', padding: '10px', border: '1px solid #555' }}>
        <h3>対象者の紐付け</h3>
        <label>
          対象者を選択: 
          <select>
            <option>A. 田中様</option>
            <option>B. 鈴木様</option>
            <option>C. 佐藤様</option>
          </select>
        </label>
      </section>

      {/* Task 6.3c: 文字起こし結果の表示・修正 */}
      <section>
        <h3>文字起こし結果 (修正可)</h3>
        {segments.map((seg, index) => {
          const speakerColor = SPEAKER_COLORS[seg.speaker] || SPEAKER_COLORS['UNKNOWN'];
          
          return (
            <div key={index} style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#333' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 'bold', color: speakerColor }}>
                {seg.speaker} ({seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s)
              </div>
              
              {/* テキストの修正機能 */}
              <textarea
                value={seg.text}
                onChange={(e) => handleTextChange(index, e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '40px',
                  backgroundColor: '#444',
                  color: 'white',
                  border: '1px solid #555',
                  marginTop: '5px',
                  fontSize: '1.1em'
                }}
              />
            </div>
          );
        })}
      </section>
      
      {/* Task 6.3c: 承認ボタン */}
      <footer style={{ marginTop: '30px', textAlign: 'center' }}>
        <button 
          onClick={handleApprove} 
          style={{ padding: '15px 30px', fontSize: '1.2em', backgroundColor: 'green', color: 'white', border: 'none' }}
        >
          この内容で承認する
        </button>
      </footer>
    </div>
  );
};