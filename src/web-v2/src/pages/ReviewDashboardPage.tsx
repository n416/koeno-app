import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link as RouterLink } from 'react-router-dom'; // (RouterLinkとしてインポート)
import { db, type LocalRecording } from '../db'; // (import type)

// ★★★ Task 2.2: MUIコンポーネントをインポート ★★★
import {
  Container,
  Box,
  Typography,
  Button,
  AppBar,
  Toolbar,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import { AdminPanelSettings as AdminIcon } from '@mui/icons-material'; // アイコン

// main.py の RecordSummary に合わせた型定義
interface CompletedRecord {
  recording_id: number;
  ai_status: string;
  memo_text?: string;
  transcription_result?: any; // JSON
  summary_result?: string;
  created_at: string; // (JSONはDate型をstringで返す)
}

/**
 * Task 6.2: 記録一覧 (ダッシュボード)
 * Task 2.2: MUI化
 */
export const ReviewDashboardPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CompletedRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // .env から API のベース URL を取得 ( "/api" または undefined が入る)
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
  // ★ 修正: 相対パス (プロキシ 経由) にする
  const API_URL = `${API_BASE_URL}/my_records`; // -> /api/my_records

  useEffect(() => {
    if (!auth.caregiverId) {
      // 認証されていない場合はAdminAuthにリダイレクト
      navigate('/review');
      return;
    }
    
    // /api/my_records エンドポイントを呼び出す
    const fetchRecords = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_URL}?caregiver_id=${auth.caregiverId}`);
        
        if (response.ok) {
          const data: CompletedRecord[] = await response.json();
          setRecords(data);
        } else {
          const errMsg = await response.text();
          console.error("APIエラー詳細:", errMsg);
          setError(`APIエラー: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        // (TSエラー修正済み)
        console.error("通信エラー詳細:", err);
        if (err instanceof Error) {
          setError(`通信エラー: ${err.message}`);
        } else {
          setError(`通信エラー: 不明なエラーが発生しました (${String(err)})`);
        }
      }
      setLoading(false);
    };

    fetchRecords();
  }, [auth.caregiverId, navigate, API_URL]);

  const handleLogout = () => {
    auth.logout();
    navigate('/review');
  };

  return (
    // ★★★ Task 2.2: MUI化 ★★★
    <Box sx={{ flexGrow: 1 }}>
      {/* --- 1. ヘッダー --- */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            記録レビュー ({auth.caregiverId} さん)
          </Typography>
          
          {/* ★ Task 1.3 への導線 */}
          <Button
            color="inherit"
            component={RouterLink}
            to="/review/admin/users"
            startIcon={<AdminIcon />}
            sx={{ mr: 2 }}
          >
            ID管理
          </Button>

          <Button color="inherit" onClick={handleLogout}>
            ログアウト
          </Button>
        </Toolbar>
      </AppBar>

      {/* --- 2. メインコンテンツ --- */}
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {!loading && !error && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>録音ID</TableCell>
                  <TableCell>日時</TableCell>
                  <TableCell>メモ</TableCell>
                  <TableCell>ステータス</TableCell>
                  <TableCell>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map(record => (
                  <TableRow 
                    key={record.recording_id}
                    hover // マウスオーバーで色変更
                  >
                    <TableCell>{record.recording_id}</TableCell>
                    <TableCell>{new Date(record.created_at).toLocaleString('ja-JP')}</TableCell>
                    <TableCell sx={{ maxWidth: '300px' }}>
                      {record.memo_text || '(メモなし)'}
                    </TableCell>
                    <TableCell>
                      <Chip label={record.ai_status} color="success" size="small" />
                    </TableCell>
                    <TableCell>
                      {/* (バグ修正済み: Link に state を追加) */}
                      <Button
                        variant="contained"
                        component={RouterLink}
                        to={`/review/detail/${record.recording_id}`}
                        state={{ recordData: record }} 
                      >
                        レビュー・修正
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        
        {!loading && records.length === 0 && (
          <Typography sx={{ mt: 4, textAlign: 'center' }}>
            表示する完了済みレコードはありません。
          </Typography>
        )}

      </Container>
    </Box>
  );
};