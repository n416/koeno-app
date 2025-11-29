import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GeminiApiClient } from '../lib/geminiApiClient'; 
import lifeSchema from '../data/life_schema.json';

// MUI
import {
  Container, Box, Typography, Button, TextField, Grid, Paper, List, ListItem,
  ListItemButton, ListItemText, CircularProgress, Alert, Link as MuiLink, Tabs, Tab
} from '@mui/material';
import { AutoAwesome as AiIcon, TouchApp as TouchIcon, EditNote as TextIcon } from '@mui/icons-material';

import { CareTouch, type CareTouchRecord } from '../components/CareTouch';
import { extractJson } from '../utils/jsonExtractor';

interface CareRecordDetail { final_text: string; }
interface RecordingBase {
    recording_id: number;
    created_at: string;
    caregiver_id: string; 
    memo_text: string | null; 
    assignment_snapshot: any | null; 
    summary_drafts: Record<string, string> | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_PATH = API_BASE_URL;

export const KirokuDetailPage = () => {
  const { userId, date } = useParams<{ userId: string, date: string }>();
  const auth = useAuth();
  const navigate = useNavigate();

  const [tabIndex, setTabIndex] = useState(0);
  const [recordText, setRecordText] = useState('');
  const [assignedList, setAssignedList] = useState<RecordingBase[]>([]);
  const [unassignedList, setUnassignedList] = useState<RecordingBase[]>([]);
  
  const [careTouchData, setCareTouchData] = useState<Partial<CareTouchRecord>>({});

  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const DUMMY_USERS: { [key: string]: string } = { 'u1': '佐藤 様', 'u2': '鈴木 様', 'u3': '高橋 様', 'u4': '田中 様' };
  const userName = DUMMY_USERS[userId || ''] || '不明な入居者';
  
  // --- 1. データ取得 ---
  const fetchData = useCallback(async () => {
    if (!auth.caregiverId || !userId || !date) return;
    setLoading(true);
    setError(null);

    try {
      const headers = { 'X-Caller-ID': auth.caregiverId };
      const detailRes = await fetch(`${API_PATH}/care_record_detail?user_id=${userId}&record_date=${date}`, { headers });
      if (detailRes.ok) {
        const detailData: CareRecordDetail = await detailRes.json();
        setRecordText(detailData.final_text); 
      }
      
      const assignedRes = await fetch(`${API_PATH}/assigned_recordings?user_id=${userId}&record_date=${date}`, { headers });
      if (assignedRes.ok) {
        const assignedData: RecordingBase[] = await assignedRes.json();
        setAssignedList(assignedData);
      }

      const unassignedRes = await fetch(`${API_PATH}/unassigned_recordings?caregiver_id=${auth.caregiverId}&record_date=${date}`, { headers });
      if (unassignedRes.ok) {
        const unassignedData: RecordingBase[] = await unassignedRes.json();
        setUnassignedList(unassignedData);
      }

    } catch (err) {
      setError("データの読み込みに失敗しました。");
    }
    setLoading(false);
  }, [auth.caregiverId, userId, date, API_PATH]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- 2. 「草案をAI生成」 ＆ 「構造化データ抽出」 ---
  const handleGenerateDraft = async () => {
    if (!userId) return;

    const apiKey = localStorage.getItem('geminiApiKey');
    const modelId = localStorage.getItem('geminiModelId');
    const isNoApiMode = localStorage.getItem('noApiMode') === 'true';

    if ((!apiKey || !modelId) && !isNoApiMode) {
        setError("Gemini APIキーが必要です。");
        return;
    }
    
    const summaries = assignedList
      .filter(rec => rec.summary_drafts && rec.summary_drafts[userId])
      .map(rec => rec.summary_drafts![userId]);

    if (summaries.length === 0) {
      setError("AI生成の元になる「紐づけ済みの要約」がありません。");
      return;
    }

    setAiLoading(true);
    setError(null);
    
    setAiMessage("AIが草案を執筆中...");
    let generatedText = "";

    const PSEUDONYM = "利用者A";
    const baseName = userName.replace(/[\s\u3000]*[様さん君ちゃん]/g, '').trim();

    const combinedSummaries = summaries.map((s, i) => {
      let masked = s;
      if (baseName.length > 0) masked = s.replaceAll(baseName, PSEUDONYM);
      return `--- 個別要約 ${i + 1} ---\n${masked}`;
    }).join('\n\n');
    
    const systemPrompt1 = "あなたは介護記録の作成を支援するAIです。";
    const userPrompt1 = `以下の複数の「個別要約」を読みやすいように結合・整理し、${PSEUDONYM}（${date}）の最終的な「介護記録（草案）」を作成してください。

${combinedSummaries}
`;

    try {
        const client = new GeminiApiClient(apiKey);
        const result1 = await client.generateIsolatedContent(userPrompt1, modelId || '', systemPrompt1);
        
        generatedText = result1;
        if (baseName.length > 0) {
            generatedText = result1.replaceAll(PSEUDONYM, baseName);
        }
        setRecordText(generatedText);

        setAiMessage("CareTouchデータを抽出中...");
        
        const schemaDef = lifeSchema.categories.map(cat => ({ category: cat.label, items: cat.items }));
        const conditionsDef = lifeSchema.conditions;

        const systemPrompt2 = "あなたは介護記録から構造化データを抽出するAIです。";
        const userPrompt2 = `以下の「介護記録（草案）」の内容に基づき、指定された「選択肢リスト」の中から、適合するタグを選択してJSON形式で出力してください。

# 介護記録（草案）
${result1} 
(※ ${PSEUDONYM} は利用者本人です)

# 選択肢定義
${JSON.stringify(schemaDef)}
状態: ${JSON.stringify(conditionsDef)}

# 出力JSON形式
{
  "place": "居室",
  "category": "食事",
  "tags": ["完食"],
  "conditions": ["スムーズ"],
  "note": "メモ"
}`;
        
        const result2 = await client.generateIsolatedContent(userPrompt2, modelId || '', systemPrompt2);
        const extractedJson = extractJson(result2);
        
        if (extractedJson) {
          setCareTouchData(extractedJson);
          setTimeout(() => setTabIndex(1), 500); 
        } else {
          console.warn("JSON抽出失敗:", result2);
        }

    } catch (e) {
        if (e instanceof Error) setError(e.message);
        else setError("AI処理中にエラーが発生しました。");
    }
    
    setAiLoading(false);
    setAiMessage("");
  };
  
  // --- 3. 記録保存 ---
  const handleSaveRecord = async () => {
    if (!auth.caregiverId || !userId || !date) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_PATH}/save_care_record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Caller-ID': auth.caregiverId },
        body: JSON.stringify({ user_id: userId, record_date: date, final_text: recordText })
      });
      if (!response.ok) throw new Error(`保存に失敗しました (${response.status})`);
      navigate('/review/list'); 
    } catch (err) {
       if (err instanceof Error) setError(err.message);
       else setError("保存処理中にエラーが発生しました。");
    }
    setLoading(false);
  };

  const handleCareTouchSave = (data: CareTouchRecord) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const newText = recordText + `\n\n【CareTouch記録 (v${lifeSchema.version})】\n${jsonStr}`;
    setRecordText(newText);
    setCareTouchData(data);
    setTabIndex(0);
  };

  const pageTitle = `${date} (${userName}) の介護記録`;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, pb: 10 }}>
      <MuiLink component={RouterLink} to="/review/list" sx={{ mb: 2, display: 'inline-block' }}>
        ← 介護記録一覧に戻る
      </MuiLink>

      <Typography variant="h5" component="h2" color="primary" sx={{ borderBottom: '2px solid', borderColor: 'primary.main', pb: 0.5, mb: 2 }}>
        {pageTitle}
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabIndex} onChange={(_, val) => setTabIndex(val)} variant="fullWidth" indicatorColor="primary" textColor="primary">
          <Tab icon={<TextIcon />} label="テキスト作成 (AI)" />
          <Tab icon={<TouchIcon />} label="CareTouch (LIFE)" />
        </Tabs>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {aiLoading && <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 2 }}>{aiMessage}</Alert>}

      {/* タブ1: テキスト */}
      <div role="tabpanel" hidden={tabIndex !== 0}>
        {tabIndex === 0 && (
          <>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Button variant="contained" color="success" onClick={handleGenerateDraft} disabled={loading || aiLoading} startIcon={<AiIcon />}>草案＆データ生成 (AI)</Button>
              </Box>
              <TextField value={recordText} onChange={(e) => setRecordText(e.target.value)} multiline rows={10} fullWidth placeholder="ここに介護記録を入力します。" disabled={loading || aiLoading} />
            </Paper>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}> 
                <Paper sx={{ p: 2, width: '100%' }}>
                  <Typography variant="h6" gutterBottom>紐づけ済み録音</Typography>
                  <List sx={{ maxHeight: '40vh', overflowY: 'auto' }}>
                    {assignedList.map(rec => (
                      <ListItemButton key={rec.recording_id} onClick={() => navigate(`/review/adjust/${rec.recording_id}`, { state: { fromUserId: userId, fromDate: date } })}>
                        <ListItemText primary={`録音ID: ${rec.recording_id}`} secondary={`日時: ${new Date(rec.created_at).toLocaleString('ja-JP')}`} />
                      </ListItemButton>
                    ))}
                    {assignedList.length === 0 && <ListItem><ListItemText secondary="なし" /></ListItem>}
                  </List>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}> 
                <Paper sx={{ p: 2, width: '100%' }}>
                  <Typography variant="h6" gutterBottom>未紐づけ録音</Typography>
                  <List sx={{ maxHeight: '40vh', overflowY: 'auto' }}>
                    {unassignedList.map(rec => (
                      <ListItemButton key={rec.recording_id} onClick={() => navigate(`/review/adjust/${rec.recording_id}`, { state: { fromUserId: userId, fromDate: date } })}>
                        <ListItemText primary={`録音ID: ${rec.recording_id}`} secondary={`日時: ${new Date(rec.created_at).toLocaleString('ja-JP')}`} />
                      </ListItemButton>
                    ))}
                    {unassignedList.length === 0 && <ListItem><ListItemText secondary="なし" /></ListItem>}
                  </List>
                </Paper>
              </Grid>
            </Grid>
            <Box sx={{ textAlign: 'right', mt: 3 }}>
              <Button variant="contained" color="primary" size="large" onClick={handleSaveRecord} disabled={loading || aiLoading} sx={{ fontSize: '1.1em', fontWeight: 'bold' }}>この内容で記録を保存</Button>
            </Box>
          </>
        )}
      </div>

      {/* タブ2: CareTouch */}
      <div role="tabpanel" hidden={tabIndex !== 1}>
        {tabIndex === 1 && (
          <CareTouch 
            onSave={handleCareTouchSave} 
            initialData={careTouchData} 
            targetDate={new Date(date || Date.now())} // ★ 追加: これがないとエラー
          />
        )}
      </div>
    </Container>
  );
};

export default KirokuDetailPage;