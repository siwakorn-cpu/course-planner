// BulkAddOfferingsModal — เพิ่มหลายรายวิชาพร้อมกันให้ห้อง+ภาคเรียนที่เลือก
// ค้นหา/เลือกจากรายวิชาในคลัง (กรองระดับห้อง + ที่ยังไม่จัดในภาคเรียนนี้)
import { useMemo, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { compareAreas, type Semester } from '../types';
import { classElectiveGroups, classLabel, classLevel, subRoomGroups, subjectMap } from '../calculations';
import { Modal } from './common/Modal';

interface Props {
  api: AppDataApi;
  classId: string;
  semester: Semester;
  onDone: (msg: string) => void;
  onClose: () => void;
}

export function BulkAddOfferingsModal({ api, classId, semester, onDone, onClose }: Props) {
  const { data } = api;
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState('');

  const sMap = useMemo(() => subjectMap(data.subjects), [data.subjects]);
  const currentClass = data.classes.find((c) => c.id === classId);
  const level = currentClass ? classLevel(currentClass) : undefined;

  // วิชาที่จัดในภาคเรียนนี้แล้ว (กันเพิ่มซ้ำ)
  const usedIds = useMemo(
    () => new Set(data.offerings.filter((o) => o.classId === classId && o.semester === semester).map((o) => o.subjectId)),
    [data.offerings, classId, semester],
  );
  // วิชาในคลังที่เลือกได้ = ระดับตรงกับห้อง และยังไม่ถูกจัด
  const available = useMemo(
    () => data.subjects
      .filter((s) => s.level === level && !usedIds.has(s.id))
      .sort((a, b) => compareAreas(a.area, b.area) || a.code.localeCompare(b.code, 'th')),
    [data.subjects, level, usedIds],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((s) => `${s.code} ${s.name}`.toLowerCase().includes(q));
  }, [available, search]);

  const suggestedGroups = useMemo(() => {
    const auto = currentClass ? subRoomGroups(currentClass) : [];
    return [...new Set([...classElectiveGroups(classId, data.offerings), ...auto])].sort((a, b) => a.localeCompare(b, 'th'));
  }, [classId, data.offerings, currentClass]);

  const suggestTeacher = (subjectId: string): string | undefined => {
    const subj = sMap.get(subjectId);
    return subj ? data.teachers.find((t) => t.area === subj.area)?.id : undefined;
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAllShown = () => setSelected(new Set(filtered.map((s) => s.id)));
  const clearSel = () => setSelected(new Set());

  const add = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    for (const sid of ids) {
      api.addOffering({
        classId,
        subjectId: sid,
        semester,
        teacherId: suggestTeacher(sid),
        periods: undefined,
        room: '',
        group: group.trim() || undefined,
      });
    }
    onDone(`เพิ่ม ${ids.length} วิชาให้ ${currentClass ? classLabel(currentClass) : ''} (ภาคเรียนที่ ${semester}) แล้ว`);
    onClose();
  };

  return (
    <Modal title={`เพิ่มหลายวิชา — ${currentClass ? classLabel(currentClass, true) : ''}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        พิมพ์รหัสหรือชื่อวิชาเพื่อค้นจากคลังรายวิชา แล้วติ๊กเลือกได้หลายวิชา (แสดงเฉพาะวิชาระดับ {level ?? '-'} ที่ยังไม่จัดในภาคเรียนนี้)
      </p>

      <div className="form-row">
        <div className="field">
          <label>ค้นหาวิชา</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 รหัส / ชื่อวิชา" autoFocus />
        </div>
        <div className="field">
          <label>กลุ่มเลือก (ใช้กับทุกวิชาที่เพิ่ม; เว้นว่าง = ทั้งห้องเรียนร่วม)</label>
          <input list="bulk-group-list" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="เว้นว่างถ้าเรียนร่วมทั้งห้อง" />
          <datalist id="bulk-group-list">
            {suggestedGroups.map((g) => (<option key={g} value={g} />))}
          </datalist>
        </div>
      </div>

      <div className="row-gap" style={{ justifyContent: 'space-between', margin: '0.25rem 0 0.4rem' }}>
        <span className="muted">พบ {filtered.length} วิชา · เลือกแล้ว {selected.size}</span>
        <div className="row-gap">
          <button className="btn small ghost" onClick={selectAllShown} disabled={filtered.length === 0}>เลือกทั้งหมดที่แสดง</button>
          <button className="btn small ghost" onClick={clearSel} disabled={selected.size === 0}>ล้าง</button>
        </div>
      </div>

      {available.length === 0 ? (
        <div className="empty" style={{ padding: '1.5rem' }}>
          ไม่มีวิชาในคลังที่ตรงกับระดับห้องนี้และยังไม่ถูกจัด — เพิ่มวิชาในแท็บ “คลังรายวิชา” ก่อน
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty" style={{ padding: '1.5rem' }}>ไม่พบวิชาที่ตรงกับ “{search}”</div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th></th><th>รหัส</th><th>ชื่อวิชา</th><th>ประเภท</th><th className="num">นก.</th></tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => toggle(s.id)}>
                  <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td>{s.code}</td>
                  <td>{s.name}</td>
                  <td><span className={`badge ${s.type === 'พื้นฐาน' ? 'base' : s.type === 'เพิ่มเติม' ? 'add' : 'activity'}`}>{s.type}</span></td>
                  <td className="num">{s.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: '0.82rem' }}>
        ครูผู้สอนจะถูกแนะนำอัตโนมัติตามกลุ่มสาระของแต่ละวิชา (แก้รายวิชาได้ภายหลัง)
      </p>

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" onClick={add} disabled={selected.size === 0}>เพิ่ม {selected.size} วิชา</button>
      </div>
    </Modal>
  );
}
