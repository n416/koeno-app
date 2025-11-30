import React, { useState, useEffect, useCallback, type DragEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

// MUI Components
import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Alert,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  AddCircleOutline as AddIcon,
  Close as CloseIcon,
  Check as CheckIcon,
  RestartAlt as ResetIcon,
  WarningAmber as WarningIcon,
  History as HistoryIcon // ★ 追加
} from '@mui/icons-material';

// 共通ユーザーマスタ
import { USERS_MASTER, type User } from '../data/usersMaster';

// --- 型定義 ---
interface TranscriptionSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface TranscriptRow extends TranscriptionSegment {
  id: string;
  type: 'transcript';
  assignedTo: string | null;
}

interface UserInfo {
  id: string;
  name: string;
  color: string;
}

interface AssignmentRow extends UserInfo {
  id: string;
  type: 'assignment';
  userId: string;
  userName: string;
  userColor: string;
  processed?: boolean;
}

type TableRowData = TranscriptRow | AssignmentRow;

interface TranscriptionResponse {
  recording_id: number;
  ai_status: string;
  transcription_data: TranscriptionSegment[] | TableRowData[] | null;
  summary_drafts: Record<string, string> | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  recordingId: number | null;
  onSaveSuccess: () => void;
  // ★ 追加: 履歴モードフラグ
  isHistoryMode?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_PATH = API_BASE_URL;

export const RecordingAdjustModal: React.FC<Props> = ({ open, onClose, recordingId, onSaveSuccess, isHistoryMode = false }) => {
  const auth = useAuth();

  const [tableRows, setTableRows] = useState<TableRowData[]>([]);
  const [activeGroups, setActiveGroups] = useState<Map<string, AssignmentRow>>(new Map());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);

  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [assignmentCounter, setAssignmentCounter] = useState(0);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recalculateState = useCallback((rows: TableRowData[]) => {
    const newActiveGroups = new Map<string, AssignmentRow>();
    rows.forEach(row => {
      if (row.type === 'assignment') {
        newActiveGroups.set(row.userId, row);
      }
    });
    setActiveGroups(newActiveGroups);
  }, []);

  // --- 1. データ読み込み ---
  useEffect(() => {
    if (!open || recordingId === null || !auth.caregiverId) {
      return;
    }

    const fetchTranscription = async () => {
      setLoading(true);
      setError(null);
      setTableRows([]);
      setActiveGroups(new Map());

      try {
        const response = await fetch(`${API_PATH}/recording_transcription/${recordingId}`, {
          headers: { 'X-Caller-ID': auth.caregiverId! }
        });

        if (!response.ok) {
          throw new Error(`文字起こしデータの取得に失敗: ${response.status}`);
        }

        const data: TranscriptionResponse = await response.json();

        if (data.ai_status !== 'completed' || !data.transcription_data) {
          setError(`この録音(ID: ${recordingId})は、まだAI処理が完了していません。(ステータス: ${data.ai_status})`);
        } else {
          if (data.transcription_data.length > 0 && (data.transcription_data[0] as any).type) {
            const loadedRows = data.transcription_data as TableRowData[];
            setTableRows(loadedRows);
            recalculateState(loadedRows);
          } else {
            const initialTranscriptRows: TranscriptRow[] = (data.transcription_data as TranscriptionSegment[]).map((seg, index) => ({
              ...seg,
              id: `t-${index}-${Math.random()}`,
              type: 'transcript',
              assignedTo: null,
            }));
            setTableRows(initialTranscriptRows);
            recalculateState(initialTranscriptRows);
          }
        }
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError("文字起こしデータの取得に失敗しました。");
      }
      setLoading(false);
    };

    fetchTranscription();
  }, [open, recordingId, auth.caregiverId, recalculateState]);


  // --- 2. 割り当て行の追加・削除 ---
  const handleAddAssignment = (user: User) => {
    const newGroupId = `group-${assignmentCounter}`;
    setAssignmentCounter(c => c + 1);

    const newGroup: AssignmentRow = {
      id: newGroupId,
      type: 'assignment',
      userId: user.id,
      userName: user.displayName,
      userColor: user.color,
      name: user.displayName,
      color: user.color,
      processed: false
    };

    setTableRows(prevRows => {
      const newRows = [newGroup, ...prevRows];
      const updatedRows = updateAssignments(newRows);
      recalculateState(updatedRows);
      return updatedRows;
    });
    setSubDialogOpen(false);
  };

