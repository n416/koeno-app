import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// MUI Components
import {
  Container,
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Alert,
  Link as MuiLink
} from '@mui/material';

// (main.py CareRecordDetail に合わせた型)
interface CareRecordDetail {
    final_text: string;
    // (他はv2.1では表示しない)
}

// (main.py UnassignedRecording に合わせた型)
interface UnassignedRecording {
    recording_id: number;
    created_at: string;
    caregiver_id: string; // (モックの「担当」)
}

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
// ★★★ /api が重複しないよう修正 ★★★
const API_PATH = API_BASE_URL; // ★ VITE_API_BASE_URL (/api) をそのまま使う

/**
 * 画面B: 介護記録詳細 (kirokudetail.html)
 */
export const KirokuDetailPage = () => {
  const { userId, date } = useParams<{ userId: string, date: string }>();
  const auth = useAuth();
  const navigate = useNavigate();

  const [recordText, setRecordText] = useState('');
  const [unassignedList, setUnassignedList] = useState<UnassignedRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // v2.1 GM指示: 入居者リストはダミー
  const DUMMY_USERS: { [key: string]: string } = { 'u1': '佐藤 様', 'u2': '鈴木 様', 'u3': '高橋 様', 'u4': '田中 様' };
  const userName = DUMMY_USERS[userId || ''] || '不明な入居者';
  
  // v2.1 GM指示: 紐づけ済みリストはダミー
  const assignedList = [
      { recording_id: '001', created_at: '11/09 08:05', caregiver_id: '自分' }
  ];

  // --- 1. データ取得 (画面Bのメインロジック) ---
  const fetchData = useCallback(async () => {
    if (!auth.caregiverId || !userId || !date) {
      setError("認証情報またはURLパラメータが不足しています。");
      setLoading(false); // ★ ローディング解除
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // (1) 既存の介護記録テキストを取得
      const detailRes = await fetch(`${API_PATH}/care_record_detail?user_id=${userId}&record_date=${date}`, {
        headers: { 'X-Caller-ID': auth.caregiverId } // (認証ヘッダー)
      });
      
      // ★★★ GM指示 [n46_p1_55] に基づく修正 ★★★
      // 404 (異常系) を投げず、200 OK のみ処理する
      if (detailRes.ok) {
        const detailData: CareRecordDetail = await detailRes.json();
        // (main.py が "final_text": "" を返すので、それをセット)
        setRecordText(detailData.final_text); 
      } else {
        // (404 や 500)
        // 404はmain.pyが返さなくなったため、これはサーバーエラー等を意味する
        throw new Error(`介護記録の取得失敗: ${detailRes.status}`);
      }
      // ★★★ 修正ここまで ★★★

      // ★★★ v2.1 修正 (Turn 84) ★★★
      // (2) 未紐づけの録音リストを取得 (★ record_date を追加)
      const unassignedRes = await fetch(`${API_PATH}/unassigned_recordings?caregiver_id=${auth.caregiverId}&record_date=${date}`, {
        headers: { 'X-Caller-ID': auth.caregiverId } // (認証ヘッダー)
      });
      if (!unassignedRes.ok) {
        // (こちらは404を想定していないため、エラーとして扱う)
        throw new Error(`未紐づけ録音の取得失敗: ${unassignedRes.status}`);
      }
      const unassignedData: UnassignedRecording[] = await unassignedRes.json();
      setUnassignedList(unassignedData);

    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("データの読み込みに失敗しました。");
    }
    setLoading(false);
  }, [auth.caregiverId, userId, date, API_PATH]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- 2. ダミーのAI連携 (v2.1仕様) ---

  const handleGenerateDraft = () => {
    //
    // GM指示: v2.1ではクライアントサイドGemini (ダミー)
    setRecordText("AIが草案を生成中...\n");
    setTimeout(() => {
        setRecordText(`【${userName} - ${date} 介護記録草案】
・08:05: （録音ID: 001より）
　- （紐づけられた会話の要約）
`);
    }, 1000);
  };
  
  const handleSaveRecord = async () => {
    //
    // GM指示: v2.1では API (ダミー) -> v2.1最終仕様に基づき本実装
    if (!auth.caregiverId || !userId || !date) {
      alert("エラー: 認証情報がありません。");
      return;
    }
    
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_PATH}/save_care_record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Caller-ID': auth.caregiverId
        },
        body: JSON.stringify({
          user_id: userId,
          record_date: date,
          final_text: recordText
        })
      });
      if (!response.ok) {
        throw new Error(`保存に失敗しました (${response.status})`);
      }
      
      // 保存成功したら一覧に戻る
      navigate('/review/list'); 
      
    } catch (err) {
       if (err instanceof Error) setError(err.message);
       else setError("保存処理中にエラーが発生しました。");
    }
    setLoading(false);
  };

  // --- 3. JSX ---
  const pageTitle = `${date} (${userName}) の介護記録`;

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      {/* (ヘッダーは App.tsx 側で表示) */}
      <MuiLink component={RouterLink} to="/review/list" sx={{ mb: 2, display: 'inline-block' }}>
        ← 介護記録一覧に戻る
      </MuiLink>

      {/* --- 介護記録エディタ --- */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5" component="h2" color="primary" sx={{ borderBottom: '2px solid', borderColor: 'primary.main', pb: 0.5 }}>
            {pageTitle}
          </Typography>
          <Button
            variant="contained"
            color="success"
            onClick={handleGenerateDraft}
            disabled={loading}
          >
            [ 草案をAI生成 ]
          </Button>
        </Box>
        <TextField
          value={recordText}
          onChange={(e) => setRecordText(e.target.value)}
          multiline
          rows={10}
          fullWidth
          placeholder="ここに介護記録を入力します。&#10;[ 草案をAI生成 ] ボタンを押すと、下に表示されている「紐づけ済み録音」の内容に基づいてAIが草案を作成します。"
          disabled={loading}
        />
      </Paper>
      
      {loading && <CircularProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* --- 録音リスト --- */}
      <Grid container spacing={3}>
        {/* 紐づけ済み録音 */}
        <Grid xs={12} md={6}> {/* ★ v2 Grid構文 (item削除) */}
          <Paper sx={{ p: 2, width: '100%' }}>
            <Typography variant="h6" component="h3" gutterBottom>
              紐づけ済み録音
            </Typography>
            <List sx={{ maxHeight: '40vh', overflowY: 'auto' }}>
              {assignedList.map(rec => (
                <ListItemButton 
                  key={rec.recording_id} 
                  onClick={() => navigate(`/review/adjust/${rec.recording_id}`)}
                  disabled={loading}
                >
                  <ListItemText 
                    primary={`録音ID: ${rec.recording_id}`}
                    secondary={`録音日時: ${rec.created_at} | 担当: ${rec.caregiver_id}`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Grid>
        
        {/* 未紐づけ録音 */}
        <Grid xs={12} md={6}> {/* ★ v2 Grid構文 (item削除) */}
          <Paper sx={{ p: 2, width: '100%' }}>
            <Typography variant="h6" component="h3" gutterBottom>
              未紐づけ録音 (全入居者共通)
            </Typography>
            <List sx={{ maxHeight: '40vh', overflowY: 'auto' }}>
              {unassignedList.map(rec => (
                <ListItemButton 
                  key={rec.recording_id} 
                  onClick={() => navigate(`/review/adjust/${rec.recording_id}`)}
                  disabled={loading}
                >
                  <ListItemText 
                    primary={`録音ID: ${rec.recording_id}`}
                    secondary={`録音日時: ${new Date(rec.created_at).toLocaleString('ja-JP')} | 担当: ${rec.caregiver_id}`}
                  />
                </ListItemButton>
              ))}
              {unassignedList.length === 0 && !loading && (
                <ListItem><ListItemText secondary="（本日の未紐づけ録音はありません）" /></ListItem>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>

      {/* --- 保存ボタン --- */}
      <Box sx={{ textAlign: 'right', mt: 3 }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={handleSaveRecord}
          disabled={loading}
          sx={{ fontSize: '1.1em', fontWeight: 'bold' }}
        >
          {loading ? '保存中...' : 'この内容で記録を保存'}
        </Button>
      </Box>
    </Container>
  );
};

// コンポーネントをデフォルトエクスポート
export default KirokuDetailPage;