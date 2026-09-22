// CompletedCoursesModal — บันทึกวิชาที่เรียนจบแล้ว (หน่วยกิตสะสมเดิม) ของห้องหนึ่ง
import { useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { type ClassRoom, type SubjectType } from '../types';
import { classLabel, completedCredits } from '../calculations';
import { Modal } from './common/Modal';

interface Props {
  classroom: ClassRoom;
  api: AppDataApi;
  onClose: () => void;
}

const emptyForm = () => ({ code: '', name: '', credits: 1, type: 'พื้นฐาน' as SubjectType, note: '' });

export function CompletedCoursesModal({ classroom, api, onClose }: Props) {
  const { data } = api;
  const [form, setForm] = useState(emptyForm());
  const [err, setErr] = useState('');

  const rows = data.completed
    .filter((c) => c.classId === classroom.id)
    .sort((a, b) => a.code.localeCompare(b.code, 'th'));
  const sum = completedCredits(classroom.id, data.completed);

  const add = () => {
    if (!form.code.trim() || !form.name.trim()) {
      setErr('กรุณากรอกรหัสวิชาและชื่อวิชา');
      return;
    }
    api.addCompleted({ classId: classroom.id, ...form, code: form.code.trim(), name: form.name.trim() });
    setForm(emptyForm()); // ล้างฟอร์มให้เพิ่มรายการถัดไปได้เร็ว
    setErr('');
  };

  return (
    <Modal title={`หน่วยกิตเดิม (เรียนจบแล้ว) — ${classLabel(classroom, true)}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        บันทึกวิชาที่ห้องนี้เรียนจบไปแล้ว (เช่น ปีก่อน ๆ) เพื่อดูหน่วยกิตสะสมเดิม — แยกจากที่กำลังจัดในระบบ
        <br />
        💡 มีหลายห้อง/หลายวิชา? นำเข้าทีเดียวจาก Excel ได้ที่แท็บ “หน่วยกิตรวมสะสม”
      </p>

      <div className="row-gap" style={{ gap: '1.25rem', marginBottom: '0.75rem' }}>
        <div className="stat"><span className="stat-value" style={{ fontSize: '1.3rem' }}>{sum.basic}</span><span className="stat-label">พื้นฐาน</span></div>
        <div className="stat"><span className="stat-value" style={{ fontSize: '1.3rem', color: 'var(--warning)' }}>{sum.additional}</span><span className="stat-label">เพิ่มเติม</span></div>
        <div className="stat"><span className="stat-value" style={{ fontSize: '1.3rem' }}>{sum.total}</span><span className="stat-label">รวมเรียนจบแล้ว (นก.)</span></div>
      </div>

      {rows.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: '0.75rem' }}>
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อวิชา</th>
                <th>ประเภท</th>
                <th className="num">นก.</th>
                <th>หมายเหตุ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td><span className={`badge ${c.type === 'พื้นฐาน' ? 'base' : 'add'}`}>{c.type}</span></td>
                  <td className="num">{c.credits}</td>
                  <td>{c.note || <span className="muted">—</span>}</td>
                  <td><button className="btn small ghost" onClick={() => api.removeCompleted(c.id)}>ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 style={{ margin: '0.25rem 0 0.5rem' }}>+ เพิ่มวิชาที่เรียนจบแล้ว</h4>
      <div className="form-row">
        <div className="field"><label>รหัสวิชา</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="เช่น ค21102" /></div>
        <div className="field"><label>ชื่อวิชา</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น คณิตศาสตร์ 2" /></div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>ประเภท</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SubjectType })}>
            <option value="พื้นฐาน">พื้นฐาน</option>
            <option value="เพิ่มเติม">เพิ่มเติม</option>
          </select>
        </div>
        <div className="field"><label>หน่วยกิต</label><input type="number" min={0} step={0.5} value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} /></div>
        <div className="field"><label>หมายเหตุ (ปี/ภาคเรียน)</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="เช่น ม.4 ภาค 1/2566" /></div>
      </div>
      {err && <p style={{ color: 'var(--danger)', margin: '0.25rem 0 0' }}>{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>ปิด</button>
        <button className="btn primary" onClick={add}>เพิ่มรายการ</button>
      </div>
    </Modal>
  );
}
