// ConfirmDialog — กล่องยืนยันในแอป (แทน window.confirm ที่บางหน้าต่างถูกปิดใช้งาน)
import { Modal } from './Modal';

export interface ConfirmState {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface Props {
  state: ConfirmState;
  onClose: () => void;
}

export function ConfirmDialog({ state, onClose }: Props) {
  return (
    <Modal title={state.title ?? 'ยืนยัน'} onClose={onClose}>
      <p style={{ whiteSpace: 'pre-line', margin: '0.25rem 0 0' }}>{state.message}</p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button
          className={`btn ${state.danger ? 'danger' : 'primary'}`}
          onClick={() => {
            state.onConfirm();
            onClose();
          }}
        >
          {state.confirmLabel ?? 'ยืนยัน'}
        </button>
      </div>
    </Modal>
  );
}
