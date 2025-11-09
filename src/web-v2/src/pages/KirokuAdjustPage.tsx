import React, { useState, useEffect, useCallback, DragEvent } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // ★ AuthContext をインポート

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
  CircularProgress // ★ Loading表示
} from '@mui/material';
import { Delete as DeleteIcon, AddCircleOutline as AddIcon, Close as CloseIcon } from '@mui/icons-material';

// --- v2.1 モック に基づくダミーデータ ---
const DUMMY_USERS = [
    { id: 'u1', name: '佐藤 様', color: '#28a745' },
    { id: 'u2', name: '鈴木 様', color: '#17a2b8' },
    { id: 'u3', name: '高橋 様', color: '#ffc107' },
    { id: 'u4', name: '田中 様', color: '#fd7e14' },
    // (モック に合わせる)
];

// (v2.1ではAPIから取得するが、フォールバックとしてダミーを定義)
// ★★★ 削除 (v2.1 / Turn 85) ★★★
// const DUMMY_TRANSCRIPTS_C = [ ... ];

// --- 型定義 ---

// ★★★ 修正 (v2.1 / Turn 85) ★★★
// (main.py の run_worker.py が生成するJSON形式に合わせる)
interface TranscriptionSegment {
  // id: string; (DBのJSONにはIDがないため削除)
  speaker: string;
  start: number; // (time ではなく start)
  end: number;   // (time ではなく end)
  text: string;
}

interface TranscriptRow extends TranscriptionSegment {
  id: string; // (ReactのKey用のためにランダムIDを付与)
  type: 'transcript';
  assignedTo: string | null; // 'u1', 'u2', 'none'
}

interface AssignmentRow {
  id: string; // "group-1", "group-2"
  type: 'assignment';
  userId: string;
  userName: string;
  userColor: string;
}

type TableRowData = TranscriptRow | AssignmentRow;

// (main.py TranscriptionResponse に合わせた型)
interface TranscriptionResponse {
    recording_id: int;
    ai_status: string;
    transcription_result: TranscriptionSegment[] | null;
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
// ★★★ v2.1 修正: /api が重複しないよう修正 ★★★
const API_PATH = API_BASE_URL; // ★ VITE_API_BASE_URL (/api) をそのまま使う

/**
 * 画面C: 手動チャット調整 (image.html)
 */
export const KirokuAdjustPage = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const auth = useAuth(); // ★ 認証情報を取得

