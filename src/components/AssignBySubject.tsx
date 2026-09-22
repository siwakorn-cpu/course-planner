// AssignBySubject — จัดรายวิชาแบบตั้งต้นจากรายวิชา:
// เลือกได้ "หลายวิชา" (ระดับเดียวกัน) แล้วจัดให้ "หลายห้อง" พร้อมกัน
// - เลือกวิชาเดียว: จัดการห้องที่จัดแล้วได้ (แก้ไข/ยกเลิกรายห้อง)
// - เลือกหลายวิชา: เพิ่มทุกคู่ (วิชา × ห้อง) ที่ยังไม่จัด ทีเดียว (เหมาะกับวิชาพื้นฐานลงทุกห้อง)
import { useEffect, useMemo, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { compareAreas, type Level, type Offering, type Semester, type SubjectType, tracksForLevel } from '../types';
import { classElectiveGroups, classLabel, classLevel, subjectMap, subRoomGroups } from '../calculations';
import { Modal } from './common/Modal';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';
import { findOfferingConflict } from '../offeringSemester';

interface Props {
  api: AppDataApi;
}

export function AssignBySubject({ api }: Props) {
  const { data } = api;
  const [level, setLevel] = useState<Level>(data.subjects[0]?.level ?? 'ม.ต้น');
  const [semester, setSemester] = useState<Semester>(1);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ทั้งหมด' | SubjectType>('ทั้งหมด');
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [teacherId, setTeacherId] = useState<string | undefined>(undefined);
  const [group, setGroup] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('ทั้งหมด');
  const [msg, setMsg] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [editing, setEditing] = useState<Offering | null>(null);
  const [editErr, setEditErr] = useState('');

  const sMap = useMemo(() => subjectMap(data.subjects), [data.subjects]);

  // เปลี่ยนระดับ/ภาคเรียน → ล้างการเลือก
  useEffect(() => {
    setSelectedSubjects(new Set());
    setSelectedRooms(new Set());
  }, [level]);
  useEffect(() => {
    setSelectedRooms(new Set());
  }, [semester]);

  const offeringExists = (classId: string, subjectId: string) =>
    data.offerings.some((o) => o.classId === classId && o.subjectId === subjectId && o.semester === semester);

  // ---- รายวิชา (ระดับที่เลือก) ----
  const subjectsAtLevel = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return data.subjects
      .filter(
        (s) =>
          s.level === level &&
          (typeFilter === 'ทั้งหมด' || s.type === typeFilter) &&
          (!q || `${s.code} ${s.name}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => compareAreas(a.area, b.area) || a.code.localeCompare(b.code, 'th'));
  }, [data.subjects, level, typeFilter, subjectSearch]);

  const selectedSubjectList = useMemo(
    () => data.subjects.filter((s) => selectedSubjects.has(s.id)),
    [data.subjects, selectedSubjects],
  );
  const singleSubject = selectedSubjectList.length === 1 ? selectedSubjectList[0] : null;

  // ---- ห้อง (ระดับที่เลือก) ----
  const trackLabel = level === 'ม.ปลาย' ? 'แผนการเรียน' : 'กลุ่มการเรียน';
  const trackOptions = tracksForLevel(data, level);
  const eligibleClasses = useMemo(
    () =>
      data.classes
        .filter((c) => classLevel(c) === level)
        .sort((a, b) => (a.grade === b.grade ? a.section.localeCompare(b.section, 'th') : a.grade.localeCompare(b.grade, 'th'))),
    [data.classes, level],
  );
  const filteredClasses = eligibleClasses.filter((c) => trackFilter === 'ทั้งหมด' || c.plan === trackFilter);

  const suggestedGroups = useMemo(() => {
    const auto = new Set<string>();
    for (const c of eligibleClasses) subRoomGroups(c).forEach((g) => auto.add(g));
    for (const c of eligibleClasses) classElectiveGroups(c.id, data.offerings).forEach((g) => auto.add(g));
    return [...auto].sort((a, b) => a.localeCompare(b, 'th'));
  }, [eligibleClasses, data.offerings]);

  // จำนวนคู่ (วิชา × ห้อง) ที่จะเพิ่มจริง (ข้ามที่จัดแล้ว)
  const pairsToAdd = useMemo(() => {
    let n = 0;
    for (const r of selectedRooms) for (const s of selectedSubjects) if (!offeringExists(r, s)) n++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRooms, selectedSubjects, data.offerings, semester]);

  // ---- ตัวช่วยเลือก ----
  const toggleSubject = (id: string) =>
    setSelectedSubjects((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleRoom = (id: string) =>
    setSelectedRooms((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAllSubjectsShown = () => setSelectedSubjects(new Set(subjectsAtLevel.map((s) => s.id)));
  const selectAllRoomsShown = () => setSelectedRooms(new Set(filteredClasses.map((c) => c.id)));

  const resetForm = () => {
    setSelectedSubjects(new Set());
    setSelectedRooms(new Set());
    setTeacherId(undefined);
    setGroup('');
    setTrackFilter('ทั้งหมด');
    setSubjectSearch('');
    setMsg('ล้างค่าที่ตั้งแล้ว เริ่มใหม่ได้เลย');
    setTimeout(() => setMsg(''), 2500);
  };

  const assign = () => {
    const roomIds = [...selectedRooms];
    const subjIds = [...selectedSubjects];
    if (!roomIds.length || !subjIds.length) return;
    let added = 0;
    let skipped = 0;
    const additions = [];
    for (const r of roomIds) {
      for (const sid of subjIds) {
        if (offeringExists(r, sid)) {
          skipped++;
          continue;
        }
        additions.push({ classId: r, subjectId: sid, semester, teacherId, periods: undefined, room: '', group: group.trim() || undefined });
        added++;
      }
    }
    api.addOfferings(additions);
    setMsg(`เพิ่ม ${added} รายการ (ภาคเรียนที่ ${semester})${skipped ? ` · ข้ามที่จัดแล้ว ${skipped}` : ''}`);
    setSelectedRooms(new Set());
    setTimeout(() => setMsg(''), 3500);
  };

  // ยกเลิกวิชา (เลือกวิชาเดียว) ออกจากห้อง
  const cancelForClass = (classId: string, label: string) => {
    if (!singleSubject) return;
    const offs = data.offerings.filter((o) => o.classId === classId && o.subjectId === singleSubject.id && o.semester === semester);
    setConfirmState({
      title: 'ยกเลิกการจัดวิชานี้',
      message: `เอาวิชา “${singleSubject.code} ${singleSubject.name}” ออกจาก ${label} (ภาคเรียนที่ ${semester}) ?${offs.length > 1 ? `\n(มี ${offs.length} รายการ/กลุ่ม จะถูกเอาออกทั้งหมด)` : ''}`,
      confirmLabel: 'ยกเลิกการจัด',
      danger: true,
      onConfirm: () => {
        offs.forEach((o) => api.removeOffering(o.id));
        setMsg(`เอาวิชาออกจาก ${label} แล้ว`);
        setTimeout(() => setMsg(''), 2500);
      },
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    if (findOfferingConflict(data.offerings, editing)) {
      setEditErr('ภาคเรียนปลายทางมีวิชานี้สำหรับห้องและกลุ่มเดียวกันอยู่แล้ว กรุณาเลือกภาคเรียนอื่น');
      return;
    }
    api.updateOffering(editing);
    setSemester(editing.semester);
    setEditing(null);
    setEditErr('');
    setMsg('บันทึกการแก้ไขแล้ว');
    setTimeout(() => setMsg(''), 2500);
  };

  if (data.subjects.length === 0) {
    return <div className="card empty">ยังไม่มีรายวิชาในคลัง — เพิ่มที่แท็บ “คลังรายวิชา” ก่อน</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <div className="field" style={{ margin: 0 }}>
          <label>ระดับ</label>
          <div className="pill-group">
            <button className={level === 'ม.ต้น' ? 'active' : ''} onClick={() => setLevel('ม.ต้น')}>ม.ต้น</button>
            <button className={level === 'ม.ปลาย' ? 'active' : ''} onClick={() => setLevel('ม.ปลาย')}>ม.ปลาย</button>
          </div>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>ภาคเรียน</label>
          <div className="pill-group">
            <button className={semester === 1 ? 'active' : ''} onClick={() => setSemester(1)}>ภาคเรียนที่ 1</button>
            <button className={semester === 2 ? 'active' : ''} onClick={() => setSemester(2)}>ภาคเรียนที่ 2</button>
          </div>
        </div>
        <span className="spacer" />
        <button className="btn ghost" style={{ alignSelf: 'flex-end' }} onClick={resetForm}>↺ ล้างค่าที่ตั้ง / เริ่มใหม่</button>
      </div>

      {/* เลือกรายวิชา (หลายวิชาได้) */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="row-gap" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>1) เลือกรายวิชา (เลือกได้หลายวิชา) — เลือกแล้ว {selectedSubjects.size}</h3>
          <div className="row-gap">
            <button className="btn small ghost" onClick={selectAllSubjectsShown} disabled={subjectsAtLevel.length === 0}>เลือกทั้งหมดที่แสดง</button>
            <button className="btn small ghost" onClick={() => setSelectedSubjects(new Set())} disabled={selectedSubjects.size === 0}>ล้าง</button>
          </div>
        </div>

        {/* วิชาที่เลือกแล้ว — แสดงเป็น chip แถวเดียวแนวนอน (เอาออกได้) */}
        {selectedSubjectList.length > 0 && (
          <div className="row-gap" style={{ flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
            {selectedSubjectList.map((s) => (
              <span key={s.id} className="chip" title={`${s.code} ${s.name}`}>
                {s.code}
                <button onClick={() => toggleSubject(s.id)} aria-label={`เอา ${s.code} ออก`}>✕</button>
              </span>
            ))}
          </div>
        )}

        {/* แถบค้นหา + ตัวกรองประเภท */}
        <div className="row-gap" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            value={subjectSearch}
            onChange={(e) => setSubjectSearch(e.target.value)}
            placeholder="🔍 ค้นหา รหัส/ชื่อวิชา"
            style={{ flex: 1, minWidth: 140, padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
          <div className="pill-group">
            <button className={typeFilter === 'ทั้งหมด' ? 'active' : ''} onClick={() => setTypeFilter('ทั้งหมด')}>ทั้งหมด</button>
            <button className={typeFilter === 'พื้นฐาน' ? 'active' : ''} onClick={() => setTypeFilter('พื้นฐาน')}>พื้นฐาน</button>
            <button className={typeFilter === 'เพิ่มเติม' ? 'active' : ''} onClick={() => setTypeFilter('เพิ่มเติม')}>เพิ่มเติม</button>
            <button className={typeFilter === 'กิจกรรมพัฒนาผู้เรียน' ? 'active' : ''} onClick={() => setTypeFilter('กิจกรรมพัฒนาผู้เรียน')}>กิจกรรมพัฒนาผู้เรียน</button>
          </div>
        </div>

        {subjectsAtLevel.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>ไม่พบวิชาระดับ {level} ที่ตรงกับเงื่อนไข</p>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.3rem', maxHeight: 200, overflowY: 'auto' }}>
            {subjectsAtLevel.map((s) => {
              const checked = selectedSubjects.has(s.id);
              return (
                <label key={s.id} className="row-gap" style={{ gap: '0.35rem', padding: '0.2rem 0.45rem', border: '1px solid var(--border)', borderRadius: 6, background: checked ? 'var(--primary-weak)' : 'var(--surface)', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSubject(s.id)} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.code} · {s.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {selectedSubjects.size > 0 && (
        <>
          <div className="toolbar">
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label>ครูผู้สอน (ใช้กับทุกห้อง/ทุกวิชาที่เพิ่ม)</label>
              <select value={teacherId ?? ''} onChange={(e) => setTeacherId(e.target.value === '' ? undefined : e.target.value)}>
                <option value="">— ยังไม่จัดครู —</option>
                {[...data.teachers].sort((a, b) => a.name.localeCompare(b.name, 'th')).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.area ? ` (${t.area})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 160 }}>
              <label>กลุ่มเลือก (เว้นว่าง = เรียนร่วมทั้งห้อง)</label>
              <input list="bysubj-group-list" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="เว้นว่างถ้าเรียนร่วม" />
              <datalist id="bysubj-group-list">
                {suggestedGroups.map((g) => (<option key={g} value={g} />))}
              </datalist>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 160 }}>
              <label>กรองห้องตาม{trackLabel}</label>
              <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
                <option value="ทั้งหมด">ทุก{trackLabel}</option>
                {trackOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
          </div>

          {msg && <div className="card" style={{ marginBottom: '0.75rem', borderColor: 'var(--success)', color: 'var(--success)' }}>{msg}</div>}

          <div className="card">
            <div className="row-gap" style={{ justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>2) เลือกห้อง — ระดับ {level} ({filteredClasses.length} ห้อง)</h3>
              <div className="row-gap">
                <button className="btn small ghost" onClick={selectAllRoomsShown} disabled={filteredClasses.length === 0}>เลือกทั้งหมดที่แสดง</button>
                <button className="btn small ghost" onClick={() => setSelectedRooms(new Set())} disabled={selectedRooms.size === 0}>ล้าง</button>
              </div>
            </div>

            {filteredClasses.length === 0 ? (
              <p className="empty" style={{ margin: 0 }}>ไม่มีห้องระดับ {level} ที่ตรงกับตัวกรอง</p>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: '0.35rem' }}>
                {filteredClasses.map((c) => {
                  const label = `${c.grade}/${c.section}`;
                  const info = (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {label}
                      <span className="muted" style={{ fontSize: '0.78rem' }}> · {c.plan || '—'}{c.cohort ? ` · รุ่น ${c.cohort}` : ''}</span>
                    </span>
                  );
                  const boxStyle = { gap: '0.35rem', padding: '0.28rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem' } as const;

                  // เลือกวิชาเดียว + ห้องนี้จัดแล้ว → จัดการรายห้อง (แก้ไข/ยกเลิก)
                  if (singleSubject && offeringExists(c.id, singleSubject.id)) {
                    const offs = data.offerings.filter((o) => o.classId === c.id && o.subjectId === singleSubject.id && o.semester === semester);
                    return (
                      <div key={c.id} className="row-gap" style={{ ...boxStyle, background: 'var(--success-weak)' }}>
                        {info}
                        <span className="badge ok">จัดแล้ว</span>
                        {offs.length === 1 && <button className="btn small ghost" onClick={() => { setEditErr(''); setEditing({ ...offs[0] }); }}>แก้ไข</button>}
                        <button className="btn small ghost" onClick={() => cancelForClass(c.id, label)}>ยกเลิก</button>
                      </div>
                    );
                  }

                  // เลือกห้องเพื่อเพิ่ม; ถ้าเลือกหลายวิชา แสดงจำนวนที่จัดแล้ว/ทั้งหมด
                  const checked = selectedRooms.has(c.id);
                  const doneCount = selectedSubjectList.filter((s) => offeringExists(c.id, s.id)).length;
                  return (
                    <label key={c.id} className="row-gap" style={{ ...boxStyle, background: checked ? 'var(--primary-weak)' : 'var(--surface)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRoom(c.id)} />
                      {info}
                      {selectedSubjects.size > 1 && (
                        <span className="muted" style={{ fontSize: '0.78rem' }}>จัดแล้ว {doneCount}/{selectedSubjects.size}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            <div className="row-gap" style={{ justifyContent: 'flex-end', marginTop: '0.9rem' }}>
              <button className="btn primary" onClick={assign} disabled={pairsToAdd === 0}>
                ➕ จัด {selectedSubjects.size} วิชา ให้ {selectedRooms.size} ห้อง (เพิ่ม {pairsToAdd} รายการ)
              </button>
            </div>
          </div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            เลือก “หลายวิชา” เพื่อจัดวิชาพื้นฐานให้ทุกห้องทีเดียว (รายการที่จัดแล้วจะถูกข้ามอัตโนมัติ) · เลือก “วิชาเดียว” เพื่อแก้ไข/ยกเลิกรายห้อง
          </p>
        </>
      )}

      {editing && (() => {
        const cls = data.classes.find((c) => c.id === editing.classId);
        const subj = sMap.get(editing.subjectId);
        const groupOptions = [
          ...new Set([...classElectiveGroups(editing.classId, data.offerings), ...(cls ? subRoomGroups(cls) : [])]),
        ].sort((a, b) => a.localeCompare(b, 'th'));
        return (
          <Modal title={`แก้ไขการจัดสอน — ${cls ? classLabel(cls, true) : ''}`} onClose={() => setEditing(null)}>
            <p className="muted" style={{ marginTop: 0 }}>{subj ? `${subj.code} ${subj.name}` : ''}</p>
            <div className="field">
              <label>ภาคเรียน</label>
              <select value={editing.semester} onChange={(e) => { setEditErr(''); setEditing({ ...editing, semester: Number(e.target.value) as Semester }); }}>
                <option value={1}>ภาคเรียนที่ 1</option>
                <option value={2}>ภาคเรียนที่ 2</option>
              </select>
            </div>
            <div className="field">
              <label>ครูผู้สอน</label>
              <select value={editing.teacherId ?? ''} onChange={(e) => setEditing({ ...editing, teacherId: e.target.value === '' ? undefined : e.target.value })}>
                <option value="">— ยังไม่จัดครู —</option>
                {[...data.teachers].sort((a, b) => a.name.localeCompare(b.name, 'th')).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.area ? ` (${t.area})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="field">
                <label>คาบ/สัปดาห์ (เว้นว่าง = มาตรฐาน {subj?.periods ?? '-'})</label>
                <input type="number" min={0} value={editing.periods ?? ''} placeholder={String(subj?.periods ?? '')} onChange={(e) => setEditing({ ...editing, periods: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>ห้อง/สถานที่</label>
                <input value={editing.room ?? ''} onChange={(e) => setEditing({ ...editing, room: e.target.value })} placeholder="เช่น ห้องปฏิบัติการ" />
              </div>
            </div>
            <div className="field">
              <label>กลุ่มเลือก (เว้นว่าง = ทั้งห้องเรียนร่วม)</label>
              <input list="edit-group-list" value={editing.group ?? ''} onChange={(e) => setEditing({ ...editing, group: e.target.value || undefined })} />
              <datalist id="edit-group-list">
                {groupOptions.map((g) => (<option key={g} value={g} />))}
              </datalist>
            </div>
            {editErr && <p style={{ color: 'var(--danger)', margin: '0.25rem 0 0' }}>{editErr}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(null)}>ยกเลิก</button>
              <button className="btn primary" onClick={saveEdit}>บันทึก</button>
            </div>
          </Modal>
        );
      })()}

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}
    </div>
  );
}
