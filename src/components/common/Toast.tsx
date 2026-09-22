// Toast — ป๊อปอัปแจ้งเตือนลอยมุมจอ หายเองอัตโนมัติ
import { useEffect, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info';
export interface ToastData {
  message: string;
  type: ToastType;
}

interface Props {
  data: ToastData;
  onClose: () => void;
  duration?: number;
}

export function Toast({ data, onClose, duration = 3200 }: Props) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const t = setTimeout(() => closeRef.current(), duration);
    return () => clearTimeout(t);
  }, [data, duration]);

  const icon = data.type === 'success' ? '✅' : data.type === 'error' ? '⚠️' : 'ℹ️';
  return (
    <div className={`toast toast-${data.type}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden>{icon}</span>
      <span className="toast-msg">{data.message}</span>
      <button className="toast-close" onClick={onClose} aria-label="ปิด">✕</button>
    </div>
  );
}
