import { useParams, useNavigate } from 'react-router-dom';
import { RecordingAdjustModal } from '../components/RecordingAdjustModal';

/**
 * 既存のルート (/review/adjust/:recordingId) のためのラッパー
 */
export const KirokuAdjustPage = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();

  // モーダルが閉じたり保存完了したら、元の画面に戻る
  const handleClose = () => {
    navigate(-1); // 戻る
  };

  if (!recordingId) return null;

  return (
    <RecordingAdjustModal
      open={true}
      recordingId={parseInt(recordingId, 10)}
      onClose={handleClose}
      onSaveSuccess={handleClose}
    />
  );
};
export default KirokuAdjustPage;