  const [tableRows, setTableRows] = useState<TableRowData[]>([]);
  const [activeGroups, setActiveGroups] = useState<Map<string, AssignmentRow>>(new Map());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignmentCounter, setAssignmentCounter] = useState(0);
  
  const [loading, setLoading] = useState(true); // ★ データ取得ローディング
  const [error, setError] = useState<string | null>(null); // ★ データ取得エラー

  // --- 1. 初期データ読み込み (★ v2.1 / Turn 85 修正) ---
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
        // ★★★ 新API (/api/recording_transcription/{id}) を呼び出す
        const response = await fetch(`${API_PATH}/recording_transcription/${recordingId}`, {
           headers: { 'X-Caller-ID': auth.caregiverId }
        });
        
        if (!response.ok) {
          throw new Error(`文字起こしデータの取得に失敗: ${response.status}`);
        }
        
        const data: TranscriptionResponse = await response.json();

        if (data.ai_status !== 'completed' || !data.transcription_result) {
            setError(`この録音(ID: ${recordingId})は、まだAI処理が完了していません。(ステータス: ${data.ai_status})`);
            setTableRows([]);
        } else {
            // (ReactのKey用にランダムIDを付与)
            const initialTranscriptRows: TranscriptRow[] = data.transcription_result.map((seg, index) => ({
              ...seg,
              id: `t-${index}-${Math.random()}`, // (簡易的なユニークID)
              type: 'transcript',
              assignedTo: null, // 初期状態は未割り当て
            }));
            setTableRows(initialTranscriptRows);
        }
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError("文字起こしデータの取得に失敗しました。");
      }
      setLoading(false);
    };
    
    fetchTranscription();
  }, [recordingId, auth.caregiverId]);
  
  // (以下、D&D, トグル, AIダミーロジック等は Turn 84 と同様のため省略)

  // --- 2. 割り当て行の追加・削除 (モック ロジック) ---
  const handleAddAssignment = (user: { id: string, name: string, color: string }) => {
    const newGroupId = `group-${assignmentCounter}`;
    setAssignmentCounter(c => c + 1);
    
    const newGroup: AssignmentRow = {
      id: newGroupId,
      type: 'assignment',
      userId: user.id,
      userName: user.name,
      userColor: user.color,
    };
    
    // (状態再計算も同時に行うコールバック形式)
    setTableRows(prevRows => {
        const newRows = [newGroup, ...prevRows];
        // (再計算)
        let currentGroup: AssignmentRow | null = null;
        const newActiveGroups = new Map<string, AssignmentRow>();
        const updatedRows = newRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            newActiveGroups.set(row.userId, row); 
            return row;
          }
          if (row.type === 'transcript') {
            if (row.assignedTo === 'none') return row;
            return { ...row, assignedTo: currentGroup?.userId || null };
          }
          return row;
        });
        setActiveGroups(newActiveGroups);
        return updatedRows;
    });
    setModalOpen(false);
  };

  const handleDeleteAssignment = (groupId: string) => {
    // (対象行をフィルタリング。順序は変えない)
    const newRows = tableRows.filter(row => row.id !== groupId);
    
    // (割り当て状態を再計算させるためにコールバックで更新)
    setTableRows(() => {
        let currentGroup: AssignmentRow | null = null;
        const newActiveGroups = new Map<string, AssignmentRow>();
        
        const updatedRows = newRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            newActiveGroups.set(row.userId, row); 
            return row;
          }
          if (row.type === 'transcript') {
            if (row.assignedTo === 'none') return row;
            return { ...row, assignedTo: currentGroup?.userId || null };
          }
          return row;
        });

        setActiveGroups(newActiveGroups);
        return updatedRows;
    });
  };

  // --- 3. D&Dロジック (モック ロジック) ---
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
    const targetIndex = tableRows.findIndex(r => r.id === targetRow.id);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newRows = [...tableRows];
    const [draggedItem] = newRows.splice(draggedIndex, 1);
    
    // targetIndex の *前* に挿入
    newRows.splice(targetIndex, 0, draggedItem);
    
    // (状態再計算も同時に行うコールバック形式)
    setTableRows(() => {
        let currentGroup: AssignmentRow | null = null;
        const newActiveGroups = new Map<string, AssignmentRow>();
        
        const updatedRows = newRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            newActiveGroups.set(row.userId, row); 
            return row;
          }
          if (row.type === 'transcript') {
            if (row.assignedTo === 'none') return row;
            return { ...row, assignedTo: currentGroup?.userId || null };
          }
          return row;
        });

        setActiveGroups(newActiveGroups);
        return updatedRows;
    });
    setDraggedRowId(null);
  };

  // (useEffectによる再計算は削除)

  // --- 5. 発話行のトグル (モック ロジック) ---
  const handleToggleNone = (rowId: string) => {
    // (状態再計算も同時に行うコールバック形式)
    setTableRows(prevRows => {
        let currentGroup: AssignmentRow | null = null;
        const newActiveGroups = new Map<string, AssignmentRow>();

        const updatedRows = prevRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
            newActiveGroups.set(row.userId, row); 
            return row;
          }

          if (row.type === 'transcript') {
            let newAssignedTo = row.assignedTo;
            
            // 自身がクリックされた行なら、トグル処理
            if (row.id === rowId) {
                newAssignedTo = row.assignedTo === 'none' ? (currentGroup?.userId || null) : 'none';
            } else {
                // クリックされていない行
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

        setActiveGroups(newActiveGroups);
        return updatedRows;
    });
  };
  
  // --- 6. AI草案 (ダミー) ---
  const handleGenerateDraft = (userName: string) => {
      alert(`（v2.1ダミー）「${userName}」の会話ブロックからAI要約を生成します`);
      // (v2.2以降でクライアントサイドGemini APIを呼び出す)
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <MuiLink component={RouterLink} to="/review/list" sx={{ mb: 2, display: 'inline-block' }}>
        ← 介護記録一覧に戻る
      </MuiLink>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          割り当て (録音ID: {recordingId})
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setModalOpen(true)}
        >
          [ + 新規割り当てを追加 ]
        </Button>
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
                      <IconButton size="small" onClick={() => handleDeleteAssignment(row.id)} sx={{ color: '#fff' }}>
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
                    {/* ★★★ 修正 (v2.1 / Turn 85) ★★★ */}
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

      {/* --- 動的要約欄 --- */}
      {activeGroups.size > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h5" component="h2" gutterBottom>要約</Typography>
          {/* ★ v2 Grid構文 (containerはデフォルト) */}
          <Grid container spacing={2}>
            {Array.from(activeGroups.values()).map(group => (
              // ★ v2 Grid構文 ('item' 削除, 'xs' 'md' をpropsとして渡す)
              <Grid xs={12} md={4} key={group.userId}>
                <Paper variant="outlined" sx={{ p: 2, borderTop: `4px solid ${group.userColor}` }}>
                  <Typography variant="h6">{group.userName} 向け要約</Typography>
                  <TextareaAutosize
                    minRows={4}
                    placeholder={`${group.userName} との会話要約を手動入力...`}
                    style={{ width: '100%', fontFamily: 'inherit', fontSize: '1em', padding: '8px' }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    sx={{ mt: 1 }}
                    onClick={() => handleGenerateDraft(group.userName)}
                  >
                    AI生成
                  </Button>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* --- 承認ボタン --- */}
      <Box sx={{ textAlign: 'right', mt: 3, mb: 3 }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={() => navigate(-1)} // 画面Bに戻る
        >
          この割り当てで承認する
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