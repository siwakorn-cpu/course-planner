// ExportSubjectsModal — หน้าต่างเลือกคอลัมน์/ขอบเขตก่อนส่งออกคลังรายวิชาเป็น Excel
import { useState } from 'react';
import type { Subject } from '../types';
import { SUBJECT_COLUMNS, exportSubjectsToExcel, type SubjectColumnId } from '../exportSubjects';
import { Modal } from './common/Modal';

interface Props {
  /** รายวิชาตามตัวกรอง/การเรียงที่แสดงอยู่ในหน้า */
  filtered: Subject[];
  /** รายวิชาทั้งหมดในคลัง (เรียงตามหน้าแล้ว) */
  all: Subject[];
  onClose: () => void;
  onDone: (message: string, type?: 'success' | 'error') => void;
}

const STORAGE_KEY = 'course-planner:subject-export-columns';
const ALL_IDS = SUBJECT_COLUMNS.map((c) => c.id);

/** จำคอลัมน์ที่เลือกครั้งล่าสุดไว้ในเครื่อง (ถ้าอ่านไม่ได้ = เลือกทั้งหมด) */
function loadColumns(): SubjectColumnId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (Array.isArray(saved)) {
      const valid = saved.filter((id): id is SubjectColumnId => ALL_IDS.includes(id));
      if (valid.length > 0) return valid;
    }
  } catch { /* ใช้ค่าเริ่มต้น */ }
  return ALL_IDS;
}

export function ExportSubjectsModal({ filtered, all, onClose, onDone }: Props) {
  const [selected, setSelected] = useState<SubjectColumnId[]>(loadColumns);
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [busy, setBusy] = useState(false);
  const isFiltered = filtered.length !== all.length;

  const toggle = (id: SubjectColumnId) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const exportNow = async () => {
    const subjects = scope === 'all' || !isFiltered ? all : filtered;
    setBusy(true);
    try {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)); } catch { /* ไม่จำก็ได้ */ }
      await exportSubjectsToExcel(subjects, selected, `คลังรายวิชา-${new Date().toISOString().slice(0, 10)}.xlsx`);
      onDone(`ส่งออก Excel ${subjects.length} รายวิชา แล้ว`);
      onClose();
    } catch (err) {
      onDone('ส่งออกไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'), 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title="ส่งออก Excel — คลังรายวิชา" onClose={onClose}>
      <div className="field">
        <div className="row-gap" style={{ justifyContent: 'space-between' }}>
          <label style={{ margin: 0 }}>เลือกคอลัมน์ที่ต้องการส่งออก</label>
          <div className="row-gap">
            <button className="btn small ghost" onClick={() => setSelected(ALL_IDS)}>เลือกทั้งหมด</button>
            <button className="btn small ghost" onClick={() => setSelected([])}>ไม่เลือกเลย</button>
          </div>
        </div>
        <div className="export-col-grid">
          {SUBJECT_COLUMNS.map((c) => (
            <label className="choice-row" key={c.id}>
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {isFiltered && (
        <div className="field">
          <label>รายวิชาที่ส่งออก</label>
          <div className="row-gap">
            <label className="row-gap" style={{ cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'filtered'} onChange={() => setScope('filtered')} />
              ตามที่กรองอยู่ ({filtered.length} วิชา)
            </label>
            <label className="row-gap" style={{ cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
              ทั้งหมด ({all.length} วิชา)
            </label>
          </div>
        </div>
      )}

      {selected.length === 0 && <p style={{ color: 'var(--danger)', margin: '0.4rem 0 0' }}>กรุณาเลือกอย่างน้อย 1 คอลัมน์</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" onClick={exportNow} disabled={busy || selected.length === 0}>
          {busy ? 'กำลังส่งออก…' : '⬇️ ส่งออก Excel'}
        </button>
      </div>
    </Modal>
  );
}
