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

/** joints ระหว่างแก้ไข: วิชา → ห้องที่เรียนรวม (คงลำดับที่ติ๊ก) */
type Draft = Omit<CoupledClassGroup, 'id' | 'joints'> & { id?: string; joints: Record<string, string[]> };

const emptyDraft = (): Draft => ({ name: '', classIds: [], joints: {} });

const toDraft = (g: CoupledClassGroup): Draft => ({
  id: g.id,
  name: g.name,
  classIds: [...g.classIds],
  joints: Object.fromEntries(g.joints.map((j) => [j.subjectId, [...j.classIds]])),
});

const sortClassIds = (ids: string[], order: Map<string, number>) =>
  [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

export function CoupledClasses({ api }: Props) {
  const { data } = api;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const classMap = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes]);
  const subjectMap = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects]);

  const sortedClasses = [...data.classes].sort((a, b) =>
    a.grade === b.grade ? a.section.localeCompare(b.section, 'th', { numeric: true }) : a.grade.localeCompare(b.grade, 'th'),
  );

  const openDraft = (next: Draft) => {
    setError('');
    setDraft(next);
  };

  const selectedClasses = draft
    ? draft.classIds.map((id) => classMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
    : [];
  const selectedGrade = selectedClasses[0]?.grade;

  // ห้อง+วิชาที่ควบอยู่ในกลุ่มอื่นแล้ว (ห้อง+วิชาหนึ่งควบได้ชุดเดียว) → ชื่อกลุ่มนั้น
  const takenByOther = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of data.coupledGroups) {
      if (group.id === draft?.id) continue;
      for (const j of group.joints) j.classIds.forEach((id) => map.set(`${id}::${j.subjectId}`, group.name));
    }
    return map;
  }, [data.coupledGroups, draft?.id]);

  // ห้องที่อยู่ในกลุ่มอื่นด้วย (อยู่ได้หลายกลุ่ม แค่แจ้งให้รู้)
  const otherGroupsOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of data.coupledGroups) {
      if (group.id === draft?.id) continue;
      group.classIds.forEach((id) => map.set(id, [...(map.get(id) ?? []), group.name]));
    }
    return map;
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
      .map((subject) => {
        const having = classesBySubject.get(subject.id) ?? new Set<string>();
        return { subject, count: having.size, classIds: draft.classIds.filter((id) => having.has(id)) };
      })
      .sort((a, b) => compareAreas(a.subject.area, b.subject.area) || a.subject.code.localeCompare(b.subject.code, 'th'));
  }, [draft, selectedGrade, data.offerings, data.subjects]);

  const toggleClass = (id: string) => {
    if (!draft) return;
    const exists = draft.classIds.includes(id);
    const classIds = exists ? draft.classIds.filter((x) => x !== id) : [...draft.classIds, id];
    // เอาห้องออกจากกลุ่ม → เอาออกจากทุกวิชาที่ควบด้วย
    const joints = exists
      ? Object.fromEntries(Object.entries(draft.joints).map(([sid, ids]) => [sid, ids.filter((x) => x !== id)]))
      : draft.joints;
    setDraft({ ...draft, classIds, joints });
  };

  /** ติ๊กวิชา = เริ่มจากทุกห้องที่มีวิชานี้ (และยังไม่ควบกับกลุ่มอื่น) แล้วค่อยเอาห้องที่ไม่ควบออก */
  const toggleSubject = (subjectId: string, candidates: string[]) => {
    if (!draft) return;
    const joints = { ...draft.joints };
    if (joints[subjectId]) delete joints[subjectId];
    else joints[subjectId] = candidates.filter((id) => !takenByOther.has(`${id}::${subjectId}`));
    setDraft({ ...draft, joints });
  };

  const toggleJointClass = (subjectId: string, classId: string) => {
    if (!draft) return;
    const current = draft.joints[subjectId] ?? [];
    const next = current.includes(classId) ? current.filter((x) => x !== classId) : [...current, classId];
    setError('');
    setDraft({ ...draft, joints: { ...draft.joints, [subjectId]: next } });
  };

  const save = () => {
    if (!draft) return;
    const classes = draft.classIds.map((id) => classMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
    if (!draft.name.trim()) return setError('กรุณาตั้งชื่อกลุ่มห้องควบ');
    if (classes.length < 2) return setError('กรุณาเลือกอย่างน้อย 2 ห้อง');
    if (new Set(classes.map((c) => c.grade)).size > 1) return setError('ห้องในกลุ่มควบต้องอยู่ระดับชั้นเดียวกัน');

    const order = new Map(sortedClasses.map((c, i) => [c.id, i]));
    const inGroup = new Set(draft.classIds);
    const joints = [];
    for (const { subject } of availableSubjects) {
      const ids = draft.joints[subject.id];
      if (!ids) continue;
      const valid = ids.filter((id) => inGroup.has(id) && !takenByOther.has(`${id}::${subject.id}`));
      if (valid.length < 2) return setError(`วิชา ${subject.code} ต้องเลือกห้องที่เรียนรวมอย่างน้อย 2 ห้อง (หรือเอาติ๊กวิชาออก)`);
      joints.push({ subjectId: subject.id, classIds: sortClassIds(valid, order) });
    }
    const payload = { name: draft.name.trim(), classIds: sortClassIds(draft.classIds, order), joints };
    if (draft.id) api.updateCoupledGroup({ ...payload, id: draft.id });
    else api.addCoupledGroup(payload);
    setDraft(null);
    setToast({ message: 'บันทึกกลุ่มห้องควบแล้ว', type: 'success' });
  };

  return (
    <div>
      <div className="page-head">
        <h2>🔗 จับคู่ห้องควบ</h2>
        <p>รวมหลายห้องที่เรียนวิชาเดียวกันในเวลาเดียวกัน เพื่อคำนวณคาบครูตามการสอนจริง</p>
      </div>

      <div className="card coupled-help">
        <strong>หลักการนับคาบ</strong>
        <span><b>เรียนรวม:</b> ติ๊กวิชา แล้วเลือก <u>เฉพาะห้องที่เรียนรวมกันจริง</u> (ภาคเรียน + ครูต้องตรงกัน) → นับคาบเพียง 1 ชุด</span>
        <span><b>เรียนแยก:</b> ไม่ติ๊กวิชา หรือไม่เลือกห้องนั้น → นับคาบแยกห้องตามเดิม</span>
        <span>ห้องหนึ่งอยู่ได้หลายกลุ่ม แต่ในแต่ละวิชาควบได้เพียงชุดเดียว</span>
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
            const joints = group.joints
              .map((j) => ({ subject: subjectMap.get(j.subjectId), classIds: j.classIds }))
              .filter((j): j is { subject: NonNullable<typeof j.subject>; classIds: string[] } => !!j.subject)
              .sort((a, b) => compareAreas(a.subject.area, b.subject.area) || a.subject.code.localeCompare(b.subject.code, 'th'));
            return (
              <div className="card coupled-card" key={group.id}>
                <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>{group.name}</h3>
                  <span className="badge base">{classes.length} ห้อง</span>
                </div>
                <p className="coupled-classes">{classes.map((c) => classLabel(c, true)).join(' + ')}</p>
                <div className="coupled-subjects">
                  <strong>วิชาที่เรียนรวม {joints.length} วิชา</strong>
                  {joints.length === 0
                    ? <span className="muted">ยังไม่ได้เลือก (ทุกวิชายังนับแยกห้อง)</span>
                    : (
                      <ul className="coupled-joint-list">
                        {joints.map(({ subject, classIds }) => (
                          <li key={subject.id}>
                            <span>{subject.code} {subject.name}</span>
                            <b>{classIds.map((id) => classMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c).map((c) => classLabel(c, true)).join(' + ')}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <div className="row-gap" style={{ marginTop: '0.65rem' }}>
                  <button className="btn small" onClick={() => openDraft(toDraft(group))}>แก้ไข</button>
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
            <label>ห้องในกลุ่ม (อย่างน้อย 2 ห้อง และต้องอยู่ชั้นเดียวกัน)</label>
            <div className="coupled-choice-grid">
              {sortedClasses.map((c) => {
                const wrongGrade = !!selectedGrade && c.grade !== selectedGrade && !draft.classIds.includes(c.id);
                const disabled = wrongGrade;
                const others = otherGroupsOf.get(c.id);
                return (
                  <label className={`choice-row${disabled ? ' disabled' : ''}`} key={c.id}>
                    <input type="checkbox" checked={draft.classIds.includes(c.id)} disabled={disabled} onChange={() => toggleClass(c.id)} />
                    <span>{classLabel(c, true)}</span>
                    {others && <small title={others.join(', ')}>อยู่ใน {others.length} กลุ่มอื่นด้วย</small>}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>ตั้งค่ารายวิชา</label>
            <p className="muted" style={{ margin: '0 0 0.4rem', fontSize: '0.82rem' }}>
              ติ๊กวิชา แล้วเลือกห้องที่เรียนรวมกันจริง (นับคาบครูชุดเดียว) · ห้องที่ไม่เลือก = เรียนแยก
            </p>
            {draft.classIds.length < 2 ? (
              <div className="empty compact">เลือกห้องอย่างน้อย 2 ห้องก่อน</div>
            ) : availableSubjects.length === 0 ? (
              <div className="empty compact">ยังไม่มีรายวิชาที่จัดให้ห้องที่เลือก</div>
            ) : (
              <div className="coupled-subject-list">
                {availableSubjects.map(({ subject, count, classIds }) => {
                  const free = classIds.filter((id) => !takenByOther.has(`${id}::${subject.id}`));
                  const selected = draft.joints[subject.id];
                  const ready = free.length >= 2 || !!selected;
                  return (
                    <div className="coupled-subject-item" key={subject.id}>
                      <label className={`choice-row${ready ? '' : ' disabled'}`}>
                        <input type="checkbox" checked={!!selected} disabled={!ready} onChange={() => toggleSubject(subject.id, classIds)} />
                        <span><b>{subject.code}</b> {subject.name}</span>
                        <small>{ready ? `มีใน ${count}/${draft.classIds.length} ห้อง` : free.length < count ? 'ควบกับกลุ่มอื่นแล้ว' : `มีเพียง ${count} ห้อง`}</small>
                      </label>
                      {selected && (
                        <div className="coupled-joint-classes">
                          <span className="muted">ห้องที่เรียนรวม:</span>
                          {classIds.map((id) => {
                            const c = classMap.get(id);
                            const takenBy = takenByOther.get(`${id}::${subject.id}`);
                            return c && (
                              <label key={id} className={`joint-class${takenBy ? ' disabled' : ''}`} title={takenBy ? `ควบวิชานี้ในกลุ่ม “${takenBy}” แล้ว` : undefined}>
                                <input type="checkbox" checked={selected.includes(id)} disabled={!!takenBy} onChange={() => toggleJointClass(subject.id, id)} />
                                {classLabel(c, true)}
                              </label>
                            );
                          })}
                          {selected.length < 2 && <small style={{ color: 'var(--danger)' }}>เลือกอย่างน้อย 2 ห้อง</small>}
                        </div>
                      )}
                    </div>
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
