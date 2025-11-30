import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// MUI Components
import {
  Container,
  Box,
  Typography,
  Grid,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Button,
  CircularProgress,
  Chip,
  Alert
} from '@mui/material';

// ★★★ Task: 共通ユーザーマスタの使用 ★★★
import { USERS_MASTER } from '../data/usersMaster';

// ローカル定義の DUMMY_USERS を削除

// ★★★ タイムゾーン修正: 日付関連の定数を動的に生成 ★★★
const JST_DATE = new Date(); 
const TODAY = JST_DATE.getDate(); 
const CURRENT_YEAR = JST_DATE.getFullYear();
const CURRENT_MONTH_INDEX = JST_DATE.getMonth(); 

const CURRENT_YEAR_MONTH = `${CURRENT_YEAR}-${String(CURRENT_MONTH_INDEX + 1).padStart(2, '0')}`;
const DAYS_IN_MONTH = new Date(CURRENT_YEAR, CURRENT_MONTH_INDEX + 1, 0).getDate();
const START_DAY_OF_WEEK = new Date(CURRENT_YEAR, CURRENT_MONTH_INDEX, 1).getDay();
// ★★★ 修正ここまで ★★★


interface CareRecordDateList {
    dates: string[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const SESSION_KEY_USER_ID = 'koeno_selected_user_id';
const SESSION_KEY_USER_NAME = 'koeno_selected_user_name';

/**
 * 画面A: 介護記録一覧
 */
export const KirokuListPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    () => sessionStorage.getItem(SESSION_KEY_USER_ID) || null
  );
  const [selectedUserName, setSelectedUserName] = useState<string>(
    () => sessionStorage.getItem(SESSION_KEY_USER_NAME) || ''
  );

  const [selectedDate, setSelectedDate] = useState<number | null>(TODAY); 
  
  const [recordDates, setRecordDates] = useState<Set<number>>(new Set());
  const [userMarkers, setUserMarkers] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // --- 1. カレンダーマーカーの取得 ---
  const fetchCareRecordDates = useCallback(async (userId: string) => {
    if (!userId || !auth.caregiverId) return;
    setIsLoading(true);
    setError(null);
    
    const url = (API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`) 
                + `/care_records?user_id=${userId}`;

    try {
      const response = await fetch(url, {
          headers: { 'X-Caller-ID': auth.caregiverId } 
      });
      if (!response.ok) {
        throw new Error(`APIエラー (${response.status})`);
      }
      
      const data: CareRecordDateList = await response.json();
      
      const datesSet = new Set(data.dates.map(dateStr => {
          try {
            return parseInt(dateStr.split('-')[2], 10);
          } catch (e) {
            return 0;
          }
      }));
      setRecordDates(datesSet);

    } catch (err) {
      console.error("カレンダーマーカーの取得に失敗:", err);
      setError("記録マーカーの取得に失敗しました。");
      setRecordDates(new Set());
    }
    setIsLoading(false);
  }, [auth.caregiverId]);

  // --- 2. 入居者リストのマーカー取得 ---
  const fetchUserMarkers = useCallback((date: number | null) => {
      if (date === null) return;
      
      // モックロジック (v2.1デモ用)
      const DUMMY_RECORDS_TEMP: { [key: string]: number[] } = {
          'u1': [5, 7, 8],
          'u2': [6, 7],
          'u3': [5, 6, 7, 8, 9, 10], 
          'u4': []
      };

      const markersSet = new Set<string>();
      // ★ USERS_MASTER を使用してループ
      for (const user of USERS_MASTER) {
          const records = (DUMMY_RECORDS_TEMP[user.id] || []) as number[];
          if (records.includes(date)) {
              markersSet.add(user.id);
          }
      }
      setUserMarkers(markersSet);
  }, []); 

  // --- 3. 選択ハンドラ ---
  const handleSelectUser = (user: { id: string, displayName: string }) => {
    setSelectedUserId(user.id);
    setSelectedUserName(user.displayName); // ★ 表示名をセット
    sessionStorage.setItem(SESSION_KEY_USER_ID, user.id);
    sessionStorage.setItem(SESSION_KEY_USER_NAME, user.displayName); // ★ 表示名を保存

    fetchCareRecordDates(user.id);
  };

  const handleSelectDate = (day: number | null) => {
    setSelectedDate(day);
    fetchUserMarkers(day);
  };

  const handleNavigateToDetail = () => {
    if (selectedUserId && selectedDate) {
      const dateStr = `${CURRENT_YEAR_MONTH}-${String(selectedDate).padStart(2, '0')}`;
      navigate(`/review/detail/${selectedUserId}/${dateStr}`);
    }
  };

  // --- 4. 初期読み込み ---
  useEffect(() => {
    fetchUserMarkers(TODAY);
    
    if (selectedUserId) {
      fetchCareRecordDates(selectedUserId);
    }
  }, [fetchUserMarkers, selectedUserId, fetchCareRecordDates]); 


  // --- 5. カレンダー描画ロジック ---
  const calendarGrid = useMemo(() => {
    const grid = [];
    ['日', '月', '火', '水', '木', '金', '土'].forEach(day => {
      grid.push(<Paper key={day} elevation={0} sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.200' }}>{day}</Paper>);
    });
    for (let i = 0; i < START_DAY_OF_WEEK; i++) {
      grid.push(<Paper key={`empty-${i}`} elevation={0} sx={{ minHeight: 110, bgcolor: 'grey.50', border: '1px solid #eee' }} />);
    }
    for (let i = 1; i <= DAYS_IN_MONTH; i++) {
      const dayNum = i;
      const isToday = dayNum === TODAY;
      const isActive = dayNum === selectedDate;
      const hasRecord = recordDates.has(dayNum); 

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
  }, [selectedDate, recordDates, DAYS_IN_MONTH, START_DAY_OF_WEEK, TODAY]); 

  // --- 6. JSX ---
  const monthTitle = `${CURRENT_YEAR}年 ${CURRENT_MONTH_INDEX + 1}月`;

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Grid container spacing={3}>
        
        {/* --- メインコンテンツ (カレンダー) --- */}
        <Grid size={{ xs: 12, md: 9 }}>
          <Paper sx={{ p: 2, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
              <Typography variant="h5" sx={{ mr: 2 }}>{monthTitle}</Typography>
              <Typography variant="h6" color="text.secondary">
                {selectedUserName || '（入居者を選択してください）'}
              </Typography>
            </Box>
            
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
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
        <Grid size={{ xs: 12, md: 3 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              担当入居者
            </Typography>
            <List component="nav" sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {/* ★ USERS_MASTER を使用してリスト表示 */}
              {USERS_MASTER.map(user => (
                <ListItemButton
                  key={user.id}
                  selected={selectedUserId === user.id}
                  onClick={() => handleSelectUser(user)}
                >
                  {/* ★ displayName ("佐藤 様") を使用 */}
                  <ListItemText primary={user.displayName} />
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
                ? `${CURRENT_MONTH_INDEX + 1}/${selectedDate} (${selectedUserName}) の記録を作成`
                : '入居者と日付を選択'
              }
            </Button>
          </Paper>
        </Grid>

      </Grid>
    </Container>
  );
};

export default KirokuListPage;