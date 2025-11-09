import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GeminiApiClient } from '../lib/geminiApiClient'; 

// MUI Components
import {
  Container,
  Box,
  Typography,
  Button,
  TextField,
  Grid, // ★ Grid をインポート
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Alert,
  Link as MuiLink
} from '@mui/material';
import { AutoAwesome as AiIcon } from '@mui/icons-material';

// (main.py CareRecordDetail に合わせた型)
interface CareRecordDetail {
    final_text: string;
    // (他はv2.1では表示しない)
}

// (main.py UnassignedRecording / AssignedRecording に合わせた型)
interface RecordingBase {
    recording_id: number;
    created_at: string;
    caregiver_id: string; 
    memo_text: string | null; 
    assignment_snapshot: any | null; 
    summary_drafts: Record<string, string> | null;
}

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_PATH = API_BASE_URL; // ★ VITE_API_BASE_URL (/api) をそのまま使う

/**
 * 画面B: 介護記録詳細 (kirokudetail.html)
 */
export const KirokuDetailPage = () => {
  const { userId, date } = useParams<{ userId: string, date: string }>();
  const auth = useAuth();
  const navigate = useNavigate();

  const [recordText, setRecordText] = useState('');
  const [assignedList, setAssignedList] = useState<RecordingBase[]>([]);
  const [unassignedList, setUnassignedList] = useState<RecordingBase[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // v2.1 GM指示: 入居者リストはダミー
  const DUMMY_USERS: { [key: string]: string } = { 'u1': '佐藤 様', 'u2': '鈴木 様', 'u3': '高橋 様', 'u4': '田中 様' };
  const userName = DUMMY_USERS[userId || ''] || '不明な入居者';
  

  // --- 1. データ取得 (画面Bのメインロジック) ---
  const fetchData = useCallback(async () => {
    if (!auth.caregiverId || !userId || !date) {
      setError("認証情報またはURLパラメータが不足しています。");
      setLoading(false); 
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // (認証ヘッダー)
      const headers = { 'X-Caller-ID': auth.caregiverId };

      // (1) 既存の介護記録テキストを取得
      const detailRes = await fetch(`${API_PATH}/care_record_detail?user_id=${userId}&record_date=${date}`, { headers });
      if (detailRes.ok) {
        const detailData: CareRecordDetail = await detailRes.json();
        setRecordText(detailData.final_text); 
      } else {
        throw new Error(`介護記録の取得失敗: ${detailRes.status}`);
      }
      
      // (2) 紐づけ済み録音リストを取得 (本実装)
      const assignedRes = await fetch(`${API_PATH}/assigned_recordings?user_id=${userId}&record_date=${date}`, { headers });
      if (!assignedRes.ok) {
        throw new Error(`紐づけ済み録音の取得失敗: ${assignedRes.status}`);
      }
      const assignedData: RecordingBase[] = await assignedRes.json();
      setAssignedList(assignedData);

      // (3) 未紐づけの録音リストを取得 (修正済み)
      const unassignedRes = await fetch(`${API_PATH}/unassigned_recordings?caregiver_id=${auth.caregiverId}&record_date=${date}`, { headers });
      if (!unassignedRes.ok) {
        throw new Error(`未紐づけ録音の取得失敗: ${unassignedRes.status}`);
      }
      const unassignedData: RecordingBase[] = await unassignedRes.json();
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

  // --- 2. 「草案をAI生成」 (本実装) ---
  const handleGenerateDraft = async () => {
    if (!userId) {
      setError("入居者IDが不明です。");
      return;
    }

    // (1) APIキー/モデルを取得
    const apiKey = localStorage.getItem('geminiApiKey');
    const modelId = localStorage.getItem('geminiModelId');
    if (!apiKey || !modelId) {
        setError("Gemini APIキーが設定されていません。右上の設定（歯車）アイコンから設定してください。");
        return;
    }
    
    // (2) 紐づけられた録音 (assignedList) から、この入居者 (userId) 向けの要約を収集
    const summaries: string[] = [];
    assignedList.forEach(rec => {
      // summary_drafts ({"u1": "...", "u3": "..."}) から、現在の利用者の要約を取得
      if (rec.summary_drafts && rec.summary_drafts[userId]) {
        summaries.push(rec.summary_drafts[userId]);
      }
    });

    if (summaries.length === 0) {
      setError("AI生成の元になる「紐づけ済みの要約」がありません。先に画面Cで各録音の割り当てと要約の保存を行ってください。");
      return;
    }

    setAiLoading(true);
    setError(null);
    setRecordText("AIが草案を生成中...\n");

    // (3) プロンプトを生成
    const combinedSummaries = summaries.map((s, i) => `--- 個別要約 ${i + 1} ---\n${s}`).join('\n\n');
    
    const systemPrompt = "あなたは介護記録の作成を支援するAIです。";
    const userPrompt = `以下の複数の「個別要約」を読みやすいように結合・整理し、${userName}（${date}）の最終的な「介護記録（草案）」を作成してください。

${combinedSummaries}
`;

    try {
        const client = new GeminiApiClient(apiKey);
        const result = await client.generateIsolatedContent(userPrompt, modelId, systemPrompt);
        
        // (4) 結果をテキストエリアに反映
        setRecordText(result);
        
    } catch (e) {
        if (e instanceof Error) setError(e.message);
        else setError("AI要約の生成に失敗しました。");
        setRecordText(""); // エラー時はクリア
    }
    
    setAiLoading(false);
  };
  
  // --- 3. 記録保存 ---
  const handleSaveRecord = async () => {
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

  // --- 4. JSX ---
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
            disabled={loading || aiLoading}
            startIcon={aiLoading ? <CircularProgress size={20} color="inherit" /> : <AiIcon />}
          >
            {aiLoading ? 'AI生成中...' : '[ 草案をAI生成 ]'}
          </Button>
        </Box>
        <TextField
          value={recordText}
          onChange={(e) => setRecordText(e.target.value)}
          multiline
          rows={10}
          fullWidth
          placeholder="ここに介護記録を入力します。&#10;[ 草案をAI生成 ] ボタンを押すと、下に表示されている「紐づけ済み録音」の内容に基づいてAIが草案を作成します。"
          disabled={loading || aiLoading}
        />
      </Paper>
      
      {loading && <CircularProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* --- 録音リスト (★ 構文修正) --- */}
      <Grid container spacing={3}>
        {/* ★★★ 修正: `size` prop を `item xs/md` props に変更 ★★★ */}
        <Grid size={{ xs: 12, md: 6 }}> 
          <Paper sx={{ p: 2, width: '100%' }}>
            <Typography variant="h6" component="h3" gutterBottom>
              紐づけ済み録音
            </Typography>
            <List sx={{ maxHeight: '40vh', overflowY: 'auto' }}>
              {assignedList.map(rec => (
                <ListItemButton 
                  key={rec.recording_id} 
                  // ★★★ 修正: navigate 時に state を渡す ★★★
                  onClick={() => navigate(`/review/adjust/${rec.recording_id}`, { state: { fromUserId: userId, fromDate: date } })}
                  disabled={loading || aiLoading} 
                >
                  <ListItemText 
                    primary={`録音ID: ${rec.recording_id}`}
                    secondary={`録音日時: ${new Date(rec.created_at).toLocaleString('ja-JP')} | 担当: ${rec.caregiver_id}`}
                  />
                </ListItemButton>
              ))}
              {assignedList.length === 0 && !loading && (
                <ListItem><ListItemText secondary="（この日に紐づけられた録音はありません）" /></ListItem>
              )}
            </List>
          </Paper>
        </Grid>
        
        {/* ★★★ 修正: `size` prop を `item xs/md` props に変更 ★★★ */}
        <Grid size={{ xs: 12, md: 6 }}> 
          <Paper sx={{ p: 2, width: '100%' }}>
            <Typography variant="h6" component="h3" gutterBottom>
              未紐づけ録音 (全入居者共通)
            </Typography>
            <List sx={{ maxHeight: '40vh', overflowY: 'auto' }}>
              {unassignedList.map(rec => (
                <ListItemButton 
                  key={rec.recording_id} 
                  // ★★★ 修正: navigate 時に state を渡す ★★★
                  onClick={() => navigate(`/review/adjust/${rec.recording_id}`, { state: { fromUserId: userId, fromDate: date } })}
                  disabled={loading || aiLoading} 
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
          disabled={loading || aiLoading} 
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