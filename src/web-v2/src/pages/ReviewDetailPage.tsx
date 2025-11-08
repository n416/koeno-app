import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ★★★ Task 2.2: MUIコンポーネントをインポート ★★★
import {
  Container,
  Box,
  Typography,
  Button,
  AppBar,
  Toolbar,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardHeader,
  CardContent,
  CircularProgress,
  Alert,
  Fab, // フローティングボタン
  Link as MuiLink
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Check as CheckIcon } from '@mui/icons-material';

// Task 5 で生成される transcription_result のJSON内の型
interface TranscriptionSegment {
  speaker: string; // "SPEAKER_00", "SPEAKER_01" など
  start: number;
  end: number;
  text: string;
}

// 話者ごとの色を定義 (Task 6.3c)
// (MUIのテーマカラー（dark）でも見やすいように調整)
const SPEAKER_COLORS: { [key: string]: { bg: string, text: string } } = {
  'SPEAKER_00': { bg: '#5c001f', text: '#ffebee' }, // (例: 暗い赤系)
  'SPEAKER_01': { bg: '#00363d', text: '#e0f7fa' }, // (例: 暗い青系)
  'SPEAKER_02': { bg: '#003300', text: '#e8f5e9' }, // (例: 暗い緑系)
  'UNKNOWN':    { bg: '#424242', text: '#eeeeee' }, // (例: グレー)
};

/**
 * Task 6.3: 記録詳細・レビュー画面
 * Task 2.2: MUI化
 */
export const ReviewDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  
  // (Dashboardから渡された `state.recordData` を取得)
  const initialData = (location.state as { recordData: any })?.recordData;
  
  const [record, setRecord] = useState<any>(initialData);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [error, setError] = useState('');
  
  // ★★★ Task 2.2: ローディング状態を追加 ★★★
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (!auth.caregiverId) {
      navigate('/review'); // 認証切れ
      return;
    }
    
    if (!record) {
      // (もし一覧から state で渡されなかった場合 - APIフェッチ処理)
      // (Task 6 の指示では /record/:id のAPIは無いため、ここではエラー扱いにします)
      setError('レコード情報がありません。ダッシュボードから戻り直してください。');
      setLoading(false);
      return;
    }
    
    // Task 5 で生成された transcription_result (JSON文字列) をパース
    try {
      if (record.transcription_result && typeof record.transcription_result === 'string') {
        const parsedSegments = JSON.parse(record.transcription_result);
        setSegments(parsedSegments);
      } else if (record.transcription_result) {
        setSegments(record.transcription_result); // (もし既にJSONオブジェクトなら)
      } else {
        // (エラーではなく、空の警告にする)
        console.warn('文字起こし結果 (transcription_result) が空です。');
        setSegments([]);
      }
    } catch (e: any) {
      setError(`文字起こし結果のJSONパースに失敗しました: ${e.message}`);
    }
    setLoading(false);
  }, [record, auth.caregiverId, navigate]);

  /**
   * Task 6.3c: テキストの修正機能
   */
  const handleTextChange = (index: number, newText: string) => {
    const updatedSegments = [...segments];
    updatedSegments[index].text = newText;
    setSegments(updatedSegments);
  };

  /**
   * Task 6.3c: 承認ボタンのAPIコール (ダミー)
   */
  const handleApprove = async () => {
    alert('「承認」ボタンが押されました。\n(Task 6ではAPIコールはダミーです)\n修正後JSON:\n' + JSON.stringify(segments, null, 2));
    // (将来的にここで PUT /my_records/:id { segments, patient_id, status: "approved" } などを呼ぶ)
    navigate('/review/dashboard');
  };

  
  // --- JSX (MUI) ---
  return (
    <Box sx={{ flexGrow: 1, pb: 10 }}> {/* フローティングボタンのスペース確保 */}
      {/* --- 1. ヘッダー --- */}
      <AppBar position="static">
        <Toolbar>
          <Button
            color="inherit"
            component={RouterLink}
            to="/review/dashboard"
            startIcon={<ArrowBackIcon />}
          >
            ダッシュボードに戻る
          </Button>
          <Typography variant="h6" component="div" sx={{ ml: 2 }}>
            記録レビュー (ID: {id})
          </Typography>
        </Toolbar>
      </AppBar>

      {/* --- 2. メインコンテンツ --- */}
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>

        {/* --- エラー表示 --- */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
            {record ? null : (
              <MuiLink component={RouterLink} to="/review/dashboard" sx={{ ml: 1 }}>
                ダッシュボードに戻る
              </MuiLink>
            )}
          </Alert>
        )}

        {/* --- ローディング --- */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* --- 詳細表示 (レコードがある場合) --- */}
        {!loading && record && (
          <Box>
            {/* --- 記録詳細 --- */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" gutterBottom>記録詳細</Typography>
              <Typography variant="body1">
                <strong>録音日時:</strong> {new Date(record.created_at).toLocaleString('ja-JP')}
              </Typography>
              <Typography variant="body1">
                <strong>メモ:</strong> {record.memo_text || '(メモなし)'}
              </Typography>
            </Paper>

            {/* --- 対象者の紐付け --- */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" gutterBottom>対象者の紐付け (UIのみ)</Typography>
              <FormControl fullWidth>
                <InputLabel id="patient-select-label">対象者を選択</InputLabel>
                <Select
                  labelId="patient-select-label"
                  label="対象者を選択"
                  defaultValue="A" // (ダミー値)
                >
                  <MenuItem value="A">A. 田中様</MenuItem>
                  <MenuItem value="B">B. 鈴木様</MenuItem>
                  <MenuItem value="C">C. 佐藤様</MenuItem>
                </Select>
              </FormControl>
            </Paper>

            {/* --- 文字起こし結果 (修正可) --- */}
            <Typography variant="h5" gutterBottom>文字起こし結果 (修正可)</Typography>
            {segments.map((seg, index) => {
              const speakerColor = SPEAKER_COLORS[seg.speaker] || SPEAKER_COLORS['UNKNOWN'];
              
              return (
                <Card key={index} sx={{ mb: 2 }}>
                  <CardHeader
                    title={`${seg.speaker} (${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s)`}
                    sx={{ 
                      backgroundColor: speakerColor.bg,
                      color: speakerColor.text,
                      py: 1 // (高さを少し詰める)
                    }}
                    titleTypographyProps={{ variant: 'subtitle1' }}
                  />
                  <CardContent>
                    <TextField
                      value={seg.text}
                      onChange={(e) => handleTextChange(index, e.target.value)}
                      multiline
                      fullWidth
                      variant="outlined"
                      sx={{
                        '& .MuiInputBase-root': {
                          backgroundColor: 'grey.800' // (ダークモード用の背景色)
                        }
                      }}
                    />
                  </CardContent>
                </Card>
              );
            })}
            
            {segments.length === 0 && !error && (
              <Typography>文字起こし結果はありません。</Typography>
            )}

          </Box>
        )}

      </Container>
      
      {/* --- 3. 承認ボタン (画面右下に固定) --- */}
      {!loading && record && (
        <Fab
          variant="extended"
          color="primary"
          onClick={handleApprove}
          sx={{
            position: 'fixed',
            bottom: 32,
            right: 32,
          }}
        >
          <CheckIcon sx={{ mr: 1 }} />
          この内容で承認する
        </Fab>
      )}
    </Box>
  );
};