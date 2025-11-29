import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GeminiApiClient } from '../lib/geminiApiClient';
import lifeSchema from '../data/life_schema.json';

// MUI
import {
  Box, Paper, List, ListItemButton, ListItemText, Typography, 
  Chip, IconButton, CircularProgress, Button, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Badge,
  LinearProgress, Card, CardContent, Grid, Tooltip
} from '@mui/material';
import { 
  ArrowBackIos as PrevIcon, 
  ArrowForwardIos as NextIcon,
  Mic as MicIcon,
  FormatListBulleted as ListIcon, 
  AccessTime as TimeIcon,
  History as HistoryIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';

// ★ CATEGORY_STYLES をインポート
import { CareTouch, type CareTouchRecord, CATEGORY_STYLES } from '../components/CareTouch';
import { extractJson } from '../utils/jsonExtractor';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_PATH = API_BASE_URL;

const DUMMY_USERS = [
  { id: 'u1', name: '佐藤 タロウ', room: '101', adl: '自立' },
  { id: 'u2', name: '鈴木 ハナコ', room: '102', adl: '一部介助' },
  { id: 'u3', name: '田中 ジロウ', room: '103', adl: '全介助' },
  { id: 'u4', name: '高橋 サブロウ', room: '105', adl: '見守り' },
];

interface CareEvent {
  event_id: number;
  user_id: string; 
  event_timestamp: string;
  event_type: string;
  care_touch_data: CareTouchRecord | null;
  note_text: string | null;
  recorded_by: string;
}

interface RecordingBase {
  recording_id: number;
  created_at: string;
  caregiver_id: string;
  summary_drafts: Record<string, string> | null;
}

interface UserDataCache {
  dailyEvents: CareEvent[];
  assignedList: RecordingBase[];
  timestamp: number;
}

// 表示用の時間帯定義 (CareTouchと合わせる)
const TIME_ZONES_DISPLAY = [
  { label: '深夜', start: 0, end: 3, color: '#475569' },
  { label: '午前', start: 3, end: 12, color: '#ea580c' },
  { label: '午後', start: 12, end: 18, color: '#ca8a04' },
  { label: '夜',   start: 18, end: 24, color: '#1e3a8a' },
];

export const StaffInputPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  const [selectedUserId, setSelectedUserId] = useState<string>(DUMMY_USERS[0].id);
  const [targetDate, setTargetDate] = useState<Date>(new Date());
  
  const [careTouchData, setCareTouchData] = useState<Partial<CareTouchRecord>>({});
  
  const [dailyEvents, setDailyEvents] = useState<CareEvent[]>([]);
  const [assignedList, setAssignedList] = useState<RecordingBase[]>([]);
  const [unassignedList, setUnassignedList] = useState<RecordingBase[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [isRecordingListOpen, setIsRecordingListOpen] = useState(false);

  const [dataCache, setDataCache] = useState<Record<string, UserDataCache>>({});
  const requestIdRef = useRef(0);
  const topAnchorRef = useRef<HTMLDivElement>(null); 

  const dateStr = targetDate.toISOString().split('T')[0];
  const currentUser = DUMMY_USERS.find(u => u.id === selectedUserId) || DUMMY_USERS[0];

  useEffect(() => {
    setDataCache({});
  }, [dateStr]);

  const loadUserData = useCallback(async () => {
    if (!auth.caregiverId) return;

    const currentRequestId = ++requestIdRef.current;
    setLoading(true);

    const cached = dataCache[selectedUserId];
    if (cached) {
      setDailyEvents(cached.dailyEvents);
      setAssignedList(cached.assignedList);
      setCareTouchData({});
    } else {
      setDailyEvents([]);
      setAssignedList([]);
      setCareTouchData({});
    }

    try {
      const headers = { 'X-Caller-ID': auth.caregiverId };

      const [eventsRes, assignedRes, unassignedRes] = await Promise.all([
        fetch(`${API_PATH}/daily_events?user_id=${selectedUserId}&date=${dateStr}`, { headers }),
        fetch(`${API_PATH}/assigned_recordings?user_id=${selectedUserId}&record_date=${dateStr}`, { headers }),
        fetch(`${API_PATH}/unassigned_recordings?caregiver_id=${auth.caregiverId}&record_date=${dateStr}`, { headers })
      ]);

      if (currentRequestId !== requestIdRef.current) return;

      let newEvents: CareEvent[] = [];
      if (eventsRes.ok) {
        newEvents = await eventsRes.json();
        newEvents = newEvents.map(ev => {
            if (typeof ev.care_touch_data === 'string') {
                try { ev.care_touch_data = JSON.parse(ev.care_touch_data); } catch(e){}
            }
            return ev;
        });
        // ★修正点1: 取得したデータを event_timestamp の昇順（古い順）にソート
        newEvents.sort((a, b) => new Date(a.event_timestamp).getTime() - new Date(b.event_timestamp).getTime());
      }

      let newAssigned: RecordingBase[] = [];
      if (assignedRes.ok) newAssigned = await assignedRes.json();
      if (unassignedRes.ok) setUnassignedList(await unassignedRes.json());

      setDailyEvents(newEvents);
      setAssignedList(newAssigned);

      setDataCache(prev => ({
        ...prev,
        [selectedUserId]: {
          dailyEvents: newEvents,
          assignedList: newAssigned,
          timestamp: Date.now()
        }
      }));

    } catch (err) {
      console.error(err);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [selectedUserId, dateStr, auth.caregiverId, dataCache]);

  useEffect(() => {
    loadUserData();
  }, [selectedUserId, dateStr]);


  const handleSave = async (data: CareTouchRecord) => {
    if (!auth.caregiverId) return;
    setSaving(true);
    
    try {
      const res = await fetch(`${API_PATH}/save_event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Caller-ID': auth.caregiverId },
        body: JSON.stringify({
          user_id: selectedUserId,
          event_timestamp: data.timestamp || new Date().toISOString(),
          event_type: 'care_touch',
          care_touch_data: data,
          note_text: data.note
        })
      });
      
      if (!res.ok) throw new Error(`保存失敗 (${res.status})`);
      
      const newEvent: CareEvent = {
          event_id: Date.now(),
          user_id: selectedUserId,
          event_timestamp: data.timestamp || new Date().toISOString(),
          event_type: 'care_touch',
          care_touch_data: data,
          note_text: data.note,
          recorded_by: auth.caregiverId
      };
      
      const updatedEvents = [newEvent, ...dailyEvents];
      
      // ★修正点2: ソート順を昇順（a - b）に変更
      // これで新しい時刻がリストの下に来ます
      updatedEvents.sort((a, b) => new Date(a.event_timestamp).getTime() - new Date(b.event_timestamp).getTime());

      setDailyEvents(updatedEvents);
      setCareTouchData({}); 
      
      setDataCache(prev => ({
        ...prev,
        [selectedUserId]: {
          ...prev[selectedUserId],
          dailyEvents: updatedEvents,
          assignedList: assignedList,
          timestamp: Date.now()
        }
      }));

    } catch (err) {
      alert("保存エラー: " + err);
    }
    setSaving(false);
  };

  const handleGenerateFromVoice = async () => {
    const apiKey = localStorage.getItem('geminiApiKey');
    const modelId = localStorage.getItem('geminiModelId');
    const isNoApiMode = localStorage.getItem('noApiMode') === 'true';

    if ((!apiKey || !modelId) && !isNoApiMode) {
      alert("Gemini APIキー設定が必要です");
      return;
    }

    const summaries = assignedList
      .filter(rec => rec.summary_drafts && rec.summary_drafts[selectedUserId])
      .map(rec => rec.summary_drafts![selectedUserId]);

    if (summaries.length === 0) {
      alert("この利用者に紐づけられた録音がありません。\n「今日の録音一覧」から会話を紐づけてください。");
      return;
    }

    setAiLoading(true);

    try {
        const client = new GeminiApiClient(apiKey);
        const PSEUDONYM = "利用者A";
        const combinedText = summaries.join("\n").replaceAll(currentUser.name.split(' ')[0], PSEUDONYM);

        const schemaDef = lifeSchema.categories.map(cat => ({ category: cat.label, items: cat.items }));
        const conditionsDef = lifeSchema.conditions;

        const prompt = `以下の会話記録から、直近のケア内容を1つ選びCareTouch形式で出力してください。
対象: ${PSEUDONYM}

# 記録内容
${combinedText}

# 選択肢定義
${JSON.stringify(schemaDef)}
状態: ${JSON.stringify(conditionsDef)}

# 出力JSON
{
  "place": "居室",
  "category": "食事",
  "tags": ["完食"],
  "conditions": ["スムーズ"],
  "note": "AI要約"
}`;
        
        const result = await client.generateIsolatedContent(prompt, modelId || '');
        const json = extractJson(result);
        
        if (json) {
            setCareTouchData(json);
        } else {
            alert("データ抽出失敗");
        }

    } catch (e) {
        console.error(e);
        alert("AI生成エラー: " + e);
    }
    setAiLoading(false);
  };

  const handleCopyEvent = (event: CareEvent) => {
    if (!event.care_touch_data) return;
    setCareTouchData(event.care_touch_data);
    if (topAnchorRef.current) {
        topAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const changeDate = (offset: number) => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() + offset);
    setTargetDate(d);
  };

  const handleNavigateToAdjust = (recordingId: number) => {
    navigate(`/review/adjust/${recordingId}`, { 
      state: { fromUserId: selectedUserId, fromDate: dateStr } 
    });
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: '#f1f5f9' }}>
      
      {/* 左ペイン */}
      <Box sx={{ width: '300px', bgcolor: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <Box sx={{ p: 2, bgcolor: '#1e293b', color: 'white' }}>
          <Typography variant="h6" fontWeight="bold" color="white">利用者リスト</Typography>
        </Box>
        <List sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
          {DUMMY_USERS.map(user => {
            const isSelected = user.id === selectedUserId;
            return (
              <ListItemButton 
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                sx={{ 
                  mb: 1, borderRadius: 2,
                  bgcolor: isSelected ? '#f1f5f9' : 'transparent',
                  border: isSelected ? '2px solid #334155' : '1px solid transparent',
                  '&:hover': { bgcolor: '#f8fafc' }
                }}
              >
                <ListItemText 
                  primary={<Typography fontWeight="bold">{user.name}</Typography>}
                  secondary={<Typography variant="caption">{user.room}号室</Typography>}
                />
              </ListItemButton>
            );
          })}
        </List>
        <Box sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button fullWidth variant="outlined" onClick={() => navigate('/review/list')}>管理者ダッシュボード</Button>
        </Box>
      </Box>

      {/* 右ペイン */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* ヘッダー */}
        <Box sx={{ bgcolor: 'white', borderBottom: '1px solid #e2e8f0', position: 'relative' }}>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight="bold" color="text.primary">
              {currentUser.name} <Box component="span" sx={{fontSize:'0.8rem', color:'#64748b'}}>({dateStr})</Box>
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
               <Button variant="outlined" color="primary" startIcon={<Badge badgeContent={unassignedList.length} color="error"><ListIcon /></Badge>} onClick={() => setIsRecordingListOpen(true)}>今日の録音一覧</Button>
               <Button variant="contained" color="primary" startIcon={aiLoading ? <CircularProgress size={20} color="inherit"/> : <MicIcon />} onClick={handleGenerateFromVoice} disabled={aiLoading || loading} sx={{ fontWeight: 'bold' }}>{aiLoading ? 'AI入力中...' : '音声から生成'}</Button>
            </Stack>
          </Box>
          {loading && <LinearProgress sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, zIndex: 10 }} />}
        </Box>

        {/* メインコンテンツ */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3, pb: 12 }}>
          <div ref={topAnchorRef} />
          
          {/* 入力フォーム */}
          <Paper sx={{ mb: 4, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">新規記録</Typography>
            </Box>
            <CareTouch 
              initialData={careTouchData}
              onSave={handleSave}
              isSaving={saving}
              targetDate={targetDate}
            />
          </Paper>

          {/* 履歴リスト */}
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon /> 本日の履歴 ({dailyEvents.length})
          </Typography>
          
          <Stack spacing={2}>
            {dailyEvents.length === 0 && <Typography color="text.secondary" sx={{ml:1}}>記録はまだありません</Typography>}
            {dailyEvents.map(event => {
                const data = event.care_touch_data;
                const eventTime = new Date(event.event_timestamp);
                const timeStr = eventTime.toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
                const mins = eventTime.getHours() * 60 + eventTime.getMinutes();

                // どのゾーンに属するか判定
                const hour = eventTime.getHours();
                const zone = TIME_ZONES_DISPLAY.find(z => hour >= z.start && hour < z.end);
                const zoneLabel = zone ? zone.label : '不明';
                const zoneColor = zone ? zone.color : '#999';

                // ゾーン内での相対位置(%)
                const zoneStartMins = (zone ? zone.start : 0) * 60;
                const zoneEndMins = (zone ? zone.end : 24) * 60;
                const percent = zone ? ((mins - zoneStartMins) / (zoneEndMins - zoneStartMins)) * 100 : 0;
                // 0-100%内に収める
                const safePercent = Math.min(100, Math.max(0, percent));

                const catColor = data?.category && lifeSchema.categories.find(c => c.label === data.category)?.color;
                const borderColor = catColor && CATEGORY_STYLES[catColor] ? CATEGORY_STYLES[catColor].main : '#e2e8f0';

                return (
                    <Card key={event.event_id} variant="outlined" sx={{ borderLeft: `4px solid ${borderColor}` }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Grid container spacing={2} alignItems="center">
                                
                                {/* 左: 内容 (70%) */}
                                <Grid size={{ xs: 8 }}>
                                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                                        <Typography variant="body2" color="text.secondary" sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                                            <TimeIcon fontSize="small" /> {timeStr}
                                        </Typography>
                                        <Chip label={data?.category} size="small" sx={{ fontWeight:'bold', bgcolor: CATEGORY_STYLES[catColor || 'gray'].light, color: CATEGORY_STYLES[catColor || 'gray'].dark }} />
                                        {data?.place && <Chip label={`@${data.place}`} size="small" variant="outlined" />}
                                    </Stack>
                                    <Typography variant="body1" fontWeight="bold">
                                        {data?.tags?.join(', ')}
                                    </Typography>
                                    <Stack direction="row" gap={1} flexWrap="wrap">
                                        {data?.conditions?.map(c => (
                                            <Typography key={c} variant="caption" color="error">★ {c}</Typography>
                                        ))}
                                    </Stack>
                                    {event.note_text && (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, bgcolor:'#f8fafc', p:0.5, borderRadius:1 }}>
                                            {event.note_text}
                                        </Typography>
                                    )}
                                    <Button 
                                      size="small" 
                                      startIcon={<CopyIcon />} 
                                      onClick={() => handleCopyEvent(event)}
                                      sx={{ color: 'text.secondary', mt: 1 }}
                                    >
                                      コピーして登録
                                    </Button>
                                </Grid>

                                {/* 右: 個別タイムライン (30%) */}
                                <Grid size={{ xs: 4 }}>
                                    <Box sx={{ position: 'relative', width: '100%', height: 24, bgcolor: '#f1f5f9', borderRadius: 1, overflow: 'hidden' }}>
                                        {/* ゾーン背景 (1つのバーのみ) */}
                                        <Box sx={{ 
                                            position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%', 
                                            bgcolor: zoneColor, opacity: 0.3
                                        }} />
                                        
                                        {/* ゾーンラベル (左端) */}
                                        <Typography variant="caption" sx={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', color:'#555', fontSize:'0.65rem', fontWeight:'bold' }}>
                                            {zoneLabel}
                                        </Typography>

                                        {/* 時刻マーク (●) */}
                                        <Tooltip title={timeStr} arrow placement="top">
                                            <Box sx={{ 
                                                position: 'absolute', top: '50%', left: `${safePercent}%`, 
                                                transform: 'translate(-50%, -50%)',
                                                width: 12, height: 12, borderRadius: '50%',
                                                bgcolor: borderColor, border: '2px solid white', boxShadow: 1
                                            }} />
                                        </Tooltip>
                                    </Box>
                                </Grid>

                            </Grid>
                        </CardContent>
                    </Card>
                );
            })}
          </Stack>
        </Box>

        {/* 右下: 日付操作 */}
        <Paper elevation={4} sx={{ position: 'absolute', bottom: 30, right: 30, p: 1.5, display: 'flex', alignItems: 'center', borderRadius: 8, bgcolor: '#ffffff', border: '1px solid #e2e8f0', zIndex: 100 }}>
          <IconButton size="small" onClick={() => changeDate(-1)}><PrevIcon fontSize="small" /></IconButton>
          <Typography fontWeight="bold" fontSize="1.2rem" sx={{ mx: 2 }}>
            {targetDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })}
          </Typography>
          <IconButton size="small" onClick={() => changeDate(1)}><NextIcon fontSize="small" /></IconButton>
        </Paper>
      </Box>

      {/* モーダル */}
      <Dialog open={isRecordingListOpen} onClose={() => setIsRecordingListOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>本日の未紐づけ録音</DialogTitle>
        <DialogContent dividers>
          {unassignedList.map(rec => (
            <ListItemButton key={rec.recording_id} onClick={() => handleNavigateToAdjust(rec.recording_id)}>
              <ListItemText primary={`録音ID: ${rec.recording_id}`} />
            </ListItemButton>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setIsRecordingListOpen(false)}>閉じる</Button></DialogActions>
      </Dialog>
    </Box>
  );
};