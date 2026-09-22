// Offerings — จัดรายวิชา: เลือกห้อง + ภาคเรียน แล้วเพิ่มวิชาที่เรียน
import { useMemo, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { compareAreas, type Offering, type Semester } from '../types';
import {
  classCredits,
  classElectiveGroups,
  classLabel,
  classLevel,
  offeringPeriods,
  subjectMap,
  subRoomGroups,
  teacherMap,
  teacherName,
} from '../calculations';
import { Modal } from './common/Modal';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';
import { Toast, type ToastData } from './common/Toast';
import { AssignBySubject } from './AssignBySubject';
import { BulkAddOfferingsModal } from './BulkAddOfferingsModal';

interface Props {
  api: AppDataApi;
}

type Draft = Omit<Offering, 'id'> & { id?: string };

type Mode = 'class' | 'subject';

export function Offerings({ api }: Props) {
  const { data } = api;
  const [mode, setMode] = useState<Mode>('class');

  return (
    <div>
      <div className="page-head">
        <h2>🗂️ จัดรายวิชา</h2>
        <p>เลือกวิธีจัด: ตั้งต้นจากห้อง (เพิ่มหลายวิชาให้ห้องเดียว) หรือ ตั้งต้นจากรายวิชา (เพิ่มวิชาเดียวให้หลายห้อง)</p>
      </div>

      <div className="pill-group" style={{ marginBottom: '1rem' }}>
        <button className={mode === 'class' ? 'active' : ''} onClick={() => setMode('class')}>🏫 ตั้งต้นจากห้อง</button>
        <button className={mode === 'subject' ? 'active' : ''} onClick={() => setMode('subject')}>📚 ตั้งต้นจากรายวิชา</button>
      </div>

      {data.classes.length === 0 ? (
        <div className="card empty">ยังไม่มีห้องเรียน — ไปที่แท็บ “ห้องเรียน” เพื่อเพิ่มก่อน</div>
      ) : mode === 'class' ? (
        <AssignByClass api={api} />
      ) : (
        <AssignBySubject api={api} />
      )}
    </div>
  );
}

function AssignByClass({ api }: Props) {
  const { data } = api;
  const [classId, setClassId] = useState<string>(data.classes[0]?.id ?? '');
  const [semester, setSemester] = useState<Semester>(1);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const sMap = useMemo(() => subjectMap(data.subjects), [data.subjects]);
  const tMap = useMemo(() => teacherMap(data.teachers), [data.teachers]);
  const currentClass = data.classes.find((c) => c.id === classId);

  // แนะนำครูอัตโนมัติจากกลุ่มสาระของวิชา (คนแรกที่กลุ่มสาระตรงกัน)
  const suggestTeacher = (subjectId: string): string | undefined => {
    const subj = sMap.get(subjectId);
    if (!subj) return undefined;
    return data.teachers.find((t) => t.area === subj.area)?.id;
  };

  const rows = useMemo(() => data.offerings
    .filter((o) => o.classId === classId && o.semester === semester)
    .sort((a, b) => {
      const sa = sMap.get(a.subjectId);
      const sb = sMap.get(b.subjectId);
      if (!sa) return sb ? 1 : 0;
      if (!sb) return -1;
      return compareAreas(sa.area, sb.area) || sa.code.localeCompare(sb.code, 'th');
    }), [data.offerings, classId, semester, sMap]);

  // กรองตามคำค้น (รหัส/ชื่อวิชา/ครู/ห้อง/กลุ่มเลือก)
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((o) => {
      const s = sMap.get(o.subjectId);
      const hay = [s?.code, s?.name, o.teacherId ? teacherName(tMap, o.teacherId) : '', o.room ?? '', o.group ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, sMap, tMap]);

  // กลุ่มเลือกที่แนะนำ = ที่ใช้อยู่แล้ว + กลุ่มย่อยอัตโนมัติจากชื่อห้องรวม (เช่น 5,6,7 -> 5/5,5/6,5/7)
  const classGroupList = useMemo(() => classElectiveGroups(classId, data.offerings), [classId, data.offerings]);
  const suggestedGroups = useMemo(() => {
    const auto = currentClass ? subRoomGroups(currentClass) : [];
    return [...new Set([...classGroupList, ...auto])].sort((a, b) => a.localeCompare(b, 'th'));
  }, [classGroupList, currentClass]);
  const hasGroups = classGroupList.length > 0;

  // วิชาที่เลือกได้ = ตรงกับระดับของห้อง และยังไม่ถูกจัดในภาคเรียนนี้
  const available = useMemo(() => {
    if (!currentClass) return [];
    const level = classLevel(currentClass);
    const usedIds = new Set(rows.map((r) => r.subjectId));
    return data.subjects
      .filter((s) => s.level === level && !usedIds.has(s.id))
      .sort((a, b) => compareAreas(a.area, b.area) || a.code.localeCompare(b.code, 'th'));
  }, [currentClass, data.subjects, rows]);

  const openAdd = () => {
    if (!classId) return;
    setErr('');
    const first = available[0];
    setDraft({
      classId,
      semester,
      subjectId: first?.id ?? '',
      periods: undefined,
      room: '',
      teacherId: first ? suggestTeacher(first.id) : undefined,
      group: '',
    });
  };

  const save = () => {
    if (!draft || !draft.subjectId) {
      setErr('กรุณาเลือกวิชา');
      return;
    }
    if (draft.id) api.updateOffering(draft as Offering);
    else api.addOffering(draft);
    setDraft(null);
  };

  const summary = classId ? classCredits(classId, data.offerings, data.subjects) : null;
  const termPeriods = rows.reduce((sum, o) => {
    const s = sMap.get(o.subjectId);
    return s ? sum + offeringPeriods(o, s) : sum;
  }, 0);

  return (
    <div>
      <div className="toolbar">
        <div className="field" style={{ margin: 0 }}>
          <label>ห้องเรียน</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>{classLabel(c, true)}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>ภาคเรียน</label>
          <div className="pill-group">
            <button className={semester === 1 ? 'active' : ''} onClick={() => setSemester(1)}>ภาคเรียนที่ 1</button>
            <button className={semester === 2 ? 'active' : ''} onClick={() => setSemester(2)}>ภาคเรียนที่ 2</button>
          </div>
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
          <label>ค้นหา</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 รหัส / ชื่อวิชา / ครู / ห้อง / กลุ่ม"
          />
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => setBulkOpen(true)} disabled={available.length === 0}>➕ เพิ่มหลายวิชา</button>
        <button className="btn primary" onClick={openAdd} disabled={available.length === 0}>+ เพิ่มวิชา</button>
      </div>

      {summary && (
        <div className="grid cols-auto" style={{ marginBottom: '1rem' }}>
          <div className="card stat"><span className="stat-value" style={{ fontSize: '1.4rem' }}>{rows.length}</span><span className="stat-label">วิชาในภาคเรียนนี้</span></div>
          <div className="card stat"><span className="stat-value" style={{ fontSize: '1.4rem' }}>{termPeriods}</span><span className="stat-label">คาบ/สัปดาห์ (ภาคเรียนนี้)</span></div>
          <div className="card stat"><span className="stat-value" style={{ fontSize: '1.4rem' }}>{summary.total}</span><span className="stat-label">{hasGroups ? 'หน่วยกิตรวมทุกกลุ่ม' : 'หน่วยกิตสะสมทั้งปี'}</span></div>
        </div>
      )}
      {hasGroups && (
        <p className="muted" style={{ marginTop: '-0.5rem', fontSize: '0.85rem' }}>
          ห้องนี้มีกลุ่มเลือก {classGroupList.length} กลุ่ม ({classGroupList.join(', ')}) — ดูหน่วยกิตที่ถูกต้อง<strong>รายกลุ่ม</strong>ได้ที่แท็บ “สรุปหน่วยกิต”
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card empty">
          {available.length === 0
            ? 'ยังไม่มีรายวิชาในคลังที่ตรงกับระดับของห้องนี้ — เพิ่มวิชาในแท็บ “คลังรายวิชา” ก่อน'
            : 'ยังไม่มีวิชาในภาคเรียนนี้ กด “เพิ่มวิชา” เพื่อเริ่มจัด'}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="card empty">ไม่พบวิชาที่ตรงกับ “{search}” ในภาคเรียนนี้</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อวิชา</th>
                <th>ประเภท</th>
                <th className="num">นก.</th>
                <th className="num">คาบ/สัปดาห์</th>
                <th>ห้อง/สถานที่</th>
                <th>ครูผู้สอน</th>
                <th>กลุ่มเลือก</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((o) => {
                const s = sMap.get(o.subjectId);
                if (!s) return null;
                return (
                  <tr key={o.id}>
                    <td>{s.code}</td>
                    <td>{s.name}</td>
                    <td><span className={`badge ${s.type === 'พื้นฐาน' ? 'base' : s.type === 'เพิ่มเติม' ? 'add' : 'activity'}`}>{s.type}</span></td>
                    <td className="num">{s.credits}</td>
                    <td className="num">
                      {offeringPeriods(o, s)}
                      {o.periods != null && o.periods !== s.periods && <span className="muted"> *</span>}
                    </td>
                    <td>{o.room || <span className="muted">—</span>}</td>
                    <td>{o.teacherId ? teacherName(tMap, o.teacherId) : <span className="muted">—</span>}</td>
                    <td>{o.group?.trim() ? <span className="badge add">{o.group}</span> : <span className="muted">ทั้งห้อง</span>}</td>
                    <td>
                      <div className="row-gap">
                        <button className="btn small ghost" onClick={() => { setErr(''); setDraft({ ...o }); }}>แก้ไข</button>
                        <button
                          className="btn small ghost"
                          onClick={() =>
                            setConfirmState({
                              title: 'ลบการจัดสอน',
                              message: `ลบวิชา "${s.code} ${s.name}" ออกจากห้องนี้ (ภาคเรียนที่ ${o.semester}) ?`,
                              confirmLabel: 'ลบ',
                              danger: true,
                              onConfirm: () => api.removeOffering(o.id),
                            })
                          }
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: '0.85rem' }}>* = คาบถูกปรับแก้ต่างจากค่ามาตรฐานของวิชา</p>

      {draft && currentClass && (
        <Modal title={draft.id ? 'แก้ไขการจัดสอน' : `เพิ่มวิชาให้ ${classLabel(currentClass, true)}`} onClose={() => setDraft(null)}>
          <div className="field">
            <label>รายวิชา</label>
            {draft.id ? (
              <input readOnly value={(() => { const s = sMap.get(draft.subjectId); return s ? `${s.code} ${s.name}` : ''; })()} />
            ) : (
              <select
                value={draft.subjectId}
                onChange={(e) => {
                  const subjectId = e.target.value;
                  setDraft({ ...draft, subjectId, teacherId: draft.teacherId ?? suggestTeacher(subjectId) });
                }}
              >
                {available.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name} ({s.type} {s.credits} นก.)</option>
                ))}
              </select>
            )}
          </div>
          <div className="form-row">
            <div className="field">
              <label>คาบ/สัปดาห์ (เว้นว่าง = ใช้ค่ามาตรฐาน {sMap.get(draft.subjectId)?.periods ?? '-'})</label>
              <input
                type="number"
                min={0}
                value={draft.periods ?? ''}
                placeholder={String(sMap.get(draft.subjectId)?.periods ?? '')}
                onChange={(e) => setDraft({ ...draft, periods: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>ห้อง/สถานที่</label>
              <input value={draft.room ?? ''} onChange={(e) => setDraft({ ...draft, room: e.target.value })} placeholder="เช่น ห้องปฏิบัติการวิทย์" />
            </div>
          </div>
          <div className="field">
            <label>ครูผู้สอน (จัดการรายชื่อได้ที่แท็บ “ครูผู้สอน”)</label>
            <select
              value={draft.teacherId ?? ''}
              onChange={(e) => setDraft({ ...draft, teacherId: e.target.value === '' ? undefined : e.target.value })}
            >
              <option value="">— ไม่ระบุ —</option>
              {[...data.teachers]
                .sort((a, b) => a.name.localeCompare(b.name, 'th'))
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.area ? ` (${t.area})` : ''}</option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>กลุ่มเลือก (เว้นว่าง = ทั้งห้องเรียนร่วมกัน; ใส่ชื่อกลุ่มถ้าเป็นวิชาเลือกเฉพาะบางคน)</label>
            <input
              list="offering-group-list"
              value={draft.group ?? ''}
              onChange={(e) => setDraft({ ...draft, group: e.target.value })}
              placeholder="เช่น ภาษาจีน, ภาษาญี่ปุ่น (เว้นว่างถ้าทั้งห้องเรียน)"
            />
            <datalist id="offering-group-list">
              {suggestedGroups.map((g) => (<option key={g} value={g} />))}
            </datalist>
            {suggestedGroups.length > 0 && (
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                กลุ่มย่อยแนะนำ: {suggestedGroups.join(' · ')} (คลิกในช่องเพื่อเลือก)
              </span>
            )}
          </div>
          {err && <p style={{ color: 'var(--danger)', margin: '0.25rem 0 0' }}>{err}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setDraft(null)}>ยกเลิก</button>
            <button className="btn primary" onClick={save}>บันทึก</button>
          </div>
        </Modal>
      )}

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}

      {bulkOpen && (
        <BulkAddOfferingsModal
          api={api}
          classId={classId}
          semester={semester}
          onDone={(m) => setToast({ message: m, type: 'success' })}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
