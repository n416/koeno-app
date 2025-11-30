import React, { useState, useEffect } from 'react';
import {
  Box, Button, Typography, Grid, Chip, TextField, Divider, Paper, Stack,
  Slider, CircularProgress
} from '@mui/material';
import { AccessTime as TimeIcon } from '@mui/icons-material';
import lifeSchema from '../data/life_schema.json';

// --- 型定義 ---
interface SchemaCategory {
  id: string;
  label: string;
  color: string;
  items: string[];
}

export interface CareTouchRecord {
  place: string | null;
  category: string;
  tags: string[];
  conditions: string[];
  note: string;
  timestamp: string; // ISO String
}

interface CareTouchProps {
  initialData?: Partial<CareTouchRecord>;
  onSave: (data: CareTouchRecord) => void;
  isSaving?: boolean;
  targetDate: Date;
  // ★ 追加: スライダーの初期位置を指定する時刻 (録音時刻など)
  initialTime?: Date;
}

// ★ StaffInputPageでも使うのでexport
export const CATEGORY_STYLES: Record<string, { main: string, light: string, dark: string }> = {
  orange: { main: '#f97316', light: '#ffedd5', dark: '#c2410c' },
  green: { main: '#16a34a', light: '#dcfce7', dark: '#15803d' },
  blue: { main: '#2563eb', light: '#dbeafe', dark: '#1d4ed8' },
  indigo: { main: '#4f46e5', light: '#e0e7ff', dark: '#3730a3' },
  red: { main: '#dc2626', light: '#fee2e2', dark: '#b91c1c' },
  purple: { main: '#9333ea', light: '#f3e8ff', dark: '#7e22ce' },
  teal: { main: '#0d9488', light: '#ccfbf1', dark: '#0f766e' },
  gray: { main: '#64748b', light: '#f1f5f9', dark: '#334155' }
};

// 時間帯定義 (入力用)
const TIME_ZONES = [
  { id: 'early_night', label: '深夜(早)', start: 0, end: 3, color: '#475569' },
  { id: 'morning', label: '午前', start: 3, end: 12, color: '#ea580c' },
  { id: 'afternoon', label: '午後', start: 12, end: 18, color: '#ca8a04' },
  { id: 'night', label: '夜', start: 18, end: 24, color: '#1e3a8a' },
];

