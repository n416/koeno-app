//
// yorisoi-care-app の SettingsModal.tsx をベースに、koeno-app用に調整
// (ローカルLLM連携、ウェイクワード設定は削除)

import React from 'react';
import type { ApiModel } from '../lib/geminiApiClient'; // ★ 新設したApiClientを参照

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
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, apiKeyInput, onApiKeyInputChange,
  availableModels = [],
  selectedModel, onSelectedModelChange,
  onSave, onTestConnection, testStatus
}) => {

  // 選択中のモデルがリストに存在する場合のみ表示
  const displayValue = availableModels.some(m => m.id === selectedModel) ? selectedModel : '';

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
          />
          <FormControl fullWidth disabled={availableModels.length === 0}>
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
                  先に接続テストを実行してください
                </MenuItem>
              ) : (
                availableModels.map((model) => (
                  <MenuItem key={model.id} value={model.id}>{model.displayName}</MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button variant="outlined" onClick={onTestConnection}>接続テスト</Button>
            <Button variant="contained" onClick={onSave}>設定を保存</Button>
          </Box>
          <FormHelperText>{testStatus}</FormHelperText>
        </Stack>
      </Box>
    </Modal>
  );
};