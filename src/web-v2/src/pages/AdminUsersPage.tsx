import { useState, useEffect, type FormEvent } from 'react';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Alert,
  Link as MuiLink
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// APIから返される Caregiver の型 (main.py の CaregiverInfo に合わせる)
interface Caregiver {
  caregiver_id: string;
  name: string | null;
  created_at: string | null; // (v1.8修正: null許容)
}

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Task 1.3 & 1.4: IDマスタ管理ページ (MUI実装)
 */
export const AdminUsersPage = () => {
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 新規登録フォーム用のState
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ★★★ Task 8.1 (フロント対応): 認証フックを使用 ★★★
  const auth = useAuth();
  const callerId = auth.caregiverId; // ログイン中の管理者ID

  const API_URL = `${API_BASE_URL}/admin/caregivers`; // -> /api/admin/caregivers

  // 1. (GET) 介護士一覧の取得
  const fetchCaregivers = async () => {
    setLoading(true);
    setError(null);

    // ★★★ Task 8.1 (フロント対応): 認証チェック ★★★
    if (!callerId) {
      setError("認証情報が見つかりません。");
      setLoading(false);
      return;
    }

    try {
      // ★★★ Task 8.1 (フロント対応): X-Caller-ID ヘッダーを追加 ★★★
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'X-Caller-ID': callerId,
        }
      });
      if (!response.ok) {
        // (403 Forbidden が返ることを期待)
        const errMsg = await response.text();
        throw new Error(errMsg || `APIエラー: ${response.status}`);
      }
      const data: Caregiver[] = await response.json();
      setCaregivers(data);
    } catch (err) {
      if (err instanceof Error) {
        setError(`一覧の読み込みに失敗しました: ${err.message}`);
      } else {
        setError('一覧の読み込みに失敗しました。');
      }
    }
    setLoading(false);
  };

  // 2. (POST) 新規登録
  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newId) {
      setError('Caregiver ID は必須です。');
      return;
    }
    // ★★★ Task 8.1 (フロント対応): 認証チェック ★★★
    if (!callerId) {
      setError("認証情報が見つかりません。");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // ★★★ Task 8.1 (フロント対応): X-Caller-ID ヘッダーを追加 ★★★
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Caller-ID': callerId,
        },
        body: JSON.stringify({
          caregiver_id: newId,
          name: newName || null,
        }),
      });

      if (!response.ok) {
        const errMsg = await response.text();
        if (response.status === 409) {
          throw new Error(errMsg || 'IDが重複しています。');
        }
        // (403 Forbidden が返ることを期待)
        throw new Error(errMsg || `登録エラー: ${response.status}`);
      }

      const newData: Caregiver = await response.json();
      setCaregivers([newData, ...caregivers]);
      setNewId('');
      setNewName('');

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('IDの登録に失敗しました。');
      }
    }
    setIsSubmitting(false);
  };

  // 3. (DELETE) 削除
  const handleDelete = async (idToDelete: string) => {
    if (!window.confirm(`ID: ${idToDelete} を本当に削除しますか？`)) {
      return;
    }

    // ★★★ Task 8.1 (フロント対応): 認証チェック ★★★
    if (!callerId) {
      setError("認証情報が見つかりません。");
      return;
    }

    setError(null);
    try {
      // ★★★ Task 8.1 (フロント対応): X-Caller-ID ヘッダーを追加 ★★★
      const response = await fetch(`${API_URL}/${idToDelete}`, {
        method: 'DELETE',
        headers: {
          'X-Caller-ID': callerId,
        }
      });

      if (!response.ok) {
        const errMsg = await response.text();
        // (403 Forbidden / 404 Not Found が返ることを期待)
        throw new Error(errMsg || `削除エラー: ${response.status}`);
      }

      setCaregivers(caregivers.filter(c => c.caregiver_id !== idToDelete));

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('IDの削除に失敗しました。');
      }
    }
  };

  // --- 初期読み込み ---
  useEffect(() => {
    fetchCaregivers();
  }, [callerId]); // ★ 依存配列に callerId を追加

  // --- JSX (MUI) ---
  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          IDマスタ管理
        </Typography>
        <MuiLink component={RouterLink} to="/review/dashboard">
          ← ダッシュボードに戻る
        </MuiLink>

        {/* --- 1. 新規登録フォーム --- */}
        {/* ★★★ 修正: backgroundColor: 'grey.900' を削除 ★★★ */}
        <Paper sx={{ p: 2, mt: 2, mb: 4 }}>
          <Typography variant="h6">新規ID登録</Typography>
          <Box component="form" onSubmit={handleAdd} sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center' }}>
            <TextField
              label="Caregiver ID (必須)"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              required
              disabled={isSubmitting}
              sx={{ flexGrow: 1 }}
              variant="outlined" // (明示)
            />
            <TextField
              label="名前 (任意)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isSubmitting}
              sx={{ flexGrow: 1 }}
              variant="outlined" // (明示)
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting}
              sx={{ height: '56px' }}
            >
              {isSubmitting ? <CircularProgress size={24} /> : '登録'}
            </Button>
          </Box>
        </Paper>

        {/* --- 2. エラー表示 --- */}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* --- 3. 介護士一覧テーブル --- */}
        <Typography variant="h6" gutterBottom>
          登録済みID一覧
        </Typography>
        {loading ? (
          <CircularProgress />
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Caregiver ID</TableCell>
                  <TableCell>名前</TableCell>
                  <TableCell>登録日時 (UTC)</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {caregivers.map((c) => (
                  <TableRow
                    key={c.caregiver_id}
                    hover
                  >
                    <TableCell component="th" scope="row">
                      {c.caregiver_id}
                    </TableCell>
                    <TableCell>{c.name || '(未設定)'}</TableCell>
                    {/* ★ v1.8 エラー修正: c.created_at が null の可能性に対応 */}
                    <TableCell>
                      {c.created_at ? new Date(c.created_at).toLocaleString('ja-JP') : '(日時不明)'}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDelete(c.caregiver_id)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Container>
  );
};