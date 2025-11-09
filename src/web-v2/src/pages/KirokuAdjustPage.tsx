import React, { useState, useEffect, useCallback, DragEvent } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // ★ AuthContext をインポート

// ★★★ 追加 (Turn 101) ★★★
import { GeminiApiClient } from '../lib/geminiApiClient'; //

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
import { Delete as DeleteIcon, AddCircleOutline as AddIcon, Close as CloseIcon, Check as CheckIcon, AutoAwesome as AiIcon } from '@mui/icons-material'; // ★ CheckIcon, AiIcon をインポート

// --- v2.1 モック に基づくダミーデータ ---
const DUMMY_USERS = [
    { id: 'u1', name: '佐藤 様', color: '#28a745' },
    { id: 'u2', name: '鈴木 様', color: '#17a2b8' },
    { id: 'u3', name: '高橋 様', color: '#ffc107' },
    { id: 'u4', name: '田中 様', color: '#fd7e14' },
    // (モック に合わせる)
];

// (ダミーデータは削除)

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
    // ★★★ 修正 (v2.1 / Turn 96) ★★★
    transcription_data: TranscriptionSegment[] | TableRowData[] | null;
    // ★★★ 修正 (v2.1 / Turn 106) ★★★
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
// ★★★ /api が重複しないよう修正 ★★★
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
  const [saving, setSaving] = useState(false); // ★ 保存中ローディング
  const [error, setError] = useState<string | null>(null); // ★ データ取得エラー

  // ★★★ 追加 (Turn 101) ★★★
  // (要約欄のテキスト状態)
  const [summaryTexts, setSummaryTexts] = useState<Record<string, string>>({});
  // (要約生成中のローディング状態)
  const [summaryLoading, setSummaryLoading] = useState<Record<string, boolean>>({});

  // ★★★ 修正: recalculateState が DBからロードした要約(loadedSummaries) を受け取るように変更 ★★★
  const recalculateState = useCallback((rows: TableRowData[], loadedSummaries: Record<string, string>) => {
      let currentGroup: AssignmentRow | null = null;
      const newActiveGroups = new Map<string, AssignmentRow>();
      
      // ★★★ 修正: 現在のステートではなく、引数の loadedSummaries をベースにする ★★★
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
      
      // ★★★ 修正: 割り当てが消えても要約は削除しない (ロジックをコメントアウト) ★★★
      // (削除されたグループの要約テキストを削除)
      // Object.keys(newSummaryTexts).forEach(key => {
      //     if (!newActiveGroups.has(key)) {
      //         delete newSummaryTexts[key];
      //     }
      // });

      setActiveGroups(newActiveGroups);
      setSummaryTexts(newSummaryTexts);
  }, []); // ★ useCallback の依存配列から summaryTexts を削除

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

        // ★★★ 修正 (v2.1 / Turn 96) ★★★
        // (data.transcription_result -> data.transcription_data)
        if (data.ai_status !== 'completed' || !data.transcription_data) {
            setError(`この録音(ID: ${recordingId})は、まだAI処理が完了していません。(ステータス: ${data.ai_status})`);
            setTableRows([]);
        
        } else {
            
            // ★★★ 修正: DBからロードした要約を先に取得 ★★★
            const loadedSummaries = data.summary_drafts || {};
            setSummaryTexts(loadedSummaries); // ★ 先にステートにセット
            
            // (v2.1 / Turn 96) 
            // 既に編集済み（スナップショット）か、生の文字起こしかを判定
            // (スナップショットは 'type' を持つ)
            if (data.transcription_data.length > 0 && (data.transcription_data[0] as any).type) {
                // (1) 編集済みスナップショット (TableRowData[])
                console.log("復元: 編集済みスナップショットをロードしました。");
                const loadedRows = data.transcription_data as TableRowData[];
                setTableRows(loadedRows);
                // ★★★ 修正: ロードした要約を recalculateState に渡す ★★★
                recalculateState(loadedRows, loadedSummaries);
            } else {
                // (2) 生の文字起こし (TranscriptionSegment[])
                console.log("復元: 生の文字起こしデータをロードしました。");
                const initialTranscriptRows: TranscriptRow[] = (data.transcription_data as TranscriptionSegment[]).map((seg, index) => ({
                  ...seg,
                  id: `t-${index}-${Math.random()}`, // (簡易的なユニークID)
                  type: 'transcript',
                  assignedTo: null, // 初期状態は未割り当て
                }));
                setTableRows(initialTranscriptRows);
                // ★★★ 修正: ロードした要約を recalculateState に渡す (グループはまだない) ★★★
                recalculateState(initialTranscriptRows, loadedSummaries);
            }
            
            // (保存済みの要約テキストを復元する古いロジックは削除)
        }
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError("文字起こしデータの取得に失敗しました。");
      }
      setLoading(false);
    };
    
    fetchTranscription();
  }, [recordingId, auth.caregiverId, recalculateState]); // ★ recalculateState を依存配列に追加
  
  // (古い recalculateState は削除)

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
        
        // ★★★ 修正: 現在の summaryTexts ステートを渡す ★★★
        recalculateState(updatedRows, summaryTexts); 
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

        // ★★★ 修正: 現在の summaryTexts ステートを渡す ★★★
        recalculateState(updatedRows, summaryTexts); 
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

    // ★★★★★ 修正 (Turn 94) ★★★★★
    // (D&Dロジックをモック に合わせる)
    
    const draggedIndex = tableRows.findIndex(r => r.id === draggedRowId);
    if (draggedIndex === -1) return;
    
    const [draggedItem] = tableRows.splice(draggedIndex, 1);
    
    // ドロップ先行（targetRow）を見つける
    const targetIndex = tableRows.findIndex(r => r.id === targetRow.id);
    if (targetIndex === -1) {
        // (見つからない = テーブルの末尾)
        tableRows.push(draggedItem);
    } else {
        // targetIndex の *前* に挿入
         tableRows.splice(targetIndex, 0, draggedItem);
    }
    // ★★★★★ 修正ここまで ★★★★★
    
    // (状態再計算も同時に行うコールバック形式)
    setTableRows(() => {
        let currentGroup: AssignmentRow | null = null;
        
        // (newRows の代わりに、変更済みの tableRows を使う)
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

        // ★★★ 修正: 現在の summaryTexts ステートを渡す ★★★
        recalculateState(updatedRows, summaryTexts); 
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

        const updatedRows = prevRows.map(row => {
          if (row.type === 'assignment') {
            currentGroup = row;
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
        
        // ★★★ 修正: 現在の summaryTexts ステートを渡す ★★★
        recalculateState(updatedRows, summaryTexts);
        return updatedRows;
    });
  };
  
  // ★★★ 修正 (v2.1 / Turn 101) ★★★
  // --- 6. AI草案 (本実装) ---
  const handleGenerateDraft = async (userId: string, userName: string) => {
      
      // (1) APIキー/モデルを取得
      const apiKey = localStorage.getItem('geminiApiKey');
      const modelId = localStorage.getItem('geminiModelId');
      if (!apiKey || !modelId) {
          setError("Gemini APIキーが設定されていません。右上の設定（歯車）アイコンから設定してください。");
          return;
      }
      
      // (2) このグループ(userId)に割り当てられた発話行を収集
      const assignedTranscripts = tableRows.filter(row => 
          row.type === 'transcript' && row.assignedTo === userId
      ) as TranscriptRow[];
      
      if (assignedTranscripts.length === 0) {
          setError(`「${userName}」に割り当てられた発話がありません。`);
          return;
      }

      setSummaryLoading(prev => ({ ...prev, [userId]: true }));
      setError(null);
      
      // (3) プロンプトを生成
      const conversationLog = assignedTranscripts.map(seg => 
          `${seg.speaker}: ${seg.text}`
      ).join('\n');
      
      const systemPrompt = `あなたは介護記録の作成を支援するAIです。以下の会話ログを分析し、介護士が「${userName}」に関して把握すべき重要な情報（健康状態、発言、行動）を、簡潔な箇条書きで要約してください。`;
      
      try {
          const client = new GeminiApiClient(apiKey);
          const result = await client.generateIsolatedContent(conversationLog, modelId, systemPrompt);
          
          // (4) 結果を該当する textarea に反映
          setSummaryTexts(prev => ({ ...prev, [userId]: result }));
          
      } catch (e) {
          if (e instanceof Error) setError(e.message);
          else setError("AI要約の生成に失敗しました。");
      }
      
      setSummaryLoading(prev => ({ ...prev, [userId]: false }));
  };

  // ★★★ 新設 (v2.1 / Turn 87) ★★★
  // --- 7. 割り当て承認 (本実装) ---
  const handleApproveAssignments = async () => {
    if (!auth.caregiverId || !recordingId) {
        setError("認証情報または録音IDがありません。");
        return;
    }
    
    setSaving(true);
    setError(null);
    
    // (1) 割り当てられたユニークな user_id のリストを作成
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
              // ★★★ 修正 (v2.1 / Turn 96) ★★★
              assignment_snapshot: tableRows, 
              // ★★★ 修正 (v2.1 / Turn 106) ★★★
              summary_drafts: summaryTexts
            }),
        });
        
        if (!response.ok) {
            throw new Error(`割り当ての保存に失敗: ${response.status}`);
        }
        
        // (2) 成功したら画面Bに戻る
        navigate(-1); // (前のページ = 画面B に戻る)
        
    } catch (err) {
       if (err instanceof Error) setError(err.message);
       else setError("割り当ての保存処理中にエラーが発生しました。");
       setSaving(false);
    }
    // (setSaving(false) は成功時には不要)
  };
  
  // ★★★ 追加 (Turn 101) ★★★
  const handleSummaryTextChange = (userId: string, text: string) => {
      setSummaryTexts(prev => ({ ...prev, [userId]: text }));
  };

  // ★★★ 新設: 要約削除ハンドラ ★★★
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
          disabled={loading || saving} // ★
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
                    // ★★★★★ 修正 (Turn 94) ★★★★★
                    // (発話行も DragOver と Drop の対象にする)
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

      {/* --- 動的要約欄 (★★★ 全面修正) --- */}
      {Object.keys(summaryTexts).length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h5" component="h2" gutterBottom>要約</Typography>
          <Grid container spacing={2}>
            {Object.keys(summaryTexts).map(userId => {
              
              // 情報を取得 (割り当てが削除されていても DUMMY_USERS から引く)
              const activeGroup = activeGroups.get(userId);
              const userInfo = DUMMY_USERS.find(u => u.id === userId);
              
              const userName = activeGroup?.userName || userInfo?.name || `不明なID (${userId})`;
              const userColor = activeGroup?.userColor || userInfo?.color || '#808080'; // デフォルト色
              const isGroupActive = activeGroups.has(userId);

              return (
                <Grid xs={12} md={4} key={userId}>
                  <Paper variant="outlined" sx={{ p: 2, borderTop: `4px solid ${userColor}`, opacity: isGroupActive ? 1 : 0.6 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <Typography variant="h6">{userName} 向け要約</Typography>
                       {/* ★ 要約削除ボタン ★ */}
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
                      disabled={summaryLoading[userId] || saving || !isGroupActive} // ★ 割り当てがないとAI生成不可
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
          onClick={handleApproveAssignments} // ★ 修正
          disabled={loading || saving} // ★ 修正
          startIcon={saving ? <CircularProgress size={24} /> : <CheckIcon />} // ★ 修正
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