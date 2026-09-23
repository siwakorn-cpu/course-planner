// BulkMoveSemesterCard — ย้ายรายวิชาทั้งเทอม (ทุกห้องทั้งระบบ) จากเทอมหนึ่งไปอีกเทอม
// ต้องยืนยัน 2 รอบ (พรีวิว + ยืนยันรอบสุดท้าย) เพราะกระทบข้อมูลทุกห้อง
import { useMemo, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import type { Semester } from '../types';
import { planOfferingSemesterMove } from '../offeringSemester';
import { Modal } from './common/Modal';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';
import { Toast, type ToastData } from './common/Toast';

interface Props {
  api: AppDataApi;
}

export function BulkMoveSemesterCard({ api }: Props) {
  const { data } = api;
  const [target, setTarget] = useState<Semester | null>(null); // ภาคเรียนปลายทาง (โมดัลพรีวิว)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null); // ยืนยันรอบที่ 2
  const [toast, setToast] = useState<ToastData | null>(null);
  const [undo, setUndo] = useState<{ ids: string[]; semester: Semester } | null>(null);

  const term1Count = useMemo(() => data.offerings.filter((o) => o.semester === 1).length, [data.offerings]);
  const term2Count = useMemo(() => data.offerings.filter((o) => o.semester === 2).length, [data.offerings]);
  const plan = useMemo(() => {
    if (target == null) return null;
    const sourceIds = data.offerings.filter((o) => o.semester !== target).map((o) => o.id);
    return planOfferingSemesterMove(data.offerings, sourceIds, target);
  }, [data.offerings, target]);

  // ลงมือย้ายจริง (หลังผ่านยืนยัน 2 รอบ)
  const execute = (to: Semester) => {
    const sourceSemester: Semester = to === 1 ? 2 : 1;
    const sourceIds = api.data.offerings.filter((o) => o.semester !== to).map((o) => o.id);
    const result = api.moveOfferingsToSemester(sourceIds, to);
    if (result.movedIds.length > 0) setUndo({ ids: result.movedIds, semester: sourceSemester });
    setToast({
      type: result.movedIds.length > 0 ? 'success' : 'info',
      message: `ย้ายทั้งระบบไปภาคเรียนที่ ${to} แล้ว ${result.movedIds.length} รายการ${result.conflictIds.length ? ` · ข้ามรายการซ้ำ ${result.conflictIds.length}` : ''}`,
    });
  };

  // รอบ 1 (พรีวิว) ผ่านแล้ว → เปิดยืนยันรอบ 2
  const requestConfirm = () => {
    if (target == null || !plan) return;
    const to = target;
    const from: Semester = to === 1 ? 2 : 1;
    const count = plan.movableIds.length;
    setTarget(null);
    setConfirm({
      title: 'ยืนยันอีกครั้ง (รอบสุดท้าย)',
      message: `ยืนยันย้ายรายวิชาทั้งระบบทุกห้อง ${count} รายการ จากภาคเรียนที่ ${from} ไปภาคเรียนที่ ${to} ?\nการทำงานนี้กระทบทุกห้อง — ตรวจสอบให้แน่ใจก่อนยืนยัน`,
      confirmLabel: `ย้ายเลย ${count} รายการ`,
      danger: true,
      onConfirm: () => execute(to),
    });
  };

  const undoMove = () => {
    if (!undo) return;
    const result = api.moveOfferingsToSemester(undo.ids, undo.semester);
    setToast({
      type: result.movedIds.length > 0 ? 'success' : 'info',
      message: `ย้อนกลับไปภาคเรียนที่ ${undo.semester} แล้ว ${result.movedIds.length} รายการ${result.conflictIds.length ? ` · ข้ามรายการซ้ำ ${result.conflictIds.length}` : ''}`,
    });
    setUndo(null);
  };

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginTop: 0 }}>ย้ายรายวิชาทั้งเทอม (ทุกห้องทั้งระบบ)</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        ย้ายรายวิชาที่จัดไว้ทั้งหมดจากเทอมหนึ่งไปอีกเทอม — เทอมต้นทางจะว่าง · รายการที่ปลายทางมีอยู่แล้วจะถูกข้าม (ไม่เขียนทับ) · ต้องยืนยัน 2 รอบ
      </p>
      <div className="row-gap" style={{ flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => setTarget(2)} disabled={term1Count === 0}>เทอม 1 → เทอม 2 ({term1Count})</button>
        <button className="btn" onClick={() => setTarget(1)} disabled={term2Count === 0}>เทอม 2 → เทอม 1 ({term2Count})</button>
        {undo && <button className="btn ghost" onClick={undoMove}>↶ ย้อนกลับการย้ายล่าสุด</button>}
      </div>

      {target != null && plan && (
        <Modal title={`ย้ายรายวิชาทั้งหมดไปภาคเรียนที่ ${target}`} onClose={() => setTarget(null)}>
          <p style={{ margin: '0.25rem 0 0' }}>
            ย้ายรายวิชาที่จัดไว้ทุกห้อง <strong>{plan.movableIds.length} รายการ</strong> จากภาคเรียนที่ {target === 1 ? 2 : 1} ไปภาคเรียนที่ {target}
          </p>
          <p className="muted" style={{ margin: '0.5rem 0 0' }}>
            ภาคเรียนที่ {target === 1 ? 2 : 1} จะไม่เหลือรายการที่ย้าย · ครูผู้สอน จำนวนคาบ ห้อง/สถานที่ และกลุ่มเลือกจะคงเดิม
          </p>
          {plan.conflictIds.length > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.7rem 0.8rem', borderRadius: 8, background: 'var(--warning-weak)', color: 'var(--warning)' }}>
              <strong>พบรายการซ้ำ {plan.conflictIds.length} รายการ — ระบบจะข้ามและไม่เขียนทับข้อมูลเดิม</strong>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => setTarget(null)}>ยกเลิก</button>
            <button className="btn primary" onClick={requestConfirm} disabled={plan.movableIds.length === 0}>ถัดไป (ยืนยันอีกครั้ง)</button>
          </div>
        </Modal>
      )}

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