export const CareTouch: React.FC<CareTouchProps> = ({ initialData, onSave, isSaving = false, targetDate, initialTime }) => {
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SchemaCategory>(lifeSchema.categories[0] as SchemaCategory);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [note, setNote] = useState('');

  // 時間管理 (分)
  const [currentInputTime, setCurrentInputTime] = useState<number>(0);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPlace(initialData?.place || null);
    const savedCatLabel = initialData?.category;
    const foundCat = lifeSchema.categories.find(c => c.label === savedCatLabel);
    setSelectedCategory((foundCat || lifeSchema.categories[0]) as SchemaCategory);
    setSelectedTags(initialData?.tags || []);
    setSelectedConditions(initialData?.conditions || []);
    setNote(initialData?.note || '');

    // ★ 修正: 時刻初期化ロジック
    // 1. initialTime が指定されていればそれを使う (録音時刻)
    // 2. なければ現在時刻
    const baseTime = initialTime || new Date();
    const minutes = baseTime.getHours() * 60 + baseTime.getMinutes();
    setCurrentInputTime(minutes);

    // ゾーンの自動選択
    const hour = Math.floor(minutes / 60);
    const zone = TIME_ZONES.find(z => hour >= z.start && hour < z.end);
    if (zone) {
      setActiveZoneId(zone.id);
    } else {
      // マッチしない場合(24時ジャストなど)のフォールバック
      setActiveZoneId('morning');
    }
  }, [initialData, initialTime]); // initialTimeの変更も監視

  const handleCategoryChange = (category: SchemaCategory) => {
    setSelectedCategory(category);
    setSelectedTags([]);
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleConditionToggle = (cond: string) => {
    setSelectedConditions(prev => prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]);
  };

  const handleZoneClick = (zoneId: string) => {
    setActiveZoneId(zoneId);
    const zone = TIME_ZONES.find(z => z.id === zoneId);
    if (zone) {
      const currentHour = Math.floor(currentInputTime / 60);
      if (currentHour < zone.start || currentHour >= zone.end) {
        setCurrentInputTime(zone.start * 60);
      }
    }
  };

  const handleSliderChange = (_: Event, newValue: number | number[]) => {
    setCurrentInputTime(newValue as number);
  };

  const handleSave = () => {
    const finalDate = new Date(targetDate);
    const hours = Math.floor(currentInputTime / 60);
    const minutes = currentInputTime % 60;
    finalDate.setHours(hours, minutes, 0, 0);

    const data: CareTouchRecord = {
      place: selectedPlace,
      category: selectedCategory.label,
      tags: selectedTags,
      conditions: selectedConditions,
      note: note,
      timestamp: finalDate.toISOString()
    };
    onSave(data);
  };

  const themeColor = CATEGORY_STYLES[selectedCategory.color] || CATEGORY_STYLES.gray;
  const activeZone = TIME_ZONES.find(z => z.id === activeZoneId);

  const timeLabel = `${Math.floor(currentInputTime / 60).toString().padStart(2, '0')}:${(currentInputTime % 60).toString().padStart(2, '0')}`;

  return (
    <Box sx={{ p: 2, bgcolor: '#f1f5f9', minHeight: '100%', borderRadius: 2 }}>

      {/* 0. 時刻入力 */}
      <Box sx={{ mb: 3, bgcolor: 'white', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'primary.light', boxShadow: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <TimeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
            記録時刻: <Box component="span" sx={{ fontSize: '1.2rem' }}>{timeLabel}</Box>
          </Typography>
        </Stack>

        <Grid container spacing={1} mb={activeZoneId ? 2 : 0}>
          {TIME_ZONES.map(zone => (
            <Grid size={{ xs: 3 }} key={zone.id}>
              <Button
                fullWidth
                variant={activeZoneId === zone.id ? "contained" : "outlined"}
                size="small"
                onClick={() => handleZoneClick(zone.id)}
                sx={{
                  fontSize: '0.75rem', fontWeight: 'bold',
                  bgcolor: activeZoneId === zone.id ? zone.color : 'white',
                  borderColor: activeZoneId === zone.id ? zone.color : 'divider',
                  color: activeZoneId === zone.id ? 'white' : 'text.secondary',
                  boxShadow: activeZoneId === zone.id ? 2 : 0,
                  '&:hover': { bgcolor: activeZoneId === zone.id ? zone.color : '#f8fafc' }
                }}
              >
                {zone.label}
              </Button>
            </Grid>
          ))}
        </Grid>

        {activeZone && (
          <Box sx={{ px: 3, pt: 1, pb: 0, bgcolor: '#f8fafc', borderRadius: 2 }}>
            <Slider
              value={currentInputTime}
              onChange={handleSliderChange}
              min={activeZone.start * 60}
              max={activeZone.end * 60 - 1}
              step={5}
              valueLabelDisplay="auto"
              valueLabelFormat={(val) => {
                const h = Math.floor(val / 60);
                const m = val % 60;
                return `${h}:${m.toString().padStart(2, '0')}`;
              }}
              sx={{ color: activeZone.color, height: 6 }}
            />
            <Typography variant="caption" color="text.secondary" align="center" display="block">
              {activeZone.label} ({activeZone.start}:00 - {activeZone.end}:00)
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* 1. 場所 */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 0.5, display: 'block' }}>場所</Typography>
        <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1, '::-webkit-scrollbar': { display: 'none' } }}>
          {lifeSchema.places.map(place => (
            <Button
              key={place} onClick={() => setSelectedPlace(place)}
              variant={selectedPlace === place ? 'contained' : 'outlined'}
              sx={{
                borderRadius: '20px', minWidth: 'auto', px: 2, py: 0.5,
                fontWeight: 'bold', whiteSpace: 'nowrap', boxShadow: selectedPlace === place ? 2 : 0,
                bgcolor: selectedPlace === place ? 'text.primary' : 'white',
                color: selectedPlace === place ? 'white' : 'text.primary',
                borderColor: 'divider',
                '&:hover': { bgcolor: selectedPlace === place ? 'text.primary' : '#f8fafc' }
              }}
            >
              {place}
            </Button>
          ))}
        </Stack>
      </Box>

      {/* 2. カテゴリ */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 0.5, display: 'block' }}>カテゴリ</Typography>
        <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1, '::-webkit-scrollbar': { display: 'none' } }}>
          {lifeSchema.categories.map((cat: any) => {
            const isSelected = selectedCategory.id === cat.id;
            const colors = CATEGORY_STYLES[cat.color] || CATEGORY_STYLES.gray;
            return (
              <Button
                key={cat.id} onClick={() => handleCategoryChange(cat)}
                sx={{
                  borderRadius: 2, minWidth: 'auto', px: 2, py: 1,
                  fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap',
                  color: isSelected ? 'white' : colors.dark,
                  bgcolor: isSelected ? colors.main : 'white',
                  border: `1px solid ${isSelected ? colors.main : 'transparent'}`,
                  boxShadow: isSelected ? 4 : 1,
                  '&:hover': { bgcolor: isSelected ? colors.dark : colors.light }
                }}
              >
                {cat.label}
              </Button>
            );
          })}
        </Stack>
      </Box>

      {/* 3. 詳細 */}
      <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: `2px solid ${themeColor.main}`, bgcolor: 'white', mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold', color: themeColor.dark, borderBottom: `1px dashed ${themeColor.light}`, pb: 1 }}>
          {selectedCategory.label} の内容
        </Typography>
        <Grid container spacing={1.5}>
          {selectedCategory.items.map(item => {
            const isSelected = selectedTags.includes(item);
            return (
              <Grid size={{ xs: 4, sm: 3 }} key={item}>
                <Button
                  fullWidth onClick={() => handleTagToggle(item)}
                  sx={{
                    height: '64px', fontSize: '0.95rem', fontWeight: 'bold', borderRadius: 2,
                    color: isSelected ? themeColor.dark : 'text.primary',
                    bgcolor: isSelected ? themeColor.light : '#f8fafc',
                    border: '2px solid', borderColor: isSelected ? themeColor.main : 'divider',
                    boxShadow: isSelected ? `0 0 0 2px ${themeColor.light}` : 'none',
                    lineHeight: 1.2, '&:hover': { bgcolor: isSelected ? themeColor.light : '#f1f5f9' }
                  }}
                >
                  {item}
                </Button>
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      {/* 4. 様子 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1, display: 'block' }}>様子・状態</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {lifeSchema.conditions.map(cond => {
            const isSelected = selectedConditions.includes(cond);
            return (
              <Chip
                key={cond} label={cond} onClick={() => handleConditionToggle(cond)}
                sx={{
                  fontWeight: isSelected ? 'bold' : 'normal',
                  bgcolor: isSelected ? '#fce7f3' : 'white',
                  color: isSelected ? '#be185d' : 'text.secondary',
                  border: '1px solid', borderColor: isSelected ? '#ec4899' : 'divider',
                  '&:hover': { bgcolor: '#fdf2f8' }
                }}
              />
            );
          })}
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* 5. 保存 */}
      <Stack spacing={2}>
        <TextField
          fullWidth placeholder="特記事項メモ (任意)..." value={note}
          onChange={(e) => setNote(e.target.value)} multiline rows={2} variant="outlined"
          sx={{ bgcolor: 'white' }}
        />
        <Button
          fullWidth variant="contained" size="large" onClick={handleSave}
          disabled={!selectedPlace || selectedTags.length === 0 || isSaving}
          sx={{
            height: 56, fontWeight: 'bold', fontSize: '1.1rem',
            borderRadius: 3, boxShadow: 4, bgcolor: 'text.primary', '&:hover': { bgcolor: 'black' }
          }}
        >
          {isSaving ? <CircularProgress size={26} color="inherit" /> : "記録を確定 (Save)"}
        </Button>
      </Stack>
    </Box>
  );
};