  const handleDeleteAssignment = (groupId: string) => {
    setTableRows(prevRows => {
      const newRows = prevRows.filter(row => row.id !== groupId);
      const updatedRows = updateAssignments(newRows);
      recalculateState(updatedRows);
      return updatedRows;
    });
  };

  const handleClearAllAssignments = () => {
    if (!window.confirm('割り当てを全解除しますか？')) return;
    setTableRows(prevRows => {
      const newRows = prevRows
        .filter(row => row.type === 'transcript')
        .map(row => ({ ...row, assignedTo: null } as TranscriptRow));
      recalculateState(newRows);
      return newRows;
    });
  };

  const updateAssignments = (rows: TableRowData[]): TableRowData[] => {
    let currentGroup: AssignmentRow | null = null;
    return rows.map(row => {
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
  };

  // --- 3. D&Dロジック ---
  const handleDragStart = (e: DragEvent<HTMLTableRowElement>, row: AssignmentRow) => {
    setDraggedRowId(row.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: DragEvent<HTMLTableRowElement>) => e.preventDefault();
  const handleDrop = (e: DragEvent<HTMLTableRowElement>, targetRow: TableRowData) => {
    e.preventDefault();
    if (!draggedRowId) return;
    const draggedIndex = tableRows.findIndex(r => r.id === draggedRowId);
    if (draggedIndex === -1) return;
    const [draggedItem] = tableRows.splice(draggedIndex, 1);
    const targetIndex = tableRows.findIndex(r => r.id === targetRow.id);
    const insertIndex = targetIndex === -1 ? tableRows.length : targetIndex;
    tableRows.splice(insertIndex, 0, draggedItem);

    setTableRows(() => {
      const updated = updateAssignments([...tableRows]);
      recalculateState(updated);
      return updated;
    });
    setDraggedRowId(null);
  };

  // --- 4. トグル操作 ---
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
              newAssignedTo = 'none';
            } else {
              newAssignedTo = currentGroup?.userId || null;
            }
          }
          return { ...row, assignedTo: newAssignedTo };
        }
        return row;
      });
      recalculateState(updatedRows);
      return updatedRows;
    });
  };

  // --- 5. 保存 ---
  const handleApproveAssignments = async () => {
    if (!auth.caregiverId || !recordingId) return;
    setSaving(true);
    setError(null);

    // ★ 履歴モードなら、全グループの processed フラグを強制的に true にする
    const rowsToSave = isHistoryMode
      ? tableRows.map(row => (row.type === 'assignment' ? { ...row, processed: true } : row))
      : tableRows;

    const assignedUserIds = Array.from(activeGroups.keys());

    try {
      const response = await fetch(`${API_PATH}/save_assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Caller-ID': auth.caregiverId,
        },
        body: JSON.stringify({
          recording_id: recordingId,
          user_ids: assignedUserIds,
          assignment_snapshot: rowsToSave, // 修正済みデータを送信
          summary_drafts: {}
        }),
      });

      if (!response.ok) throw new Error(`保存失敗: ${response.status}`);
      onSaveSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存エラー");
    } finally {
      setSaving(false);
    }
  };

  const hasUnassignedRows = tableRows.some(row => row.type === 'transcript' && row.assignedTo === null);

  return (
    <>
      <Dialog
        open={open}
        onClose={saving ? undefined : onClose}
        fullWidth
        maxWidth="lg"
        aria-labelledby="adjust-dialog-title"
      >
        <DialogTitle id="adjust-dialog-title">
          {/* タイトル切り替え */}
          {isHistoryMode ? `録音ログの修正 (ID: ${recordingId})` : `録音の割り当て (ID: ${recordingId})`}
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
            disabled={saving}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSubDialogOpen(true)} disabled={loading || saving}>
              割り当て先を追加
            </Button>
            <Button variant="outlined" color="error" startIcon={<ResetIcon />} onClick={handleClearAllAssignments} disabled={loading || saving} sx={{ ml: 'auto' }}>
              全解除
            </Button>
          </Stack>

          {loading && <CircularProgress sx={{ mb: 2, display: 'block', mx: 'auto' }} />}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {/* 履歴モードの注意書き */}
          {isHistoryMode && (
            <Alert severity="info" sx={{ mb: 2 }} icon={<HistoryIcon />}>
              履歴モードで編集中です。ここで修正しても、作成済みの介護記録（CareTouch）の内容は変更されません。
            </Alert>
          )}
          {hasUnassignedRows && (
            <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
              未割り当ての会話（白い行）が残っています。不要な会話はクリックして「OFF（取り消し線）」にしてください。
            </Alert>
          )}

          <TableContainer component={Paper} sx={{ mb: 3, maxHeight: '60vh' }} variant="outlined">
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 60 }}>状態</TableCell>
                  <TableCell>話者</TableCell>
                  <TableCell>時間</TableCell>
                  <TableCell>内容</TableCell>
                  <TableCell sx={{ width: 60 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.map(row => {
                  if (row.type === 'assignment') {
                    const isProcessed = row.processed === true;
                    // ★ 履歴モードなら処理済みでもドラッグ可能にする
                    // ★ ただし視覚的には「入力済み」とわかるようにしておく
                    const canDrag = isHistoryMode ? true : !isProcessed;

                    return (
                      <TableRow
                        key={row.id}
                        draggable={canDrag}
                        onDragStart={(e) => canDrag && handleDragStart(e as any, row)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e as any, row)}
                        sx={{
                          cursor: canDrag ? 'grab' : 'default',
                          // 履歴モードなら色は通常通り、そうでなければグレー
                          bgcolor: (isProcessed && !isHistoryMode) ? '#e0e0e0' : row.userColor,
                          opacity: (isProcessed && !isHistoryMode) ? 0.7 : 1,
                          '&:active': { cursor: canDrag ? 'grabbing' : 'default' }
                        }}
                      >
                        <TableCell colSpan={4} sx={{ color: (isProcessed && !isHistoryMode) ? '#666' : '#fff', fontWeight: 'bold' }}>
                          ▼ {row.userName} グループ ▼
                          {isProcessed && <span style={{ marginLeft: 10, fontSize: '0.8em' }}>（入力済み）</span>}
                        </TableCell>
                        <TableCell align="center">
                          <IconButton size="small" onClick={() => handleDeleteAssignment(row.id)} sx={{ color: (isProcessed && !isHistoryMode) ? '#666' : '#fff' }} disabled={saving}>
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (row.type === 'transcript') {
                    const isNone = row.assignedTo === 'none';
                    return (
                      <TableRow
                        key={row.id}
                        onClick={() => handleToggleNone(row.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e as any, row)}
                        sx={{
                          cursor: 'pointer',
                          bgcolor: isNone ? '#f5f5f5' : 'transparent',
                          textDecoration: isNone ? 'line-through' : 'none',
                          color: isNone ? 'text.disabled' : 'text.primary',
                          borderLeft: (!isNone && row.assignedTo === null) ? '4px solid #ff9800' : 'none'
                        }}
                      >
                        <TableCell align="center">{isNone && <Chip label="OFF" size="small" />}</TableCell>
                        <TableCell>{row.speaker}</TableCell>
                        <TableCell>{row.start.toFixed(0)}s</TableCell>
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

        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={handleApproveAssignments}
            disabled={loading || saving || hasUnassignedRows}
            startIcon={saving ? <CircularProgress size={20} /> : (isHistoryMode ? <HistoryIcon /> : <CheckIcon />)}
            color={hasUnassignedRows ? 'error' : (isHistoryMode ? 'warning' : 'primary')} // 履歴モードは警告色で区別
          >
            {/* 文言の切り替え */}
            {hasUnassignedRows ? '未処理の会話があります' : (isHistoryMode ? 'ログを修正して保存（記録は更新されません）' : '割り当てを承認')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={subDialogOpen} onClose={() => setSubDialogOpen(false)}>
        <DialogTitle>割り当て先を選択</DialogTitle>
        <DialogContent>
          <List>
            {USERS_MASTER.map(user => (
              <ListItemButton key={user.id} onClick={() => handleAddAssignment(user)}>
                <ListItemText primary={user.displayName} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </>
  );
};