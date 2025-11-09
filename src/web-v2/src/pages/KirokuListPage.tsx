import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// MUI Components
import {
  Container,
  Box,
  Typography,
  Grid, // ★ Grid をインポート
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Button,
  CircularProgress,
  Chip,
  Alert // エラー表示用
} from '@mui/material';

// --- v2.1 モック に基づくダミーデータ ---
// GM指示: 入居者リストはハードコードする
const DUMMY_USERS = [
    { id: 'u1', name: '佐藤 様' },
    { id: 'u2', name: '鈴木 様' },
    { id: 'u3', name: '高橋 様' },
    { id: 'u4', name: '田中 様' },
];

// ★★★ タイムゾーン修正: 日付関連の定数を動的に生成 ★★★
const JST_DATE = new Date(); // 現在のJST時刻
const TODAY = JST_DATE.getDate(); // (例: 10)
const CURRENT_YEAR = JST_DATE.getFullYear(); // (例: 2025)
const CURRENT_MONTH_INDEX = JST_DATE.getMonth(); // (0=1月, 10=11月)

// (APIリクエスト用: "2025-11")
const CURRENT_YEAR_MONTH = `${CURRENT_YEAR}-${String(CURRENT_MONTH_INDEX + 1).padStart(2, '0')}`;
// (カレンダー描画用)
const DAYS_IN_MONTH = new Date(CURRENT_YEAR, CURRENT_MONTH_INDEX + 1, 0).getDate(); // (当月の最終日)
const START_DAY_OF_WEEK = new Date(CURRENT_YEAR, CURRENT_MONTH_INDEX, 1).getDay(); // (当月1日の曜日 0=日)
// ★★★ 修正ここまで ★★★


// APIから返される日付リストの型 (main.pyのCareRecordDateList)
interface CareRecordDateList {
    dates: string[]; // (例: ["2025-11-05", "2025-11-08"])
}

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * 画面A: 介護記録一覧 (kirokulist.html)
 */
