import { createTheme } from '@mui/material/styles';
import { lightGreen } from '@mui/material/colors';

/**
 * [Task 9.1] PO 2.1: カスタム・ライトテーマ
 * (GM指示: パステルカラー（lightGreen）に変更)
 */
export const lightTheme = createTheme({
  palette: {
    mode: 'light', 
    primary: {
      main: lightGreen[400], // アクセントカラー: パステルグリーン
      // ★★★ 修正: 文字色を「白」に強制指定 ★★★
      contrastText: '#ffffff', 
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
 * [Task 9.1 / GM指示] PO 2.1: カスタム・ダークテーマ
 * (GM指示: パステルカラー（lightGreen）に変更)
 */
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: lightGreen[400], // アクセントカラー: パステルグリーン
      // ★★★ 修正: 文字色を「白」に強制指定 ★★★
      contrastText: '#ffffff',
    },
    background: {
      default: '#212121', 
      paper: '#333333',
    },
  },
  components: {
    // (AppBarのデフォルト色はダークモードに合うため変更なし)
  }
});