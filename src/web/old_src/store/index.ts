import { configureStore } from '@reduxjs/toolkit';
import appReducer from './appSlice'; // ★ 後で作成

export const store = configureStore({
  reducer: {
    app: appReducer,
  },
  // （シリアライズ不可能なBlobをstateで持つため、一時的にチェックを無効化）
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;