export const KirokuListPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  // ★ 修正: 初期選択日をハードコード(9)から動的な TODAY に変更
  const [selectedDate, setSelectedDate] = useState<number | null>(TODAY); 
  
  // GM指示: カレンダーマーカーはAPIで取得
  const [recordDates, setRecordDates] = useState<Set<number>>(new Set());
  const [userMarkers, setUserMarkers] = useState<Set<string>>(new Set()); // 入居者リストのマーカー用
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // --- 1. カレンダーマーカーの取得 (画面Aのメインロジック) ---
  const fetchCareRecordDates = useCallback(async (userId: string) => {
    if (!userId || !auth.caregiverId) return;
    setIsLoading(true);
    setError(null);
    
    // ★★★ v2.1 修正: /api が重複しないよう修正 ★★★
    // (API_BASE_URL が /api の場合、 /api/care_records になる)
    // (API_BASE_URL が '' の場合、 /api/care_records になる)
    const url = (API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`) 
                + `/care_records?user_id=${userId}`;

    try {
      // main.pyで新設したAPIを呼ぶ
      const response = await fetch(url, {
          headers: { 'X-Caller-ID': auth.caregiverId } // (認証ヘッダー)
      });
      if (!response.ok) {
        throw new Error(`APIエラー (${response.status})`);
      }
      
      const data: CareRecordDateList = await response.json();
      
      // 日付の "日" (9) だけをSetに格納
      const datesSet = new Set(data.dates.map(dateStr => {
          // (日付形式 "2025-11-09" を 9 に変換)
          // ★ タイムゾーンバグ修正: UTCではなくJST（ローカル時刻）として解釈
          return new Date(dateStr + 'T00:00:00').getUTCDate(); 
      }));
      setRecordDates(datesSet);

    } catch (err) {
      console.error("カレンダーマーカーの取得に失敗:", err);
      setError("記録マーカーの取得に失敗しました。");
      setRecordDates(new Set()); // エラー時はクリア
    }
    setIsLoading(false);
  }, [auth.caregiverId]);

  // --- 2. 入居者リストのマーカー取得 (kirokulist.html の v19 仕様) ---
  // (v2.1ではこのAPIは未実装のため、モックのロジックをそのまま使用)
  const fetchUserMarkers = useCallback((date: number | null) => {
      if (date === null) return;
      
      // モックのロジックを再現
      // (v2.1デモではハードコードされたデータを使う)
      const DUMMY_RECORDS_TEMP: { [key: string]: number[] } = {
          'u1': [5, 7, 8],
          'u2': [6, 7],
          'u3': [5, 6, 7, 8, 9, 10], // ★ GMテスト用に 10日 を追加
          'u4': []
      };

      const markersSet = new Set<string>();
      for (const user of DUMMY_USERS) {
          const records = (DUMMY_RECORDS_TEMP[user.id] || []) as number[];
          if (records.includes(date)) {
              markersSet.add(user.id);
          }
      }
      setUserMarkers(markersSet);
  }, []); // ★ 依存配列から DUMMY_USERS を削除 (定数のため)

  // --- 3. 選択ハンドラ ---

  // ★★★ 修正: `{ {` のタイポを修正 ★★★
  const handleSelectUser = (user: { id: string, name: string }) => {
    setSelectedUserId(user.id);
    setSelectedUserName(user.name);
    fetchCareRecordDates(user.id); // 選択と同時にマーカー取得
  };

  const handleSelectDate = (day: number | null) => {
    setSelectedDate(day);
    fetchUserMarkers(day); // 日付選択時に入居者マーカー更新
  };

  const handleNavigateToDetail = () => {
    if (selectedUserId && selectedDate) {
      // (日付を "2025-11-10" 形式にFIX)
      const dateStr = `${CURRENT_YEAR_MONTH}-${String(selectedDate).padStart(2, '0')}`;
      navigate(`/review/detail/${selectedUserId}/${dateStr}`);
    }
  };

  // --- 4. 初期読み込み ---
  useEffect(() => {
    // ページロード時に「本日」の入居者マーカーを読み込む
    fetchUserMarkers(TODAY);
  }, [fetchUserMarkers]);


  // --- 5. カレンダー描画ロジック (useMemoで最適化) ---
  const calendarGrid = useMemo(() => {
    const grid = [];
    // ヘッダー
    ['日', '月', '火', '水', '木', '金', '土'].forEach(day => {
      grid.push(<Paper key={day} elevation={0} sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.200' }}>{day}</Paper>);
    });
    // 空白
    for (let i = 0; i < START_DAY_OF_WEEK; i++) {
      grid.push(<Paper key={`empty-${i}`} elevation={0} sx={{ minHeight: 110, bgcolor: 'grey.50', border: '1px solid #eee' }} />);
    }
    // 日付
    for (let i = 1; i <= DAYS_IN_MONTH; i++) {
      const dayNum = i;
      const isToday = dayNum === TODAY;
      const isActive = dayNum === selectedDate;
      const hasRecord = recordDates.has(dayNum); // APIから取得したマーカー

      grid.push(
        <Paper
          key={dayNum}
          variant={isActive ? 'elevation' : 'outlined'}
          elevation={isActive ? 4 : 0}
          onClick={() => handleSelectDate(dayNum)}
          sx={{
            minHeight: 110,
            p: 1,
            cursor: 'pointer',
            bgcolor: isActive ? 'primary.main' : (isToday ? '#fff8e1' : 'background.paper'),
            color: isActive ? 'primary.contrastText' : 'text.primary',
            border: '1px solid',
            borderColor: isActive ? 'primary.dark' : 'grey.300',
            position: 'relative',
            '&:hover': {
              bgcolor: isActive ? 'primary.dark' : '#e0f0ff',
            }
          }}
        >
          <Typography variant="body1" fontWeight={isActive || isToday ? 'bold' : 'normal'}>
            {dayNum}
          </Typography>
          {hasRecord && (
            <Chip 
              label="記録あり" 
              size="small" 
              color={isActive ? 'default' : 'success'}
              sx={{ 
                position: 'absolute', 
                bottom: 8, 
                left: 8,
                bgcolor: isActive ? 'background.paper' : undefined,
                color: isActive ? 'text.primary' : undefined
              }}
            />
          )}
        </Paper>
      );
    }
    return grid;
  // ★ 修正: 依存配列に動的定数を追加
  }, [selectedDate, recordDates, DAYS_IN_MONTH, START_DAY_OF_WEEK, TODAY]); 

  // --- 6. JSX ---
  // ★ 修正: 月表示を動的に (例: 2025年 11月)
  const monthTitle = `${CURRENT_YEAR}年 ${CURRENT_MONTH_INDEX + 1}月`;

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      {/* ★ 構文修正: Grid container */}
      <Grid container spacing={3}>
        
        {/* --- メインコンテンツ (カレンダー) --- */}
        {/* ★★★ 修正: `item xs/md` を `size` に戻す ★★★ */}
        <Grid size={{ xs: 12, md: 9 }}>
          <Paper sx={{ p: 2, overflow: 'hidden' }}> {/* (overflow hidden) */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
              {/* ★ 修正: 月表示を動的に */}
              <Typography variant="h5" sx={{ mr: 2 }}>{monthTitle}</Typography>
              <Typography variant="h6" color="text.secondary">
                {selectedUserName || '（入居者を選択してください）'}
              </Typography>
            </Box>
            
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}> {/* (gap 0.5) */}
              {calendarGrid}
            </Box>
            
            {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <CircularProgress />
              </Box>
            )}
          </Paper>
        </Grid>

        {/* --- サイドバー (入居者リスト) --- */}
        {/* ★★★ 修正: `item xs/md` を `size` に戻す ★★★ */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              担当入居者
            </Typography>
            <List component="nav" sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {DUMMY_USERS.map(user => (
                <ListItemButton
                  key={user.id}
                  selected={selectedUserId === user.id}
                  onClick={() => handleSelectUser(user)}
                >
                  <ListItemText primary={user.name} />
                  {userMarkers.has(user.id) && <Chip label="記録あり" size="small" color="success" />}
                </ListItemButton>
              ))}
            </List>
            
            <Button
              variant="contained"
              color="success"
              fullWidth
              disabled={!selectedUserId || !selectedDate}
              onClick={handleNavigateToDetail}
              sx={{ mt: 2, p: 2, fontSize: '1.1em', fontWeight: 'bold' }}
            >
              {selectedUserId && selectedDate 
                ? `${CURRENT_MONTH_INDEX + 1}/${selectedDate} (${selectedUserName}) の記録を作成` // ★ 月表示を動的に
                : '入居者と日付を選択'
              }
            </Button>
          </Paper>
        </Grid>

      </Grid>
    </Container>
  );
};

// コンポーネントをデフォルトエクスポート
export default KirokuListPage;