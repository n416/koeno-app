import React, { useState, useEffect, useCallback, useMemo } from 'react'; // ★ useMemo をインポート
// ★★★ 修正 (ts1484): DragEvent を型としてインポート ★★★
import type { DragEvent } from 'react';
// ★★★ 修正: useLocation をインポート ★★★
import { useParams, useNavigate, Link as RouterLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; 
import { GeminiApiClient } from '../lib/geminiApiClient'; 

// MUI Components
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Modal,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Grid, 
  TextareaAutosize, // Textarea用
  Link as MuiLink,
  Chip, // 「非表示」チップ用
  Alert, // ★ Error表示
  CircularProgress, // ★ Loading表示
  Stack // ★ ボタン横並び用
} from '@mui/material';
import { Delete as DeleteIcon, AddCircleOutline as AddIcon, Close as CloseIcon, Check as CheckIcon, AutoAwesome as AiIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material'; 

// --- v2.1 モック に基づくダミーデータ ---
const DUMMY_USERS = [
    { id: 'u1', name: '佐藤 様', color: '#28a745' },
    { id: 'u2', name: '鈴木 様', color: '#17a2b8' },
    { id: 'u3', name: '高橋 様', color: '#ffc107' },
    { id: 'u4', name: '田中 様', color: '#fd7e14' },
];

// --- 型定義 ---

// (main.py の run_worker.py が生成するJSON形式)
interface TranscriptionSegment {
  speaker: string;
  start: number; 
  end: number;   
  text: string;
}

interface TranscriptRow extends TranscriptionSegment {
  id: string; // (ReactのKey用のためにランダムIDを付与)
  type: 'transcript';
  assignedTo: string | null; // 'u1', 'u2', 'none'
}

// ★ 修正: ユーザー情報の型を共通化
interface UserInfo {
  id: string;
  name: string;
  color: string;
}

interface AssignmentRow extends UserInfo {
  id: string; // "group-1", "group-2"
  type: 'assignment';
  userId: string; // (UserInfo.id と重複するが型を維持)
  userName: string; // (UserInfo.name と重複)
  userColor: string; // (UserInfo.color と重複)
}

type TableRowData = TranscriptRow | AssignmentRow;

// (main.py TranscriptionResponse に合わせた型)
interface TranscriptionResponse {
    // ★★★ 修正 (ts2304): int -> number ★★★
    recording_id: number; 
    ai_status: string;
    transcription_data: TranscriptionSegment[] | TableRowData[] | null;
    summary_drafts: Record<string, string> | null; 
}


// モーダルスタイル
const modalStyle = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
  borderRadius: 2
};

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_PATH = API_BASE_URL; // ★ VITE_API_BASE_URL (/api) をそのまま使う

/**
 * 画面C: 手動チャット調整 (image.html)
 */
