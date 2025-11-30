import React, { useState, useMemo, useRef, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DockLayout, { type LayoutData, type TabData } from 'rc-dock';
import "rc-dock/dist/rc-dock.css"; 
import './StaffInputPage.css';

import { useAuth } from '../contexts/AuthContext';
import { GeminiApiClient } from '../lib/geminiApiClient';
import lifeSchema from '../data/life_schema.json';
import { CareTouch, type CareTouchRecord } from '../components/CareTouch';
import { extractJson } from '../utils/jsonExtractor';

import { USERS_MASTER, type User } from '../data/usersMaster';
import { RecordingAdjustModal } from '../components/RecordingAdjustModal';
import { ProcessedSelectionModal, type ProcessedCandidate } from '../components/ProcessedSelectionModal';
import { AudioRecorderModal } from '../components/AudioRecorderModal';

import { 
  ContentCopy as CopyIcon, 
  DeleteOutline as DeleteIcon, 
  Close as CloseIcon,
  Mic as MicIcon,
  KeyboardArrowDown as ArrowDownIcon
} from '@mui/icons-material';

// MUI
import { Tabs, Tab, Box, Typography, Menu, MenuItem, Button } from '@mui/material';

const API_PATH = import.meta.env.VITE_API_BASE_URL || '';
const DOCK_STYLE: React.CSSProperties = { position: 'absolute', inset: 0 };

const getCategoryThemeClass = (category: string | undefined): string => {
  if (!category) return 'theme-gray';
  const catDef = lifeSchema.categories.find(c => c.label === category);
  return catDef ? `theme-${catDef.color}` : 'theme-gray';
};

const formatLocalDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// アナログ時計コンポーネント (ユーザー指定サイズ版: 62px)
const SimpleAnalogClock = ({ date }: { date: Date }) => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isAm = hours < 12;
  
  const hourDeg = ((hours % 12) + minutes / 60) * 30;
  const minuteDeg = minutes * 6;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '70px' }}>
      <div style={{ 
        position: 'relative', 
        width: '62px', height: '62px', 
        borderRadius: '50%', 
        border: '2px solid #cbd5e1', 
        backgroundColor: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)' 
      }}>
        {/* 短針 */}
        <div style={{ 
          position: 'absolute', top: '50%', left: '50%', 
          width: '3px', height: '18px', 
          backgroundColor: '#475569', transformOrigin: 'bottom center',
          transform: `translate(-50%, -100%) rotate(${hourDeg}deg)`, borderRadius: '3px'
        }} />
        {/* 長針 */}
        <div style={{ 
          position: 'absolute', top: '50%', left: '50%', 
          width: '2px', height: '25px', 
          backgroundColor: '#94a3b8', transformOrigin: 'bottom center',
          transform: `translate(-50%, -100%) rotate(${minuteDeg}deg)`, borderRadius: '2px'
        }} />
        {/* 中心点 */}
        <div style={{ 
          position: 'absolute', top: '50%', left: '50%', width: '6px', height: '6px', 
          backgroundColor: '#475569', borderRadius: '50%', transform: 'translate(-50%, -50%)' 
        }} />
      </div>
      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginTop: '4px', fontFamily: 'Arial, sans-serif' }}>
        {isAm ? 'AM' : 'PM'}
      </span>
    </div>
  );
};

interface ProcessingQueueItem {
  recordingId: number;
  groupId: string;
  text: string;
  timestamp: Date;
}

interface PageContextType {
  selectedUserId: string; // 画面（リスト）の表示対象
  setSelectedUserId: (id: string) => void;
  formUserId: string;     // フォーム（入力・編集）の対象
  setFormUserId: (id: string) => void;

  dailyEvents: any[];
  careTouchData: Partial<CareTouchRecord>;
  setCareTouchData: (data: Partial<CareTouchRecord>) => void;
  careTouchInitialTime: Date | undefined;
  
  handleSave: (data: CareTouchRecord) => void;
  handleCopy: (event: any) => void;
  handleEdit: (event: any) => void;
  handleDelete: (event: any) => void;
  cancelEdit: () => void;
  openRecordingList: () => void; 
  editingId: number | null;
  loading: boolean;
  saving: boolean;
  dummyUsers: User[]; 
  targetDate: Date;
  changeDate: (offset: number) => void;
}
const PageContext = React.createContext<PageContextType | null>(null);

