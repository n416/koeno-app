import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Button, Typography, Grid, Chip, TextField, Divider, Paper, Stack,
  Slider, CircularProgress, Card, CardContent, CardHeader, Popover
} from '@mui/material';
import { 
  AccessTime as TimeIcon, 
  Place as PlaceIcon, 
  Category as CategoryIcon,
  NoteAlt as NoteIcon,
  Save as SaveIcon
} from '@mui/icons-material';
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
  initialTime?: Date;
}

// --- ドラムロール部品 (ラベルを除去して純粋なホイール化) ---
const WheelColumn = ({ options, value, onChange }: { options: number[], value: number, onChange: (val: number) => void }) => {
  const itemHeight = 40; // 項目の高さ
  const containerRef = useRef<HTMLDivElement>(null);

  // 表示用に直近の値を選択
  const displayValue = options.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );

  useEffect(() => {
    if (containerRef.current) {
      const index = options.indexOf(displayValue);
      if (index !== -1) {
        containerRef.current.scrollTop = index * itemHeight;
      }
    }
  }, [displayValue, options]);

  const handleClick = (val: number) => {
    onChange(val);
    if (containerRef.current) {
      const index = options.indexOf(val);
      if (index !== -1) {
        containerRef.current.scrollTo({ top: index * itemHeight, behavior: 'smooth' });
      }
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        height: itemHeight * 5, // 5行表示 (200px)
        width: 70,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        position: 'relative',
        cursor: 'pointer',
        zIndex: 1,
        // 上下のフェードアウト効果
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
      }}
    >
      {/* 上下の余白 (2行分) */}
      <Box sx={{ height: itemHeight * 2 }} />
      {options.map((opt) => {
        const isSelected = opt === displayValue;
        return (
          <Box
            key={opt}
            onClick={() => handleClick(opt)}
            sx={{
              height: itemHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              scrollSnapAlign: 'center',
              fontWeight: isSelected ? 'bold' : 'normal',
              color: isSelected ? 'primary.main' : 'text.disabled',
              fontSize: isSelected ? '1.5rem' : '1.1rem',
              transition: 'all 0.2s ease-out',
              transform: isSelected ? 'scale(1.1)' : 'scale(1)',
            }}
          >
            {String(opt).padStart(2, '0')}
          </Box>
        );
      })}
      <Box sx={{ height: itemHeight * 2 }} />
    </Box>
  );
};


// カラー定義
export const CATEGORY_STYLES: Record<string, { main: string, light: string, dark: string }> = {
  orange: { main: '#f97316', light: '#fff7ed', dark: '#c2410c' },
  green:  { main: '#10b981', light: '#ecfdf5', dark: '#047857' },
  blue:   { main: '#3b82f6', light: '#eff6ff', dark: '#1d4ed8' },
  indigo: { main: '#6366f1', light: '#eef2ff', dark: '#4338ca' },
  red:    { main: '#ef4444', light: '#fef2f2', dark: '#b91c1c' },
  purple: { main: '#a855f7', light: '#faf5ff', dark: '#7e22ce' },
  teal:   { main: '#14b8a6', light: '#f0fdfa', dark: '#0f766e' },
  gray:   { main: '#64748b', light: '#f8fafc', dark: '#334155' }
};

// 時間帯定義
const TIME_ZONES = [
  { id: 'early_night', label: '深夜(早)', start: 0, end: 5, color: '#64748b' },
  { id: 'morning',     label: '午前',     start: 5, end: 12, color: '#f59e0b' },
  { id: 'afternoon',   label: '午後',     start: 12, end: 18, color: '#f97316' },
  { id: 'night',       label: '夜間',     start: 18, end: 24, color: '#3b82f6' },
];

const MARK_VALUES = [0, 6, 12, 18, 24];

