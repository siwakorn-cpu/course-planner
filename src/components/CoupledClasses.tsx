import { useMemo, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { compareAreas, gradeToLevel, type CoupledClassGroup } from '../types';
import { classLabel } from '../calculations';
import { Modal } from './common/Modal';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';
import { Toast, type ToastData } from './common/Toast';

interface Props {
  api: AppDataApi;
}

type Draft = Omit<CoupledClassGroup, 'id'> & { id?: string };

const emptyDraft = (): Draft => ({ name: '', classIds: [], jointSubjectIds: [] });

export function CoupledClasses({ api }: Props) {
  const { data } = api;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const classMap = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes]);
  const subjectMap = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects]);

  const openDraft = (next: Draft) => {
    setError('');
    setDraft({ ...next, classIds: [...next.classIds], jointSubjectIds: [...next.jointSubjectIds] });
  };

  const selectedClasses = draft
    ? draft.classIds.map((id) => classMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
    : [];
  const selectedGrade = selectedClasses[0]?.grade;

  const usedByOther = useMemo(() => {
    const set = new Set<string>();
    for (const group of data.coupledGroups) {
      if (group.id === draft?.id) continue;
      group.classIds.forEach((id) => set.add(id));
    }
    return set;
  }, [data.coupledGroups, draft?.id]);

  const availableSubjects = useMemo(() => {
    if (!draft || draft.classIds.length < 2 || !selectedGrade) return [];
    const level = gradeToLevel(selectedGrade);
    const selected = new Set(draft.classIds);
    const classesBySubject = new Map<string, Set<string>>();
    for (const o of data.offerings) {
      if (!selected.has(o.classId)) continue;
      const ids = classesBySubject.get(o.subjectId) ?? new Set<string>();
      ids.add(o.classId);
      classesBySubject.set(o.subjectId, ids);
    }
    return data.subjects
      .filter((s) => s.level === level && (classesBySubject.get(s.id)?.size ?? 0) > 0)
      .map((subject) => ({ subject, count: classesBySubject.get(subject.id)?.size ?? 0 }))
      .sort((a, b) => compareAreas(a.subject.area, b.subject.area) || a.subject.code.localeCompare(b.subject.code, 'th'));
  }, [draft, selectedGrade, data.offerings, data.subjects]);

  const toggleClass = (id: string) => {
    if (!draft) return;
    const exists = draft.classIds.includes(id);
    const classIds = exists ? draft.classIds.filter((x) => x !== id) : [...draft.classIds, id];
    setDraft({ ...draft, classIds });
  };

  const toggleSubject = (id: string) => {
    if (!draft) return;
    const jointSubjectIds = draft.jointSubjectIds.includes(id)
      ? draft.jointSubjectIds.filter((x) => x !== id)
      : [...draft.jointSubjectIds, id];
    setDraft({ ...draft, jointSubjectIds });
  };

  const save = () => {
    if (!draft) return;
    const classes = draft.classIds.map((id) => classMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
    if (!draft.name.trim()) return setError('กรุณาตั้งชื่อกลุ่มห้องควบ');
    if (classes.length < 2) return setError('กรุณาเลือกอย่างน้อย 2 ห้อง');
    if (new Set(classes.map((c) => c.grade)).size > 1) return setError('ห้องในกลุ่มควบต้องอยู่ระดับชั้นเดียวกัน');

    const validJoint = new Set(availableSubjects.filter((x) => x.count >= 2).map((x) => x.subject.id));
    const payload = {
      name: draft.name.trim(),
      classIds: draft.classIds,
      jointSubjectIds: draft.jointSubjectIds.filter((id) => validJoint.has(id)),
    };
    if (draft.id) api.updateCoupledGroup({ ...payload, id: draft.id });
    else api.addCoupledGroup(payload);
    setDraft(null);
    setToast({ message: 'บันทึกกลุ่มห้องควบแล้ว', type: 'success' });
  };

  const sortedClasses = [...data.classes].sort((a, b) =>
    a.grade === b.grade ? a.section.localeCompare(b.section, 'th') : a.grade.localeCompare(b.grade, 'th'),
  );

  return (
    <div>
      <div className="page-head">
        <h2>🔗 จับคู่ห้องควบ</h2>
        <p>รวมหลายห้องที่เรียนวิชาเดียวกันในเวลาเดียวกัน เพื่อคำนวณคาบครูตามการสอนจริง</p>
      </div>

      <div className="card coupled-help">
        <strong>หลักการนับคาบ</strong>
        <span><b>เรียนรวม:</b> วิชา + ภาคเรียน + ครูตรงกัน → นับคาบเพียง 1 ชุด</span>
        <span><b>เรียนแยก:</b> ไม่ติ๊กวิชานั้น → นับคาบแยกทุกห้องตามเดิม</span>
      </div>

      <div className="toolbar">
        <span className="muted">ทั้งหมด {data.coupledGroups.length} กลุ่ม</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => openDraft(emptyDraft())} disabled={data.classes.length < 2}>+ สร้างกลุ่มห้องควบ</button>
      </div>

      {data.coupledGroups.length === 0 ? (
        <div className="card empty">ยังไม่มีกลุ่มห้องควบ — ตัวอย่าง: ม.4/5, ม.4/6, ม.4/7</div>
      ) : (
        <div className="grid coupled-grid">
          {data.coupledGroups.map((group) => {
            const classes = group.classIds.map((id) => classMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
            const subjects = group.jointSubjectIds.map((id) => subjectMap.get(id)).filter((s): s is NonNullable<typeof s> => !!s)
              .sort((a, b) => compareAreas(a.area, b.area) || a.code.localeCompare(b.code, 'th'));
            return (
              <div className="card coupled-card" key={group.id}>
                <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>{group.name}</h3>
                  <span className="badge base">{classes.length} ห้อง</span>
                </div>
                <p className="coupled-classes">{classes.map((c) => classLabel(c, true)).join(' + ')}</p>
                <div className="coupled-subjects">
                  <strong>วิชาที่เรียนรวม {subjects.length} วิชา</strong>
                  {subjects.length === 0
                    ? <span className="muted">ยังไม่ได้เลือก (ทุกวิชายังนับแยกห้อง)</span>
                    : <div className="row-gap">{subjects.map((s) => <span className="chip" key={s.id}>{s.code} {s.name}</span>)}</div>}
                </div>
                <div className="row-gap" style={{ marginTop: '0.65rem' }}>
                  <button className="btn small" onClick={() => openDraft(group)}>แก้ไข</button>
                  <button className="btn small ghost" onClick={() => setConfirmState({
                    title: 'ลบกลุ่มห้องควบ',
                    message: `ลบกลุ่ม “${group.name}” ?\nคาบสอนจะกลับไปนับแยกทุกห้อง`,
                    confirmLabel: 'ลบกลุ่ม', danger: true,
                    onConfirm: () => api.removeCoupledGroup(group.id),
                  })}>ลบ</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? 'แก้ไขกลุ่มห้องควบ' : 'สร้างกลุ่มห้องควบ'} onClose={() => setDraft(null)}>
          <div className="field">
            <label>ชื่อกลุ่ม</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น ห้องควบ ม.4/5-7" />
          </div>

          <div className="field">
            <label>เลือกห้อง (อย่างน้อย 2 ห้อง และต้องอยู่ชั้นเดียวกัน)</label>
            <div className="coupled-choice-grid">
              {sortedClasses.map((c) => {
                const wrongGrade = !!selectedGrade && c.grade !== selectedGrade && !draft.classIds.includes(c.id);
                const disabled = usedByOther.has(c.id) || wrongGrade;
                return (
                  <label className={`choice-row${disabled ? ' disabled' : ''}`} key={c.id}>
                    <input type="checkbox" checked={draft.classIds.includes(c.id)} disabled={disabled} onChange={() => toggleClass(c.id)} />
                    <span>{classLabel(c, true)}</span>
                    {usedByOther.has(c.id) && <small>อยู่ในกลุ่มอื่นแล้ว</small>}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>ตั้งค่ารายวิชา</label>
            <p className="muted" style={{ margin: '0 0 0.4rem', fontSize: '0.82rem' }}>
              ติ๊ก = เรียนรวมกันและนับคาบครูชุดเดียว · ไม่ติ๊ก = เรียนแยกและนับคาบทุกห้อง
            </p>
            {draft.classIds.length < 2 ? (
              <div className="empty compact">เลือกห้องอย่างน้อย 2 ห้องก่อน</div>
            ) : availableSubjects.length === 0 ? (
              <div className="empty compact">ยังไม่มีรายวิชาที่จัดให้ห้องที่เลือก</div>
            ) : (
              <div className="coupled-subject-list">
                {availableSubjects.map(({ subject, count }) => {
                  const ready = count >= 2;
                  return (
                    <label className={`choice-row${ready ? '' : ' disabled'}`} key={subject.id}>
                      <input type="checkbox" checked={draft.jointSubjectIds.includes(subject.id)} disabled={!ready} onChange={() => toggleSubject(subject.id)} />
                      <span><b>{subject.code}</b> {subject.name}</span>
                      <small>{ready ? `มีใน ${count}/${draft.classIds.length} ห้อง` : `มีเพียง ${count} ห้อง`}</small>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p style={{ color: 'var(--danger)', margin: '0.4rem 0 0' }}>{error}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setDraft(null)}>ยกเลิก</button>
            <button className="btn primary" onClick={save}>บันทึกกลุ่มห้องควบ</button>
          </div>
        </Modal>
      )}

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}
      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