// --- パネルコンポーネント ---

const DateNavigatorPanel = () => {
  const { targetDate, changeDate } = useContext(PageContext)!;
  return (
    <div className="panel-root panel-centered">
      <div className="date-nav-container">
         <button className="nav-arrow-btn" onClick={() => changeDate(-1)}>◀</button>
         <div className="date-display">
            <span className="date-main">
              {targetDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}
            </span>
            <span className="date-sub">
              ({targetDate.toLocaleDateString('ja-JP', { weekday: 'short' })})
            </span>
         </div>
         <button className="nav-arrow-btn" onClick={() => changeDate(1)}>▶</button>
      </div>
    </div>
  );
};

const UserListPanel = () => {
  const { selectedUserId, setSelectedUserId, dummyUsers } = useContext(PageContext)!;
  const navigate = useNavigate();
  return (
    <div className="panel-root">
      <div className="panel-content">
        {dummyUsers.map(user => {
          let dotClass = 'dot-green';
          if (user.adl === '全介助') dotClass = 'dot-red';
          else if (user.adl === '見守り') dotClass = 'dot-orange';
          return (
            <div key={user.id} className={`list-item ${user.id === selectedUserId ? 'selected' : ''}`} onClick={() => setSelectedUserId(user.id)}>
              <div className="user-row">
                  <div className={`user-status-dot ${dotClass}`}></div>
                  <div className="user-name">{user.name}</div>
              </div>
              <div className="user-meta">{user.room}</div>
            </div>
          );
        })}
      </div>
      <div className="dashboard-link-area">
        <button className="dashboard-link-btn" onClick={() => navigate('/review/list')}>
          管理者ダッシュボード
        </button>
      </div>
    </div>
  );
};

