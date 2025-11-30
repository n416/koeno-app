import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Typography,
  Alert
} from '@mui/material';
import { History as HistoryIcon, Check as CheckIcon } from '@mui/icons-material';

// 再利用候補データの型定義
export interface ProcessedCandidate {
  recordingId: number;
  groupId: string;
  timestamp: Date;
  text: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  processedItems: ProcessedCandidate[];
  onSelect: (selectedItems: ProcessedCandidate[]) => void;
}

export const ProcessedSelectionModal: React.FC<Props> = ({ open, onClose, processedItems, onSelect }) => {
  // recordingIdとgroupIdの複合キーで選択状態を管理
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleToggle = (item: ProcessedCandidate) => {
    const id = `${item.recordingId}-${item.groupId}`;
    const currentIndex = selectedIds.indexOf(id);
    const newChecked = [...selectedIds];

    if (currentIndex === -1) {
      newChecked.push(id);
    } else {
      newChecked.splice(currentIndex, 1);
    }
    setSelectedIds(newChecked);
  };

  const handleConfirm = () => {
    const selected = processedItems.filter(item => selectedIds.includes(`${item.recordingId}-${item.groupId}`));
    onSelect(selected);
    setSelectedIds([]); // リセット
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>使用済みデータの再利用</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }} icon={<HistoryIcon />}>
          未処理のデータがありません。過去に使用した会話データを選択して、別の記録（例：食事の後に服薬など）として再入力できます。
        </Alert>
        
        {processedItems.length === 0 ? (
          <Typography color="textSecondary" align="center" py={3}>
            再利用可能なデータはありません
          </Typography>
        ) : (
          <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
            {processedItems.map((item) => {
              const id = `${item.recordingId}-${item.groupId}`;
              const labelId = `checkbox-list-label-${id}`;
              const isChecked = selectedIds.indexOf(id) !== -1;

              return (
                <ListItem
                  key={id}
                  disablePadding
                  divider
                >
                  <ListItemButton role={undefined} onClick={() => handleToggle(item)} dense>
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={isChecked}
                        tabIndex={-1}
                        disableRipple
                        inputProps={{ 'aria-labelledby': labelId }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      id={labelId}
                      primary={item.timestamp.toLocaleString('ja-JP')}
                      secondary={
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {item.text.slice(0, 60)}...
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button 
          variant="contained" 
          onClick={handleConfirm} 
          disabled={selectedIds.length === 0}
          startIcon={<CheckIcon />}
        >
          選択したデータを入力に使う
        </Button>
      </DialogActions>
    </Dialog>
  );
};