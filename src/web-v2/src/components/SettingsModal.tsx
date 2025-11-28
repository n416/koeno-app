// src/components/SettingsModal.tsx
import React, { useState } from 'react'; // useEffectは不要になったので削除
import type { ApiModel } from '../lib/geminiApiClient';

// MUI Components
import Modal from '@mui/material/Modal';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
// ★ 追加
import { Fade, FormControlLabel, Switch } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeyInput: string;
  onApiKeyInputChange: (value: string) => void;
  availableModels: ApiModel[];
  selectedModel: string;
  onSelectedModelChange: (value: string) => void;
  onSave: () => void;
  onTestConnection: () => void;
  testStatus: string;
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '90%',
  maxWidth: 450,
  bgcolor: 'background.paper',
  borderRadius: 2,
  boxShadow: 24,
  p: 4,
  maxHeight: '90vh',
  overflowY: 'auto' // コンテンツが増えるのでスクロール可能に
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, apiKeyInput, onApiKeyInputChange,
  availableModels = [],
  selectedModel, onSelectedModelChange,
  onSave, onTestConnection, testStatus
}) => {

  // ★★★ バックドア用 State (wowfitから移植) ★★★
  const [versionClickCount, setVersionClickCount] = useState(0);
  const [isDevMode, setIsDevMode] = useState(() => localStorage.getItem('isDevMode') === 'true');
  const [noApiMode, setNoApiMode] = useState(() => localStorage.getItem('noApiMode') === 'true');

  const displayValue = availableModels.some(m => m.id === selectedModel) ? selectedModel : '';

  // ★ 保存ハンドラ (親のonSaveも呼びつつ、ローカル設定も保存)
  const handleSaveWrapper = () => {
    localStorage.setItem('isDevMode', String(isDevMode));
    localStorage.setItem('noApiMode', String(noApiMode));
    onSave();
  };

  // ★ 連打ハンドラ
  const handleVersionClick = () => {
    if (isDevMode) return;
    const newCount = versionClickCount + 1;
    setVersionClickCount(newCount);
    if (newCount >= 10) {
      setIsDevMode(true);
      localStorage.setItem('isDevMode', 'true');
      alert("開発者モードが有効になりました。\n(APIなしモードが利用可能です)");
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      aria-labelledby="settings-modal-title"
    >
      <Box sx={style}>
        <Typography id="settings-modal-title" variant="h6" component="h2" sx={{ mb: 3 }}>
          Gemini API 設定
        </Typography>
        <Stack spacing={3}>
          
          <TextField
            fullWidth
            type="password"
            label="Gemini API Key"
            value={apiKeyInput}
            onChange={(e) => onApiKeyInputChange(e.target.value)}
            variant="outlined"
            helperText="AI草案生成機能（画面B/C）に必要です"
            disabled={noApiMode} // ★ APIなしモードなら無効化
          />
          
          <FormControl fullWidth disabled={availableModels.length === 0 && !noApiMode}>
            <InputLabel id="model-select-label">使用モデル</InputLabel>
            <Select
              labelId="model-select-label"
              value={displayValue}
              label="使用モデル"
              onChange={(e) => onSelectedModelChange(e.target.value)}
              displayEmpty
            >
              {availableModels.length === 0 ? (
                <MenuItem value="" disabled>
                  {noApiMode ? '手動入力モード' : '先に接続テストを実行してください'}
                </MenuItem>
              ) : (
                availableModels.map((model) => (
                  <MenuItem key={model.id} value={model.id}>{model.displayName}</MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          {/* ★★★ 開発者モード（バックドア）エリア ★★★ */}
          {isDevMode && (
            <Fade in={isDevMode}>
              <Box sx={{ p: 2, border: '1px dashed #ff9800', borderRadius: 2, bgcolor: '#fff3e0' }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <BugReportIcon color="warning" />
                  <Typography variant="subtitle2" fontWeight="bold" color="warning.dark">
                    Developer Options
                  </Typography>
                </Stack>
                
                <FormControlLabel
                  control={
                    <Switch 
                      checked={noApiMode} 
                      onChange={(e) => setNoApiMode(e.target.checked)} 
                      color="warning"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight="bold">APIなしモード</Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ lineHeight: 1 }}>
                        プロンプトをクリップボードにコピーし、結果を手動入力します。
                      </Typography>
                    </Box>
                  }
                />
              </Box>
            </Fade>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button variant="outlined" onClick={onTestConnection} disabled={noApiMode}>接続テスト</Button>
            <Button variant="contained" onClick={handleSaveWrapper}>設定を保存</Button>
          </Box>
          <FormHelperText>{testStatus}</FormHelperText>

          {/* ★★★ バージョン情報 (トリガー) ★★★ */}
          <Box 
            onClick={handleVersionClick}
            sx={{ 
              mt: 2, pt: 2, borderTop: '1px solid #eee', textAlign: 'center',
              userSelect: 'none', cursor: 'default', opacity: 0.5,
              '&:active': { transform: 'scale(0.98)' } 
            }}
          >
            <Typography variant="caption" display="block">
              KOENO-APP v2.1
            </Typography>
            <Typography variant="caption" color="textSecondary">
              (c) 2025 Kisaragi System
            </Typography>
          </Box>

        </Stack>
      </Box>
    </Modal>
  );
};