import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, Box, Typography, IconButton, CircularProgress } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import jsQR from 'jsqr';

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (token: string) => void;
}

export const QRScannerModal: React.FC<Props> = ({ open, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  
  // ストリームとアニメーションフレームを管理するRef
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // カメラリソースの完全停止処理
  const stopCamera = () => {
    // ストリームの停止
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    // アニメーションループの停止
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  useEffect(() => {
    // このEffect内でのキャンセル状態を管理するフラグ
    let isCancelled = false;

    if (open) {
      setLoading(true);
      
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => {
          // ★ 重要: 非同期処理完了時に、既にクリーンアップされていたら即停止する
          if (isCancelled) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }

          streamRef.current = stream;
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute('playsinline', 'true');
            
            // 再生開始
            videoRef.current.onloadedmetadata = () => {
                if (isCancelled) return; // 再度チェック
                videoRef.current?.play().catch(e => console.error("Play error:", e));
                setLoading(false);
                requestAnimationFrame(tick);
            };
          }
        })
        .catch((err) => {
          if (isCancelled) return;
          console.error("Camera error:", err);
          alert("カメラの起動に失敗しました。");
          onClose();
        });
    } else {
      stopCamera();
    }

    // クリーンアップ関数
    return () => {
      isCancelled = true; // フラグを立てる
      stopCamera();       // 停止を実行
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tick = () => {
    // 閉じた後ならループを止める
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return;
    
    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          // ★ 読み取り成功時も即座にカメラを停止
          stopCamera();
          onScan(code.data);
          return; // ループ終了
        }
      }
    }
    // 次フレームへ
    animationFrameRef.current = requestAnimationFrame(tick);
  };

  // 閉じるボタン等での手動クローズ
  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: { bgcolor: 'black', color: 'white', borderRadius: 2, overflow: 'hidden' }
      }}
    >
      <DialogContent sx={{ p: 0, position: 'relative', minHeight: 300, display:'flex', justifyContent:'center', alignItems:'center' }}>
        
        <IconButton 
          onClick={handleClose}
          sx={{ position: 'absolute', top: 8, right: 8, color: 'white', zIndex: 10, bgcolor: 'rgba(0,0,0,0.5)' }}
        >
          <CloseIcon />
        </IconButton>

        {loading && <CircularProgress sx={{ color: 'white' }} />}

        <video 
          ref={videoRef} 
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: loading ? 'none' : 'block' }} 
          playsInline 
          muted 
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        
        {/* ガイド枠 */}
        {!loading && (
            <Box sx={{
                position: 'absolute', 
                border: '2px solid rgba(255,255,255,0.7)', 
                width: '70%', height: '50%', borderRadius: 2, 
                pointerEvents: 'none',
                boxShadow: '0 0 0 1000px rgba(0,0,0,0.3)'
            }} />
        )}
        
        <Typography sx={{ position: 'absolute', bottom: 20, color: 'white', width: '100%', textAlign: 'center', textShadow: '0 1px 4px black' }}>
          QRコードを枠内に入れてください
        </Typography>

      </DialogContent>
    </Dialog>
  );
};