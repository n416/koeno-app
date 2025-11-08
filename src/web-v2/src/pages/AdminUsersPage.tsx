import React, { useState, useEffect, FormEvent } from 'react';
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
  Link as MuiLink // (react-router-dom の Link と区別)
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom'; // (画面遷移用)

// APIから返される Caregiver の型 (main.py の CaregiverInfo に合わせる)
interface Caregiver {
  caregiver_id: string;
  name: string | null;
  created_at: string;
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

  const API_URL = `${API_BASE_URL}/admin/caregivers`; // -> /api/admin/caregivers

  // 1. (GET) 介護士一覧の取得
  const fetchCaregivers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`APIエラー: ${response.status} ${response.statusText}`);
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
    e.preventDefault(); // フォームの標準送信を防止
    if (!newId) {
      setError('Caregiver ID は必須です。');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiver_id: newId,
          name: newName || null,
        }),
      });

      if (!response.ok) {
        const errMsg = await response.text();
        // (main.py で 409 Conflict を設定)
        if (response.status === 409) {
          throw new Error(errMsg || 'IDが重複しています。');
        }
        throw new Error(errMsg || `登録エラー: ${response.status}`);
      }

      const newData: Caregiver = await response.json();
      // 成功したらリストの先頭に追加 (再フェッチはしない)
      setCaregivers([newData, ...caregivers]);
      // フォームをクリア
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
    
    setError(null);
    try {
      const response = await fetch(`${API_URL}/${idToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errMsg = await response.text();
        throw new Error(errMsg || `削除エラー: ${response.status}`);
      }

      // 成功したらリストから削除 (再フェッチはしない)
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
  }, []);

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
        <Paper sx={{ p: 2, mt: 2, mb: 4, backgroundColor: 'grey.900' }}>
          <Typography variant="h6">新規ID登録</Typography>
          <Box component="form" onSubmit={handleAdd} sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center' }}>
            <TextField
              label="Caregiver ID (必須)"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              required
              disabled={isSubmitting}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              label="名前 (任意)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isSubmitting}
              sx={{ flexGrow: 1 }}
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
                  <TableRow key={c.caregiver_id}>
                    <TableCell component="th" scope="row">
                      {c.caregiver_id}
                    </TableCell>
                    <TableCell>{c.name || '(未設定)'}</TableCell>
                    <TableCell>{new Date(c.created_at).toLocaleString('ja-JP')}</TableCell>
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