export const KirokuAdjustPage = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const auth = useAuth(); // ★ 認証情報を取得

  // ★★★ 修正: useLocation を使って戻り先URLを特定 ★★★
  const location = useLocation();
  const { fromUserId, fromDate } = (location.state || {}) as { fromUserId?: string, fromDate?: string };
  // (state があれば詳細画面、なければ（リロード時など）一覧画面に戻る)
  const backUrl = (fromUserId && fromDate) ? `/review/detail/${fromUserId}/${fromDate}` : '/review/list';
  const backLinkText = (fromUserId && fromDate) ? '← 介護記録詳細に戻る' : '← 介護記録一覧に戻る';

  // ★★★ 修正: 遷移元の入居者情報を特定 ★★★
  const fromUser = useMemo(() => {
    if (fromUserId) {
      return DUMMY_USERS.find(u => u.id === fromUserId);
    }
    return undefined;
  }, [fromUserId]);


  const [tableRows, setTableRows] = useState<TableRowData[]>([]);
  const [activeGroups, setActiveGroups] = useState<Map<string, AssignmentRow>>(new Map());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignmentCounter, setAssignmentCounter] = useState(0);
  
  const [loading, setLoading] = useState(true); // ★ データ取得ローディング
  const [saving, setSaving] = useState(false); // ★ 保存中ローディング
  const [error, setError] = useState<string | null>(null); // ★ データ取得エラー

  const [summaryTexts, setSummaryTexts] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState<Record<string, boolean>>({});

  // ★ 割り当て変更時などに、現在の割り当てと要約のステートを再計算する
  const recalculateState = useCallback((rows: TableRowData[], loadedSummaries: Record<string, string>) => {
      let currentGroup: AssignmentRow | null = null;
      const newActiveGroups = new Map<string, AssignmentRow>();
      
      const newSummaryTexts = { ...loadedSummaries }; 
      
      rows.forEach(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            newActiveGroups.set(row.userId, row); 
            // (新しいグループが追加されたら、要約テキスト欄を初期化)
            if (!newSummaryTexts[row.userId]) {
                newSummaryTexts[row.userId] = '';
            }
          }
      });
      
      // (ご要望通り、割り当てが消えても要約は削除しない)

      setActiveGroups(newActiveGroups);
      setSummaryTexts(newSummaryTexts);
  }, []); 

  // --- 1. 初期データ読み込み ---
  useEffect(() => {
    const fetchTranscription = async () => {
      if (!recordingId || !auth.caregiverId) {
        setError("録音IDまたは認証情報がありません。");
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`${API_PATH}/recording_transcription/${recordingId}`, {
           headers: { 'X-Caller-ID': auth.caregiverId }
        });
        
        if (!response.ok) {
          throw new Error(`文字起こしデータの取得に失敗: ${response.status}`);
        }
        
        const data: TranscriptionResponse = await response.json();

        if (data.ai_status !== 'completed' || !data.transcription_data) {
            setError(`この録音(ID: ${recordingId})は、まだAI処理が完了していません。(ステータス: ${data.ai_status})`);
            setTableRows([]);
        
        } else {
            
            // ★ DBからロードした要約を先に取得
            const loadedSummaries = data.summary_drafts || {};
            setSummaryTexts(loadedSummaries); // ★ 先にステートにセット
            
            if (data.transcription_data.length > 0 && (data.transcription_data[0] as any).type) {
                // (1) 編集済みスナップショット (TableRowData[])
                console.log("復元: 編集済みスナップショットをロードしました。");
                const loadedRows = data.transcription_data as TableRowData[];
                setTableRows(loadedRows);
                recalculateState(loadedRows, loadedSummaries);
            } else {
                // (2) 生の文字起こし (TranscriptionSegment[])
                console.log("復元: 生の文字起こしデータをロードしました。");
                const initialTranscriptRows: TranscriptRow[] = (data.transcription_data as TranscriptionSegment[]).map((seg, index) => ({
                  ...seg,
                  id: `t-${index}-${Math.random()}`, 
                  type: 'transcript',
                  assignedTo: null, 
                }));
                setTableRows(initialTranscriptRows);
                recalculateState(initialTranscriptRows, loadedSummaries);
            }
        }
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError("文字起こしデータの取得に失敗しました。");
      }
      setLoading(false);
    };
    
    fetchTranscription();
  }, [recordingId, auth.caregiverId, recalculateState]); 
  

  // --- 2. 割り当て行の追加・削除 ---
  const handleAddAssignment = (user: UserInfo) => {
    const newGroupId = `group-${assignmentCounter}`;
    setAssignmentCounter(c => c + 1);
    
    const newGroup: AssignmentRow = {
      // Properties from AssignmentRow definition
      id: newGroupId,
      type: 'assignment',
      userId: user.id,
      userName: user.name,
      userColor: user.color,
      
      // Properties inherited from UserInfo
      name: user.name,
      color: user.color,
      
      // ★★★ 修正: ts(2783) エラー回避のため ...user スプレッドを削除 ★★★
      // (id が user.id によって上書きされるのを防ぐ)
    };
    
    setTableRows(prevRows => {
        const newRows = [newGroup, ...prevRows];
        let currentGroup: AssignmentRow | null = null;
        const updatedRows = newRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            return row;
          }
          if (row.type === 'transcript') {
            if (row.assignedTo === 'none') return row;
            return { ...row, assignedTo: currentGroup?.userId || null };
          }
          return row;
        });
        
        recalculateState(updatedRows, summaryTexts); 
        return updatedRows;
    });
    setModalOpen(false);
  };

  const handleDeleteAssignment = (groupId: string) => {
    const newRows = tableRows.filter(row => row.id !== groupId);
    
    setTableRows(() => {
        let currentGroup: AssignmentRow | null = null;
        
        const updatedRows = newRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            return row;
          }
          if (row.type === 'transcript') {
            if (row.assignedTo === 'none') return row;
            return { ...row, assignedTo: currentGroup?.userId || null };
          }
          return row;
        });

        recalculateState(updatedRows, summaryTexts); 
        return updatedRows;
    });
  };

  // --- 3. D&Dロジック ---
  const handleDragStart = (e: DragEvent<HTMLTableRowElement>, row: AssignmentRow) => {
    setDraggedRowId(row.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLTableRowElement>) => {
    e.preventDefault(); // Dropを許可
  };

  const handleDrop = (e: DragEvent<HTMLTableRowElement>, targetRow: TableRowData) => {
    e.preventDefault();
    if (!draggedRowId) return;
    
    const draggedIndex = tableRows.findIndex(r => r.id === draggedRowId);
    if (draggedIndex === -1) return;
    
    const [draggedItem] = tableRows.splice(draggedIndex, 1);
    
    const targetIndex = tableRows.findIndex(r => r.id === targetRow.id);
    if (targetIndex === -1) {
        tableRows.push(draggedItem);
    } else {
         tableRows.splice(targetIndex, 0, draggedItem);
    }
    
    setTableRows(() => {
        let currentGroup: AssignmentRow | null = null;
        
        const updatedRows = tableRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            return row;
          }
          if (row.type === 'transcript') {
            if (row.assignedTo === 'none') return row;
            return { ...row, assignedTo: currentGroup?.userId || null };
          }
          return row;
        });

        recalculateState(updatedRows, summaryTexts); 
        return updatedRows;
    });
    setDraggedRowId(null);
  };

  // --- 5. 発話行のトグル ---
  const handleToggleNone = (rowId: string) => {
    setTableRows(prevRows => {
        let currentGroup: AssignmentRow | null = null;

        const updatedRows = prevRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            return row;
          }

          if (row.type === 'transcript') {
            let newAssignedTo = row.assignedTo;
            
            if (row.id === rowId) {
                newAssignedTo = row.assignedTo === 'none' ? (currentGroup?.userId || null) : 'none';
            } else {
                if (row.assignedTo === 'none') {
                   newAssignedTo = 'none'; // 'none' は維持
                } else {
                   newAssignedTo = currentGroup?.userId || null; // D&Dに追随
                }
            }
            return { ...row, assignedTo: newAssignedTo };
          }
          return row;
        });
        
        recalculateState(updatedRows, summaryTexts);
        return updatedRows;
    });
  };
  
  // --- 6. AI草案 ---
  const handleGenerateDraft = async (userId: string, userName: string) => {
      const apiKey = localStorage.getItem('geminiApiKey');
      const modelId = localStorage.getItem('geminiModelId');
      if (!apiKey || !modelId) {
          setError("Gemini APIキーが設定されていません。右上の設定（歯車）アイコンから設定してください。");
          return;
      }
      
      const assignedTranscripts = tableRows.filter(row => 
          row.type === 'transcript' && row.assignedTo === userId
      ) as TranscriptRow[];
      
      if (assignedTranscripts.length === 0) {
          setError(`「${userName}」に割り当てられた発話がありません。`);
          return;
      }

      setSummaryLoading(prev => ({ ...prev, [userId]: true }));
      setError(null);
      
      const conversationLog = assignedTranscripts.map(seg => 
          `${seg.speaker}: ${seg.text}`
      ).join('\n');
      
      const systemPrompt = `あなたは介護記録の作成を支援するAIです。以下の会話ログを分析し、介護士が「${userName}」に関して把握すべき重要な情報（健康状態、発言、行動）を、簡潔な箇条書きで要約してください。`;
      
      try {
          const client = new GeminiApiClient(apiKey);
          const result = await client.generateIsolatedContent(conversationLog, modelId, systemPrompt);
          setSummaryTexts(prev => ({ ...prev, [userId]: result }));
      } catch (e) {
          if (e instanceof Error) setError(e.message);
          else setError("AI要約の生成に失敗しました。");
      }
      setSummaryLoading(prev => ({ ...prev, [userId]: false }));
  };

  // --- 7. 割り当て承認 ---
  const handleApproveAssignments = async () => {
    if (!auth.caregiverId || !recordingId) {
        setError("認証情報または録音IDがありません。");
        return;
    }
    
    setSaving(true);
    setError(null);
    
    const assignedUserIds = Array.from(activeGroups.keys());
    
    try {
        const response = await fetch(`${API_PATH}/save_assignments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Caller-ID': auth.caregiverId,
            },
            body: JSON.stringify({
              recording_id: parseInt(recordingId, 10),
              user_ids: assignedUserIds,
              assignment_snapshot: tableRows, 
              summary_drafts: summaryTexts
            }),
        });
        
        if (!response.ok) {
            throw new Error(`割り当ての保存に失敗: ${response.status}`);
        }
        
        // ★★★ 修正: `Maps(-1)` を `Maps(backUrl)` に変更 ★★★
        navigate(backUrl); 
        
    } catch (err) {
       if (err instanceof Error) setError(err.message);
       else setError("割り当ての保存処理中にエラーが発生しました。");
       setSaving(false);
    }
  };
  
  // --- 8. 要約テキスト操作 ---
  const handleSummaryTextChange = (userId: string, text: string) => {
      setSummaryTexts(prev => ({ ...prev, [userId]: text }));
  };

  const handleDeleteSummary = (userId: string) => {
      const userName = DUMMY_USERS.find(u => u.id === userId)?.name || userId;
      if (window.confirm(`「${userName}」の要約を削除しますか？`)) {
          setSummaryTexts(prev => {
              const newSummaries = { ...prev };
              delete newSummaries[userId];
              return newSummaries;
          });
      }
  };


  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      {/* ★★★ 修正: 戻り先URLとテキストを動的に ★★★ */}
      <MuiLink component={RouterLink} to={backUrl} sx={{ mb: 2, display: 'inline-block' }}>
        {backLinkText}
      </MuiLink>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          割り当て (録音ID: {recordingId})
        </Typography>
        
        {/* ★★★ 修正: GM指示に基づきボタンUIを変更 ★★★ */}
        <Stack direction="row" spacing={1}>
          {/* 1. 遷移元ユーザーの専用ボタン (存在する場合のみ) */}
          {fromUser && (
            <Button
              variant="contained"
              color="success" // (推奨色がなかったので success に)
              startIcon={<PersonAddIcon />}
              onClick={() => handleAddAssignment(fromUser)}
              disabled={loading || saving}
            >
              {fromUser.name} の割当てを追加
            </Button>
          )}

          {/* 2. 他のユーザーを追加するボタン (モーダル起動) */}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setModalOpen(true)}
            disabled={loading || saving}
          >
            他の割当てを追加
          </Button>
        </Stack>
        {/* ★★★ 修正ここまで ★★★ */}

      </Paper>

      {loading && <CircularProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 80 }}>状態</TableCell>
              <TableCell>話者(AI)</TableCell>
              <TableCell>時間</TableCell>
              <TableCell>内容</TableCell>
              <TableCell sx={{ width: 60 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tableRows.map(row => {
              if (row.type === 'assignment') {
                return (
                  <TableRow
                    key={row.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e as any, row)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e as any, row)}
                    sx={{
                      cursor: 'grab',
                      bgcolor: row.userColor,
                      '&:active': { cursor: 'grabbing' }
                    }}
                  >
                    <TableCell colSpan={4} sx={{ color: '#fff', fontWeight: 'bold' }}>
                      ▼ {row.userName} グループ (ID: {row.userId}) ▼
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleDeleteAssignment(row.id)} sx={{ color: '#fff' }} disabled={saving}>
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              }
              
              if (row.type === 'transcript') {
                const isNone = row.assignedTo === 'none';
                const groupColor = activeGroups.get(row.assignedTo || '')?.userColor;
                
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => handleToggleNone(row.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e as any, row)}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: isNone ? '#f5f5f5' : (groupColor ? `${groupColor}20` : 'transparent'), // hexToRgba
                      textDecoration: isNone ? 'line-through' : 'none',
                      color: isNone ? 'text.disabled' : 'text.primary',
                    }}
                  >
                    <TableCell align="center">
                      {isNone && <Chip label="非表示" size="small" />}
                    </TableCell>
                    <TableCell>{row.speaker}</TableCell>
                    <TableCell>{row.start.toFixed(1)}s - {row.end.toFixed(1)}s</TableCell>
                    <TableCell>{row.text}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                );
              }
              return null;
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* --- 動的要約欄 (Grid v7 構文) --- */}
      {Object.keys(summaryTexts).length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h5" component="h2" gutterBottom>要約</Typography>
          <Grid container spacing={2}>
            {Object.keys(summaryTexts).map(userId => {
              
              const activeGroup = activeGroups.get(userId);
              const userInfo = DUMMY_USERS.find(u => u.id === userId);
              
              const userName = activeGroup?.userName || userInfo?.name || `不明なID (${userId})`;
              const userColor = activeGroup?.userColor || userInfo?.color || '#808080'; 
              const isGroupActive = activeGroups.has(userId);

              return (
                // ★★★ 修正: `item xs/md` を `size` に戻す ★★★
                <Grid size={{ xs: 12, md: 4 }} key={userId}>
                  <Paper variant="outlined" sx={{ p: 2, borderTop: `4px solid ${userColor}`, opacity: isGroupActive ? 1 : 0.6 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <Typography variant="h6">{userName} 向け要約</Typography>
                       <IconButton 
                          size="small" 
                          onClick={() => handleDeleteSummary(userId)} 
                          title="この要約を削除"
                          disabled={saving}
                       >
                          <DeleteIcon fontSize="small" />
                       </IconButton>
                    </Box>
                    {!isGroupActive && (
                      <Chip label="割り当て削除済み" size="small" variant="outlined" sx={{ mb: 1 }} />
                    )}
                    <TextareaAutosize
                      minRows={4}
                      placeholder={`${userName} との会話要約を手動入力...`}
                      style={{ width: '100%', fontFamily: 'inherit', fontSize: '1em', padding: '8px' }}
                      value={summaryTexts[userId] || ''}
                      onChange={(e) => handleSummaryTextChange(userId, e.target.value)}
                      disabled={summaryLoading[userId] || saving}
                    />
                    <Button
                      size="small"
                      variant="contained"
                      sx={{ mt: 1 }}
                      onClick={() => handleGenerateDraft(userId, userName)}
                      disabled={summaryLoading[userId] || saving || !isGroupActive} 
                      startIcon={summaryLoading[userId] ? <CircularProgress size={16} /> : <AiIcon />}
                    >
                      {summaryLoading[userId] ? '生成中...' : (isGroupActive ? 'AI生成' : 'AI生成不可')}
                    </Button>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      )}

      {/* --- 承認ボタン --- */}
      <Box sx={{ textAlign: 'right', mt: 3, mb: 3 }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={handleApproveAssignments} 
          disabled={loading || saving} 
          startIcon={saving ? <CircularProgress size={24} /> : <CheckIcon />} 
        >
          {saving ? '保存中...' : 'この割り当てで承認する'}
        </Button>
      </Box>

      {/* --- 入居者選択モーダル --- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <Box sx={modalStyle}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" component="h2">割り当て先を選択</Typography>
            <IconButton onClick={() => setModalOpen(false)}><CloseIcon /></IconButton>
          </Box>
          <List>
            {DUMMY_USERS.map(user => (
              <ListItemButton key={user.id} onClick={() => handleAddAssignment(user)}>
                <ListItemText primary={user.name} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Modal>
    </Container>
  );
};

// コンポーネントをデフォルトエクスポート
export default KirokuAdjustPage;