export const CareTouch: React.FC<CareTouchProps> = ({ initialData, onSave, isSaving = false, targetDate, initialTime }) => {
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SchemaCategory>(lifeSchema.categories[0] as SchemaCategory);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const [currentInputTime, setCurrentInputTime] = useState<number>(0);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedPlace(initialData?.place || null);
    const savedCatLabel = initialData?.category;
    const foundCat = lifeSchema.categories.find(c => c.label === savedCatLabel);
    setSelectedCategory((foundCat || lifeSchema.categories[0]) as SchemaCategory);
    setSelectedTags(initialData?.tags || []);
    setSelectedConditions(initialData?.conditions || []);
    setNote(initialData?.note || '');

    const baseTime = initialTime || new Date();
    const minutes = baseTime.getHours() * 60 + baseTime.getMinutes();
    setCurrentInputTime(minutes);

    updateActiveZone(minutes);
  }, [initialData, initialTime]);

  const updateActiveZone = (minutes: number) => {
    const hour = Math.floor(minutes / 60);
    const searchHour = hour === 24 ? 23 : hour;
    const zone = TIME_ZONES.find(z => searchHour >= z.start && searchHour < z.end);
    if (zone) {
      setActiveZoneId(zone.id);
    }
  };

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
      const midHour = (zone.start + zone.end) / 2;
      setCurrentInputTime(Math.floor(midHour * 60));
    }
  };

  const handleSliderChange = (_: Event, newValue: number | number[]) => {
    const val = newValue as number;
    setCurrentInputTime(val);
    updateActiveZone(val);
  };

  // 時刻ピッカー
  const handleTimeChipClick = (event: React.MouseEvent<HTMLDivElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleTimePopoverClose = () => {
    setAnchorEl(null);
  };
  const handleWheelChange = (type: 'hour' | 'minute', val: number) => {
    let h = Math.floor(currentInputTime / 60);
    let m = currentInputTime % 60;
    if (h >= 24) h = 23; 
    if (type === 'hour') h = val;
    if (type === 'minute') m = val;
    const newMins = h * 60 + m;
    setCurrentInputTime(newMins);
    updateActiveZone(newMins);
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

  const sliderMarks = MARK_VALUES.map(val => ({
    value: val * 60,
    label: (
      <Box
        onClick={(e) => {
          e.stopPropagation();
          const mins = val * 60;
          setCurrentInputTime(mins);
          updateActiveZone(mins);
        }}
        sx={{ 
          cursor: 'pointer', p: 1, 
          fontSize: '0.8rem', fontWeight: '500', color: 'text.secondary',
          '&:hover': { color: 'primary.main', fontWeight: 'bold' }
        }}
      >
        {val}
      </Box>
    )
  }));

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, height: '100%', overflowY: 'auto' }}>
      
      <Paper elevation={3} sx={{ borderRadius: 4, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        
        {/* --- ヘッダー --- */}
        <Box sx={{ bgcolor: '#f8fafc', p: 3, borderBottom: '1px solid #e2e8f0' }}>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <TimeIcon color="action" fontSize="small" />
                <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">ケア実施時刻</Typography>
                <Chip 
                  label={timeLabel} 
                  color="primary" 
                  size="small" 
                  onClick={handleTimeChipClick}
                  sx={{ 
                    fontWeight: 'bold', fontSize: '1rem', height: 28, cursor: 'pointer',
                    '&:hover': { boxShadow: 2 }
                  }} 
                />
              </Stack>
              
              <Stack direction="row" spacing={0.5} mb={2}>
                {TIME_ZONES.map(zone => (
                  <Button
                    key={zone.id}
                    variant={activeZoneId === zone.id ? "contained" : "text"}
                    onClick={() => handleZoneClick(zone.id)}
                    sx={{
                      flex: 1, py: 0.5, borderRadius: 2, fontSize: '0.8rem', fontWeight: 'bold',
                      bgcolor: activeZoneId === zone.id ? zone.color : 'transparent',
                      color: activeZoneId === zone.id ? '#fff' : 'text.secondary',
                      '&:hover': { bgcolor: activeZoneId === zone.id ? zone.color : '#f1f5f9' },
                      transition: 'all 0.2s ease-in-out'
                    }}
                  >
                    {zone.label}
                  </Button>
                ))}
              </Stack>

              <Box sx={{ px: 2 }}>
                <Slider
                  value={currentInputTime}
                  onChange={handleSliderChange}
                  min={0} max={1440} step={5}
                  marks={sliderMarks}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(val) => {
                    const h = Math.floor(val / 60);
                    const m = val % 60;
                    return `${h}:${m.toString().padStart(2, '0')}`;
                  }}
                  sx={{ 
                    color: activeZone?.color || 'primary.main', height: 8,
                    '& .MuiSlider-thumb': { width: 20, height: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
                    '& .MuiSlider-markLabel': { top: 30 }
                  }}
                />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <PlaceIcon color="action" fontSize="small" />
                <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">場所</Typography>
              </Stack>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {lifeSchema.places.map(place => (
                  <Chip
                    key={place}
                    label={place}
                    onClick={() => setSelectedPlace(place)}
                    variant={selectedPlace === place ? "filled" : "outlined"}
                    color={selectedPlace === place ? "default" : "default"}
                    sx={{
                      bgcolor: selectedPlace === place ? '#334155' : 'transparent',
                      color: selectedPlace === place ? '#fff' : 'text.primary',
                      fontWeight: selectedPlace === place ? 'bold' : 'normal',
                      borderColor: '#cbd5e1'
                    }}
                  />
                ))}
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* --- 時刻ピッカー (Popover) --- */}
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handleTimePopoverClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          PaperProps={{ sx: { borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' } }}
        >
          {/* ヘッダー */}
          <Box sx={{ p: 1.5, borderBottom: '1px solid #eee', bgcolor: '#f9f9f9' }}>
            <Grid container>
              <Grid size={{ xs: 6 }} sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">時</Typography>
              </Grid>
              <Grid size={{ xs: 6 }} sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">分</Typography>
              </Grid>
            </Grid>
          </Box>

          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* ハイライトバー */}
            <Box 
              sx={{ 
                position: 'absolute', top: '50%', left: 16, right: 16, height: 40, 
                bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 2, transform: 'translateY(-50%)', 
                pointerEvents: 'none', zIndex: 0 
              }} 
            />
            
            <WheelColumn options={hours} value={Math.floor(currentInputTime / 60)} onChange={(val) => handleWheelChange('hour', val)} />
            <Typography variant="h5" sx={{ mx: 1, color: '#ccc', pb: 0.5 }}>:</Typography>
            <WheelColumn options={minutes} value={currentInputTime % 60} onChange={(val) => handleWheelChange('minute', val)} />
          </Box>

          {/* 完了ボタン */}
          <Box sx={{ p: 1, borderTop: '1px solid #eee' }}>
            <Button fullWidth variant="contained" onClick={handleTimePopoverClose}>
              完了
            </Button>
          </Box>
        </Popover>

        {/* --- メインコンテンツ --- */}
        <Box sx={{ p: 3 }}>
          <Box sx={{ mb: 3, overflowX: 'auto', pb: 1 }}>
            <Stack direction="row" spacing={1}>
              {lifeSchema.categories.map((cat: any) => {
                const isSelected = selectedCategory.id === cat.id;
                const colors = CATEGORY_STYLES[cat.color] || CATEGORY_STYLES.gray;
                return (
                  <Button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat)}
                    startIcon={isSelected ? <CategoryIcon /> : null}
                    sx={{
                      borderRadius: 3, px: 3, py: 1, fontWeight: 'bold', whiteSpace: 'nowrap',
                      color: isSelected ? '#fff' : colors.dark,
                      bgcolor: isSelected ? colors.main : colors.light,
                      border: `1px solid ${isSelected ? colors.main : 'transparent'}`,
                      boxShadow: isSelected ? `0 4px 6px -1px ${colors.main}40` : 'none',
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: isSelected ? colors.dark : '#fff', transform: 'translateY(-1px)' }
                    }}
                  >
                    {cat.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>

          <Card variant="outlined" sx={{ mb: 3, borderColor: themeColor.main, bgcolor: themeColor.light, borderRadius: 3 }}>
            <CardHeader 
              title={`${selectedCategory.label}の内容`}
              titleTypographyProps={{ variant: 'subtitle1', fontWeight: 'bold', color: themeColor.dark }}
              sx={{ pb: 0 }}
            />
            <CardContent>
              <Grid container spacing={2}>
                {selectedCategory.items.map(item => {
                  const isSelected = selectedTags.includes(item);
                  return (
                    <Grid size={{ xs: 6, sm: 4, md: 3 }} key={item}>
                      <Button
                        fullWidth
                        onClick={() => handleTagToggle(item)}
                        variant="contained"
                        sx={{
                          height: 56, fontWeight: 'bold', fontSize: '1rem',
                          color: isSelected ? '#fff' : themeColor.dark,
                          bgcolor: isSelected ? themeColor.main : '#fff',
                          border: isSelected ? 'none' : `1px solid ${themeColor.main}40`,
                          boxShadow: isSelected ? 3 : 0,
                          '&:hover': { bgcolor: isSelected ? themeColor.dark : '#fff' }
                        }}
                      >
                        {item}
                      </Button>
                    </Grid>
                  );
                })}
              </Grid>
            </CardContent>
          </Card>

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" fontWeight="bold" mb={1}>様子・特記事項タグ</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {lifeSchema.conditions.map(cond => {
                const isSelected = selectedConditions.includes(cond);
                return (
                  <Chip
                    key={cond}
                    label={cond}
                    onClick={() => handleConditionToggle(cond)}
                    sx={{
                      fontWeight: isSelected ? 'bold' : 'normal',
                      bgcolor: isSelected ? '#fce7f3' : '#fff',
                      color: isSelected ? '#be185d' : '#64748b',
                      border: `1px solid ${isSelected ? '#ec4899' : '#e2e8f0'}`,
                      '&:hover': { bgcolor: '#fdf2f8' }
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                fullWidth
                placeholder="特記事項メモ (任意)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                rows={2}
                variant="outlined"
                sx={{ bgcolor: '#fff' }}
                slotProps={{ input: { startAdornment: <NoteIcon color="action" sx={{ mr: 1, mt: 0.5, alignSelf: 'flex-start' }} /> } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', alignItems: 'stretch' }}>
              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleSave}
                disabled={!selectedPlace || selectedTags.length === 0 || isSaving}
                startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                sx={{
                  fontWeight: 'bold', fontSize: '1.1rem', borderRadius: 3,
                  bgcolor: '#0f172a',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  '&:hover': { bgcolor: '#1e293b' }
                }}
              >
                記録を確定
              </Button>
            </Grid>
          </Grid>

        </Box>
      </Paper>
    </Box>
  );
};