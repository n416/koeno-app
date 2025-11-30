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
  Link as MuiLink,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Stack
} from '@mui/material';
import { 
  Delete as DeleteIcon, 
  QrCode as QrCodeIcon, 
  Refresh as RefreshIcon,
  Download as DownloadIcon // ★ 追加
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { QRCodeSVG } from 'qrcode.react';

// APIから返される Caregiver の型
interface Caregiver {
  caregiver_id: string;
  name: string | null;
  created_at: string | null;
  qr_token: string | null;
}

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const AdminUsersPage = () => {
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 新規登録フォーム用
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // QRモーダル用
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedQrUser, setSelectedQrUser] = useState<Caregiver | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const auth = useAuth();
  const callerId = auth.caregiverId;
  const API_URL = `${API_BASE_URL}/admin/caregivers`;

  const fetchCaregivers = async () => {
    setLoading(true);
    setError(null);
    if (!callerId) {
      setError("認証情報が見つかりません。");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: { 'X-Caller-ID': callerId }
      });
      if (!response.ok) throw new Error(await response.text() || `APIエラー: ${response.status}`);
      const data: Caregiver[] = await response.json();
      setCaregivers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '一覧の読み込みに失敗しました。');
    }
    setLoading(false);
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newId || !callerId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Caller-ID': callerId },
        body: JSON.stringify({ caregiver_id: newId, name: newName || null }),
      });
      if (!response.ok) throw new Error(await response.text() || `登録エラー: ${response.status}`);
      const newData: Caregiver = await response.json();
      setCaregivers([newData, ...caregivers]);
      setNewId('');
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'IDの登録に失敗しました。');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (idToDelete: string) => {
    if (!window.confirm(`ID: ${idToDelete} を本当に削除しますか？`)) return;
    if (!callerId) return;
    setError(null);
    try {
      const response = await fetch(`${API_URL}/${idToDelete}`, {
        method: 'DELETE',
        headers: { 'X-Caller-ID': callerId }
      });
      if (!response.ok) throw new Error(await response.text() || `削除エラー: ${response.status}`);
      setCaregivers(caregivers.filter(c => c.caregiver_id !== idToDelete));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'IDの削除に失敗しました。');
    }
  };

  // QRコード表示
  const handleOpenQr = (user: Caregiver) => {
    setSelectedQrUser(user);
    setQrModalOpen(true);
  };

  // QR再発行
  const handleResetQr = async () => {
    if (!selectedQrUser || !callerId) return;
    if (!window.confirm("QRコードを再発行します。\n古いQRコードは使用できなくなりますがよろしいですか？")) return;
    
    setIsResetting(true);
    try {
      const response = await fetch(`${API_URL}/${selectedQrUser.caregiver_id}/reset_qr`, {
        method: 'POST',
        headers: { 'X-Caller-ID': callerId }
      });
      if (!response.ok) throw new Error(await response.text() || "再発行エラー");
      
      const updatedUser: Caregiver = await response.json();
      
      // リストとモーダルの表示を更新
      setCaregivers(caregivers.map(c => c.caregiver_id === updatedUser.caregiver_id ? updatedUser : c));
      setSelectedQrUser(updatedUser);
      
    } catch(e) {
      alert("再発行に失敗しました: " + e);
    }
    setIsResetting(false);
  };

  // ★ 追加: QRコードダウンロード機能
  const handleDownloadQR = (userName: string) => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    // 1. SVGデータを文字列化
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    // 2. Base64エンコードしてImageオブジェクトにロード
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));

    img.onload = () => {
      // 3. Canvasに描画してPNG化
      // (解像度を上げるため、元のSVGサイズより大きく描画しても良いが、ここでは等倍)
      canvas.width = img.width; 
      canvas.height = img.height;
      
      if (ctx) {
        // 白背景を描画（PNG透過対策）
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      }
      
      const pngFile = canvas.toDataURL('image/png');
      
      // 4. リンクを作成してクリック
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR_${userName}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
  };

  useEffect(() => { fetchCaregivers(); }, [callerId]);

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>IDマスタ管理</Typography>
        <MuiLink component={RouterLink} to="/review/dashboard">← ダッシュボードに戻る</MuiLink>

        <Paper sx={{ p: 2, mt: 2, mb: 4 }}>
          <Typography variant="h6">新規ID登録</Typography>
          <Box component="form" onSubmit={handleAdd} sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'center' }}>
            <TextField label="Caregiver ID (必須)" value={newId} onChange={(e) => setNewId(e.target.value)} required disabled={isSubmitting} sx={{ flexGrow: 1 }} variant="outlined" />
            <TextField label="名前 (任意)" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={isSubmitting} sx={{ flexGrow: 1 }} variant="outlined" />
            <Button type="submit" variant="contained" color="primary" disabled={isSubmitting} sx={{ height: '56px' }}>{isSubmitting ? <CircularProgress size={24} /> : '登録'}</Button>
          </Box>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography variant="h6" gutterBottom>登録済みID一覧</Typography>
        {loading ? <CircularProgress /> : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Caregiver ID</TableCell>
                  <TableCell>名前</TableCell>
                  <TableCell>登録日時 (UTC)</TableCell>
                  <TableCell align="center">QR</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {caregivers.map((c) => (
                  <TableRow key={c.caregiver_id} hover>
                    <TableCell component="th" scope="row">{c.caregiver_id}</TableCell>
                    <TableCell>{c.name || '(未設定)'}</TableCell>
                    <TableCell>{c.created_at ? new Date(c.created_at).toLocaleString('ja-JP') : '(日時不明)'}</TableCell>
                    <TableCell align="center">
                      <IconButton onClick={() => handleOpenQr(c)} color="primary" title="QRコードを表示">
                        <QrCodeIcon />
                      </IconButton>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton onClick={() => handleDelete(c.caregiver_id)} color="error" title="削除">
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

      {/* QR表示モーダル */}
      <Dialog open={qrModalOpen} onClose={() => setQrModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center' }}>ログイン用QRコード</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3 }}>
          {selectedQrUser && selectedQrUser.qr_token ? (
            <>
              <Box sx={{ p: 2, border: '4px solid #333', borderRadius: 2, bgcolor: 'white' }}>
                {/* ★ id="qr-code-svg" を追加 */}
                <QRCodeSVG id="qr-code-svg" value={selectedQrUser.qr_token} size={200} level="H" />
              </Box>
              <Typography variant="h6" sx={{ mt: 2, fontWeight: 'bold' }}>
                {selectedQrUser.name || '名称未設定'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ID: {selectedQrUser.caregiver_id}
              </Typography>
              
              {/* ボタン群 */}
              <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                {/* ★ ダウンロードボタン追加 */}
                <Button 
                  startIcon={<DownloadIcon />} 
                  variant="contained"
                  onClick={() => handleDownloadQR(selectedQrUser.name || selectedQrUser.caregiver_id)}
                >
                  ダウンロード
                </Button>

                <Button 
                  startIcon={<RefreshIcon />} 
                  color="error" 
                  variant="outlined" 
                  onClick={handleResetQr}
                  disabled={isResetting}
                >
                  {isResetting ? '更新中...' : '再発行'}
                </Button>
              </Stack>
            </>
          ) : (
            <Typography>データ読み込みエラー</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrModalOpen(false)}>閉じる</Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
};