const HistoryListPanel = () => {
  const { dailyEvents, loading, handleCopy, handleEdit, handleDelete, editingId } = useContext(PageContext)!;
  
  if (loading) return <div className="loading-text">Loading...</div>;
  if (!dailyEvents || dailyEvents.length === 0) return <div className="empty-text">No Records</div>;

  return (
    <div className="panel-root">
      <div className="panel-content">
        {dailyEvents.map(event => {
            const data = event.care_touch_data || {};
            const eventTime = new Date(event.event_timestamp);
            const timeStr = eventTime.toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
            
            const themeClass = getCategoryThemeClass(data.category);
            const isEditing = editingId === event.event_id;
            
            return (
              <div 
                key={event.event_id} 
                className={`history-card ${isEditing ? 'editing' : ''} ${themeClass}`}
                onClick={() => handleEdit(event)} 
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <div className="history-left">
                  <div className="history-header">
                      <div className="history-meta-row">
                          <span className="history-time">{timeStr}</span>
                          {data.category && <span className="tag-badge">{data.category}</span>}
                          {isEditing && <span className="editing-badge">●編集中</span>}
                      </div>
                      <div className="action-btn-group">
                        <button className="action-icon-btn btn-copy" onClick={(e) => { e.stopPropagation(); handleCopy(event); }} title="コピー">
                          <CopyIcon sx={{fontSize:14}} />
                        </button>
                        <button className="action-icon-btn btn-delete" onClick={(e) => { e.stopPropagation(); handleDelete(event); }} title="削除">
                          <DeleteIcon sx={{fontSize:14}} />
                        </button>
                      </div>
                  </div>
                  <div className="history-content">{data.tags?.join(', ')}</div>
                  <div className="history-details">
                    {data.place && <span className="history-detail-item">@{data.place}</span>}
                    {data.conditions?.map((c: string) => <span key={c} className="history-condition">★{c}</span>)}
                  </div>
                  {event.note_text && <div className="history-note">{event.note_text}</div>}
                </div>
                
                <div style={{ borderLeft: '1px solid #f1f5f9', paddingLeft: '8px', display: 'flex', alignItems: 'center' }}>
                   <SimpleAnalogClock date={eventTime} />
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};

const InputFormPanel = () => {
  const { 
    careTouchData, handleSave, saving, formUserId, setFormUserId, 
    dummyUsers, editingId, cancelEdit, targetDate, careTouchInitialTime 
  } = useContext(PageContext)!;
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const currentUser = dummyUsers.find(u => u.id === formUserId) || dummyUsers[0];

  const handleUserClick = (event: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(event.currentTarget);
  const handleUserClose = () => setAnchorEl(null);
  
  const handleUserSelect = (id: string) => {
    setFormUserId(id);
    handleUserClose();
  };

  return (
    <div className="panel-root">
      <div className={`input-header ${editingId ? 'editing' : ''}`}>
        <div className="input-title-area">
            <span className={`input-title ${editingId ? 'editing-text' : ''}`}>
                {editingId ? '記録を編集中' : '新規記録入力'}
            </span>
            {editingId && (
                <button onClick={cancelEdit} className="btn-clean cancel-btn">
                    <CloseIcon className="cancel-icon" /> 中止
                </button>
            )}
        </div>
        
        <div>
          <Button 
            onClick={handleUserClick}
            endIcon={<ArrowDownIcon />}
            sx={{ 
              textTransform: 'none', fontSize: '1.2rem', fontWeight: 'bold', 
              color: '#1e293b', py: 0.5, px: 2, bgcolor: '#f8fafc', 
              borderRadius: 2, '&:hover': { bgcolor: '#e2e8f0' }
            }}
          >
            {currentUser.name} 様
          </Button>
          <Menu anchorEl={anchorEl} open={open} onClose={handleUserClose}>
            {dummyUsers.map((u) => (
              <MenuItem 
                key={u.id} onClick={() => handleUserSelect(u.id)} selected={u.id === formUserId}
                sx={{ minWidth: 200, py: 1.5 }}
              >
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                   <div style={{width:8, height:8, borderRadius:'50%', background: u.color}}></div>
                   <Typography fontWeight="bold">{u.name} 様</Typography>
                </div>
              </MenuItem>
            ))}
          </Menu>
        </div>
      </div>
      
      <div className="panel-content input-content-area">
        <CareTouch 
          initialData={careTouchData} 
          onSave={handleSave} 
          isSaving={saving} 
          targetDate={targetDate} 
          initialTime={careTouchInitialTime} 
        />
      </div>
    </div>
  );
};

// --- メインコンポーネント ---
const STORAGE_KEY = 'carelog_layout_final_v8'; 

export const StaffInputPage = () => {
  const auth = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>(USERS_MASTER[0].id);
  const [formUserId, setFormUserId] = useState<string>(USERS_MASTER[0].id);

  const [targetDate, setTargetDate] = useState<Date>(new Date());
  
  const [dailyEventsRaw, setDailyEventsRaw] = useState<any[]>([]);
  const [assignedList, setAssignedList] = useState<any[]>([]);
  const [unassignedList, setUnassignedList] = useState<any[]>([]);
  
  const [careTouchData, setCareTouchData] = useState<Partial<CareTouchRecord>>({});
  const [careTouchInitialTime, setCareTouchInitialTime] = useState<Date | undefined>(undefined);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustRecordingId, setAdjustRecordingId] = useState<number | null>(null);
  const [isAdjustHistoryMode, setIsAdjustHistoryMode] = useState(false);
  const [listModalTab, setListModalTab] = useState(0);

  const [isReuseModalOpen, setIsReuseModalOpen] = useState(false);
  const [reuseCandidates, setReuseCandidates] = useState<ProcessedCandidate[]>([]);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);

  const [processQueue, setProcessQueue] = useState<ProcessingQueueItem[]>([]);
  const [currentProcessItem, setCurrentProcessItem] = useState<ProcessingQueueItem | null>(null);

  const dockRef = useRef<DockLayout>(null);
  const requestIdRef = useRef(0);
  const dateStr = formatLocalDate(targetDate);
  const currentUser = USERS_MASTER.find(u => u.id === selectedUserId) || USERS_MASTER[0];

  const sortedDailyEvents = useMemo(() => {
    return [...dailyEventsRaw].sort((a, b) => 
      new Date(a.event_timestamp).getTime() - new Date(b.event_timestamp).getTime()
    );
  }, [dailyEventsRaw]);

  const displayRecordingList = useMemo(() => {
    if (listModalTab === 0) return unassignedList; 
    const combined = [...assignedList, ...unassignedList];
    combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return combined;
  }, [listModalTab, unassignedList, assignedList]);

  useEffect(() => {
    setFormUserId(selectedUserId);
    setEditingId(null);
    setCareTouchData({});
    setCareTouchInitialTime(undefined);
  }, [selectedUserId]);

  const changeDate = (offset: number) => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() + offset);
    setTargetDate(d);
    setEditingId(null);
    setCareTouchData({});
    setCareTouchInitialTime(undefined);
  };

  const handleCopy = (event: any) => {
    setEditingId(null);
    if (event.care_touch_data) {
        setCareTouchData({ ...event.care_touch_data });
        // ★ ここはコピーなので、元のtimestampを使ってもよいし、現在時刻にしてもよい。
        // 運用上「同じ時間」にコピーすることは稀なので、現在時刻の方が親切かもしれないが、
        // とりあえずコピー元と同じにしておく。
        setCareTouchInitialTime(new Date(event.care_touch_data.timestamp));
    }
  };

  // ★ 修正: 編集時は「イベント自体の正しいタイムスタンプ」を初期値にする
  const handleEdit = (event: any) => {
    setEditingId(event.event_id);
    setFormUserId(event.user_id); 
    if (event.care_touch_data) {
        setCareTouchData({ ...event.care_touch_data });
        // ★ 修正箇所: JSON内のtimestampではなく、管理用timestampを使用する
        setCareTouchInitialTime(new Date(event.event_timestamp));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormUserId(selectedUserId); 
    setCareTouchData({});
    setCareTouchInitialTime(undefined);
  };

  const handleDelete = async (event: any) => {
    if (!confirm('削除しますか？')) return;
    try {
        console.log("Deleting event:", event.event_id);
        const res = await fetch(`${API_PATH}/care_events/${event.event_id}`, {
            method: 'DELETE',
            headers: { 'X-Caller-ID': auth.caregiverId! }
        });
        if (!res.ok) throw new Error("Delete failed");
        
        setDailyEventsRaw(prev => prev.filter(e => e.event_id !== event.event_id));
        if (editingId === event.event_id) cancelEdit();
    } catch(e) { alert("削除失敗: " + e); }
  };

  const openRecordingList = () => {
    setListModalTab(0);
    setIsListModalOpen(true);
  };

  const handleOpenAdjust = (recordingId: number) => {
    const isAssigned = assignedList.some((r: any) => r.recording_id === recordingId);
    setIsListModalOpen(false); 
    setAdjustRecordingId(recordingId);
    setIsAdjustHistoryMode(isAssigned); 
    setIsAdjustModalOpen(true); 
  };

  const handleAdjustSuccess = () => {
    setIsAdjustModalOpen(false);
    setAdjustRecordingId(null);
    setIsAdjustHistoryMode(false);
    loadUserData(); 
  };

  const loadUserData = async () => {
    if (!auth.caregiverId) return;
    setLoading(true);
    const currentRequestId = ++requestIdRef.current;
    try {
        const headers = { 'X-Caller-ID': auth.caregiverId };
        const [eventsRes, assignedRes, unassignedRes] = await Promise.all([
            fetch(`${API_PATH}/daily_events?user_id=${selectedUserId}&date=${dateStr}`, { headers }),
            fetch(`${API_PATH}/assigned_recordings?user_id=${selectedUserId}&record_date=${dateStr}`, { headers }),
            fetch(`${API_PATH}/unassigned_recordings?caregiver_id=${auth.caregiverId}&record_date=${dateStr}`, { headers })
        ]);
        if (currentRequestId !== requestIdRef.current) return;

        if (eventsRes.ok) {
            let events = await eventsRes.json();
            events = events.map((ev: any) => {
                if (typeof ev.care_touch_data === 'string') { try { ev.care_touch_data = JSON.parse(ev.care_touch_data); } catch(e){} }
                return ev;
            });
            setDailyEventsRaw(events);
        } else setDailyEventsRaw([]);
        
        if (assignedRes.ok) setAssignedList(await assignedRes.json());
        if (unassignedRes.ok) setUnassignedList(await unassignedRes.json());
    } catch(e) { console.error(e); } 
    finally { if (currentRequestId === requestIdRef.current) setLoading(false); }
  };

  useEffect(() => {
    loadUserData();
  }, [selectedUserId, dateStr, auth.caregiverId]);

  useEffect(() => {
    if (!currentProcessItem && processQueue.length > 0 && !aiLoading && !editingId) {
      const nextItem = processQueue[0];
      setCurrentProcessItem(nextItem);
      executeAiAnalysis(nextItem);
    }
  }, [processQueue, currentProcessItem, aiLoading, editingId]);

  const executeAiAnalysis = async (item: ProcessingQueueItem) => {
    const apiKey = localStorage.getItem('geminiApiKey');
    const modelId = localStorage.getItem('geminiModelId');

    setAiLoading(true);
    try {
        const client = new GeminiApiClient(apiKey || '');
        const maskedText = item.text.replaceAll(currentUser.name.split(' ')[0], "利用者");
        const schemaDef = lifeSchema.categories.map(cat => ({ category: cat.label, items: cat.items }));
        const prompt = `以下の会話記録から、直近のケア内容を1つ選びJSONで出力。\n対象: 利用者\n# 記録\n${maskedText}\n\n# 指示\n会話内に具体的な時刻（例: '14時30分', 'さっき', '昼食時'など）が含まれる場合、それを優先して time_override フィールド（HH:MM形式 または ISO）に出力してください。\n\n# 定義\n${JSON.stringify(schemaDef)}\n# 出力形式\n{"place":"居室","category":"食事","tags":["完食"],"conditions":["スムーズ"],"note":"AI要約", "time_override": "14:30"}`;
        
        const result = await client.generateIsolatedContent(prompt, modelId || '');
        const json = extractJson(result);
        if (json) {
          setCareTouchData(json);
          let finalTime = item.timestamp;
          if (json.time_override) {
             const timeMatch = json.time_override.match(/(\d{1,2})[:：](\d{2})/);
             if (timeMatch) {
                 const newTime = new Date(targetDate);
                 newTime.setHours(parseInt(timeMatch[1], 10));
                 newTime.setMinutes(parseInt(timeMatch[2], 10));
                 finalTime = newTime;
             }
          }
          setCareTouchInitialTime(finalTime);
        } else {
          alert("解析失敗");
          skipCurrentQueueItem();
        }
    } catch (e) { 
      alert("AIエラー: " + e); 
      skipCurrentQueueItem();
    }
    setAiLoading(false);
  };

  const skipCurrentQueueItem = () => {
    setProcessQueue(prev => prev.slice(1));
    setCurrentProcessItem(null);
    setCareTouchData({});
    setCareTouchInitialTime(undefined);
  };

  const handleGenerateFromVoice = async () => {
    const apiKey = localStorage.getItem('geminiApiKey');
    const isNoApiMode = localStorage.getItem('noApiMode') === 'true';
    if (!apiKey && !isNoApiMode) { alert("APIキー未設定"); return; }

    const collectCandidates = (onlyUnprocessed: boolean): ProcessedCandidate[] => {
        const results: ProcessedCandidate[] = [];
        assignedList.forEach((rec: any) => {
            if (!rec.assignment_snapshot || !Array.isArray(rec.assignment_snapshot)) return;
            const recordingStartTime = new Date(rec.created_at);
            let currentGroup: any = null;
            let currentTextBuffer: string[] = [];
            let currentGroupStartSec: number | null = null; 

            const pushGroup = () => {
                if (currentGroup && currentGroup.userId === selectedUserId) {
                    const isTarget = onlyUnprocessed ? !currentGroup.processed : currentGroup.processed;
                    if (isTarget && currentTextBuffer.length > 0) {
                        const timestamp = new Date(recordingStartTime.getTime() + (currentGroupStartSec || 0) * 1000);
                        results.push({
                            recordingId: rec.recording_id,
                            groupId: currentGroup.id,
                            text: currentTextBuffer.join('\n'),
                            timestamp: timestamp
                        });
                    }
                }
            };

            rec.assignment_snapshot.forEach((row: any) => {
                if (row.type === 'assignment') {
                    pushGroup();
                    currentGroup = row;
                    currentTextBuffer = [];
                    currentGroupStartSec = null; 
                } else if (row.type === 'transcript') {
                    if (currentGroup && row.assignedTo === currentGroup.userId) {
                        currentTextBuffer.push(row.text);
                        if (currentGroupStartSec === null) { currentGroupStartSec = row.start; }
                    }
                }
            });
            pushGroup(); 
        });
        return results;
    };

    const unprocessedItems = collectCandidates(true);
    if (unprocessedItems.length > 0) {
        setProcessQueue(unprocessedItems); 
        return;
    }
    const processedItems = collectCandidates(false);
    if (processedItems.length > 0) {
        setReuseCandidates(processedItems);
        setIsReuseModalOpen(true);
    } else {
        alert("データがありません。");
    }
  };

  const handleReuseSelected = (selectedItems: ProcessedCandidate[]) => setProcessQueue(selectedItems);

  const handleSave = async (data: CareTouchRecord) => {
    if (!auth.caregiverId) return;
    setSaving(true);
    try {
      const payload = {
          user_id: formUserId, 
          event_timestamp: data.timestamp || new Date().toISOString(),
          event_type: 'care_touch',
          care_touch_data: data,
          note_text: data.note,
          event_id: editingId || undefined
      };
      const res = await fetch(`${API_PATH}/save_event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Caller-ID': auth.caregiverId },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("保存失敗");
      
      if (currentProcessItem) {
        await markAssignmentAsProcessed(currentProcessItem.recordingId, currentProcessItem.groupId);
        setProcessQueue(prev => prev.slice(1));
        setCurrentProcessItem(null);
        setCareTouchData({});
        setCareTouchInitialTime(undefined);
      } else {
        setEditingId(null);
        setFormUserId(selectedUserId); 
        setCareTouchData({});
        setCareTouchInitialTime(undefined);
      }
      loadUserData();
    } catch(e) { alert("保存エラー: " + e); }
    setSaving(false);
  };

  const markAssignmentAsProcessed = async (recordingId: number, groupId: string) => {
    const targetRec = assignedList.find(r => r.recording_id === recordingId);
    if (!targetRec || !targetRec.assignment_snapshot) return;
    const newSnapshot = targetRec.assignment_snapshot.map((row: any) => {
      if (row.type === 'assignment' && row.id === groupId) return { ...row, processed: true };
      return row;
    });
    const userIds = Array.from(new Set(newSnapshot.filter((r:any) => r.type==='assignment').map((r:any) => r.userId)));
    await fetch(`${API_PATH}/save_assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Caller-ID': auth.caregiverId! },
        body: JSON.stringify({
          recording_id: recordingId,
          user_ids: userIds,
          assignment_snapshot: newSnapshot,
          summary_drafts: targetRec.summary_drafts || {} 
        }),
    });
  };

  const defaultLayout: LayoutData = {
    dockbox: {
      mode: 'horizontal',
      children: [
        {
          mode: 'vertical',
          size: 300, 
          children: [
             { tabs: [{ id: 'dateNavigator', title: '対象日', closable: false, content: <div /> }], size: 40 },
             { tabs: [{ id: 'userList', title: '利用者', closable: false, content: <div /> }], size: 200 },
             { tabs: [{ id: 'historyList', title: '本日の履歴', closable: false, content: <div /> }] }
          ]
        },
        {
          size: 700, 
          tabs: [{ id: 'inputForm', title: '記録入力', closable: false, content: <div /> }]
        }
      ]
    }
  };

  const [layout, setLayout] = useState<LayoutData | undefined>(undefined);
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setLayout(saved ? JSON.parse(saved) : defaultLayout);
  }, []);

  const loadTab = (data: TabData): TabData => {
    let content;
    let title = data.title;
    switch (data.id) {
      case 'dateNavigator': content = <DateNavigatorPanel />; title = '対象日'; break;
      case 'userList': content = <UserListPanel />; title = '利用者'; break;
      case 'inputForm': content = <InputFormPanel />; title = '記録入力'; break;
      case 'historyList': content = <HistoryListPanel />; title = '本日の履歴'; break;
      default: content = <div>Not Found</div>; title = 'Unknown';
    }
    return { ...data, id: data.id, title, content, closable: false };
  };
  const onLayoutChange = (newLayout: LayoutData) => {
    setLayout(newLayout);
    if (dockRef.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(dockRef.current.saveLayout()));
  };
  const handleReset = () => {
    if(confirm("レイアウトをリセットしますか？")){
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
  };

  if (!layout) return null;

  return (
    <PageContext.Provider value={{
      selectedUserId, setSelectedUserId, 
      formUserId, setFormUserId,
      dailyEvents: sortedDailyEvents,
      careTouchData, setCareTouchData,
      careTouchInitialTime, 
      handleSave, handleCopy, handleEdit, handleDelete, cancelEdit, editingId,
      openRecordingList,
      loading, saving, dummyUsers: USERS_MASTER, targetDate, changeDate
    }}>
      <div className="app-container">
        <header className="app-header">
          <div className="app-title">CareLog Pro <span className="app-version">v4.6</span></div>
          <div className="header-actions">
            <button className="btn-clean" onClick={() => setIsRecorderOpen(true)} style={{ color: '#d32f2f', borderColor: '#d32f2f' }}>
              <MicIcon sx={{ fontSize: 16, mr: 0.5 }} /> 新規録音
            </button>
            <button className="btn-clean btn-unassigned" onClick={openRecordingList}>
              録音リスト ({unassignedList.length + assignedList.length})
            </button>
            <button className="btn-primary" onClick={handleGenerateFromVoice} disabled={aiLoading || currentProcessItem !== null}>
                {aiLoading ? 'AI解析中...' : '音声から入力'}
            </button>
            <div className="header-divider"></div>
            <button className="btn-clean" onClick={handleReset}>配置リセット</button>
            <button className="btn-clean">ログアウト</button>
          </div>
        </header>
        <div className="main-layout-area">
          <DockLayout ref={dockRef} defaultLayout={layout} loadTab={loadTab} onLayoutChange={onLayoutChange} style={DOCK_STYLE} />
        </div>

        {currentProcessItem && (
           <div style={{background: '#e0f2f1', padding: '8px 16px', color: '#00695c', fontSize: '0.9rem', fontWeight: 'bold', borderBottom:'1px solid #b2dfdb', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
             <span>🔄 連続入力モード: 残り {processQueue.length} 件 (現在の対象: {currentProcessItem.text.slice(0, 15)}...)</span>
             <button onClick={skipCurrentQueueItem} style={{marginLeft:10, padding:'2px 8px', cursor:'pointer', border:'1px solid #00695c', borderRadius:'4px', background:'transparent'}}>スキップ</button>
           </div>
        )}

        {isListModalOpen && (
          <div className="modal-overlay" onClick={() => setIsListModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span>録音リスト ({dateStr})</span>
                  <button className="btn-clean" onClick={() => setIsListModalOpen(false)} aria-label="閉じる"><CloseIcon sx={{fontSize:16}} /></button>
                </div>
                <Tabs value={listModalTab} onChange={(_, val) => setListModalTab(val)} sx={{ minHeight: 36, width: '100%' }}>
                  <Tab label={`未処理 (${unassignedList.length})`} sx={{ minHeight: 36, fontSize: '0.8rem' }} />
                  <Tab label={`すべて (${unassignedList.length + assignedList.length})`} sx={{ minHeight: 36, fontSize: '0.8rem' }} />
                </Tabs>
              </div>
              <div className="modal-body">
                {displayRecordingList.length === 0 ? <div style={{padding:20}}>なし</div> : (
                  <ul className="modal-list">
                    {displayRecordingList.map((rec: any) => {
                      const isAssigned = assignedList.some((r: any) => r.recording_id === rec.recording_id);
                      return (
                        <li key={rec.recording_id} className="modal-list-item" onClick={() => handleOpenAdjust(rec.recording_id)} style={{ opacity: isAssigned ? 0.6 : 1 }}>
                          <div style={{fontWeight:'bold'}}>
                            {isAssigned ? '✅ ' : '🔵 '} 
                            録音ID: {rec.recording_id}
                          </div>
                          <div style={{fontSize:'11px', color:'#666'}}>{new Date(rec.created_at).toLocaleTimeString()} - {rec.caregiver_id}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <RecordingAdjustModal
          open={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          recordingId={adjustRecordingId}
          onSaveSuccess={handleAdjustSuccess}
          isHistoryMode={isAdjustHistoryMode}
        />

        <ProcessedSelectionModal
          open={isReuseModalOpen}
          onClose={() => setIsReuseModalOpen(false)}
          processedItems={reuseCandidates}
          onSelect={handleReuseSelected}
        />

        <AudioRecorderModal
          open={isRecorderOpen}
          onClose={() => setIsRecorderOpen(false)}
          onUploadSuccess={() => { loadUserData(); }}
        />
      </div>
    </PageContext.Provider>
  );
};