import { createTheme } from '@mui/material/styles';
import { lightGreen } from '@mui/material/colors';

/**
 * カスタム・ライトテーマ
 */
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: lightGreen[400], // アクセントカラー: パステルグリーン
      contrastText: '#ffffff', // 文字色: 白
    },
    background: {
      default: '#f4f6f8',
      paper: '#ffffff',
    },
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        color: 'default',
        elevation: 1,
      }
    }
  }
});

/**
 * カスタム・ダークテーマ
 */
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: lightGreen[400], // アクセントカラー: パステルグリーン
      contrastText: '#ffffff',
    },
    background: {
      default: '#212121',
      paper: '#333333',
    },
  },
});