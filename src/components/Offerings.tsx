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
import {
  findOfferingConflict,
  latestOfferingBatch,
  planOfferingSemesterMove,
} from '../offeringSemester';

interface Props {
  api: AppDataApi;
}

type Draft = Omit<Offering, 'id'> & { id?: string };

type Mode = 'class' | 'subject';

export function Offerings({ api }: Props) {
  const { data } = api;
  const [mode, setMode] = useState<Mode>('class');
  const [moveTarget, setMoveTarget] = useState<Semester | null>(null);
  const [undoMove, setUndoMove] = useState<{ ids: string[]; semester: Semester } | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const recentBatch = useMemo(() => latestOfferingBatch(data.offerings), [data.offerings]);
  const movePlan = useMemo(
    () => moveTarget == null
      ? null
      : planOfferingSemesterMove(data.offerings, recentBatch.map((offering) => offering.id), moveTarget),
    [data.offerings, moveTarget, recentBatch],
  );
  const batchTerm1 = recentBatch.filter((offering) => offering.semester === 1).length;
  const batchTerm2 = recentBatch.filter((offering) => offering.semester === 2).length;
  const batchTime = recentBatch[0]?.createdAt
    ? new Date(recentBatch[0].createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  const confirmMove = () => {
    if (moveTarget == null || !movePlan) return;
    const sourceSemester: Semester = moveTarget === 1 ? 2 : 1;
    const result = api.moveOfferingsToSemester(movePlan.requestedIds, moveTarget);
    if (result.movedIds.length > 0) {
      setUndoMove({ ids: result.movedIds, semester: sourceSemester });
    }
    setToast({
      type: result.movedIds.length > 0 ? 'success' : 'info',
      message: `ย้ายไปภาคเรียนที่ ${moveTarget} แล้ว ${result.movedIds.length} รายการ${result.conflictIds.length ? ` · ข้ามรายการซ้ำ ${result.conflictIds.length}` : ''}`,
    });
    setMoveTarget(null);
  };

  const undoLatestMove = () => {
    if (!undoMove) return;
    const result = api.moveOfferingsToSemester(undoMove.ids, undoMove.semester);
    setToast({
      type: result.movedIds.length > 0 ? 'success' : 'info',
      message: `ย้อนกลับไปภาคเรียนที่ ${undoMove.semester} แล้ว ${result.movedIds.length} รายการ${result.conflictIds.length ? ` · ข้ามรายการซ้ำ ${result.conflictIds.length}` : ''}`,
    });
    setUndoMove(null);
  };

  return (
    <div>
      <div className="page-head">
        <h2>🗂️ จัดรายวิชา</h2>
        <p>เลือกวิธีจัด: ตั้งต้นจากห้อง (เพิ่มหลายวิชาให้ห้องเดียว) หรือ ตั้งต้นจากรายวิชา (เพิ่มวิชาเดียวให้หลายห้อง)</p>
      </div>

      {recentBatch.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--primary)' }}>
          <div className="row-gap" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <strong>🕘 รายการที่เพิ่มล่าสุด {recentBatch.length} รายการ</strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {batchTerm1 > 0 && `ภาคเรียนที่ 1: ${batchTerm1} รายการ`}
                {batchTerm1 > 0 && batchTerm2 > 0 && ' · '}
                {batchTerm2 > 0 && `ภาคเรียนที่ 2: ${batchTerm2} รายการ`}
                {batchTime && ` · ${batchTime}`}
              </div>
            </div>
            <div className="row-gap" style={{ flexWrap: 'wrap' }}>
              {batchTerm2 > 0 && <button className="btn small" onClick={() => setMoveTarget(1)}>ย้ายชุดนี้ไปเทอม 1</button>}
              {batchTerm1 > 0 && <button className="btn small" onClick={() => setMoveTarget(2)}>ย้ายชุดนี้ไปเทอม 2</button>}
              {undoMove && <button className="btn small ghost" onClick={undoLatestMove}>↶ ย้อนกลับการย้าย</button>}
            </div>
          </div>
        </div>
      )}

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

      {moveTarget != null && movePlan && (() => {
        const moving = recentBatch.filter((offering) => movePlan.movableIds.includes(offering.id));
        const conflicts = recentBatch.filter((offering) => movePlan.conflictIds.includes(offering.id));
        const roomLabels = [...new Set(moving.map((offering) => {
          const cls = data.classes.find((item) => item.id === offering.classId);
          return cls ? classLabel(cls, true) : offering.classId;
        }))];
        const subjectLabels = [...new Set(moving.map((offering) => {
          const subject = data.subjects.find((item) => item.id === offering.subjectId);
          return subject ? `${subject.code} ${subject.name}` : offering.subjectId;
        }))];
        return (
          <Modal title={`ย้ายรายการล่าสุดไปภาคเรียนที่ ${moveTarget}`} onClose={() => setMoveTarget(null)}>
            <p style={{ margin: '0.25rem 0 0' }}>
              ระบบจะย้าย <strong>{movePlan.movableIds.length} รายการ</strong> ไปภาคเรียนที่ {moveTarget}
            </p>
            <div className="grid cols-auto" style={{ margin: '0.8rem 0' }}>
              <div className="card stat"><span className="stat-value" style={{ fontSize: '1.35rem' }}>{movePlan.movableIds.length}</span><span className="stat-label">รายการที่จะย้าย</span></div>
              <div className="card stat"><span className="stat-value" style={{ fontSize: '1.35rem' }}>{roomLabels.length}</span><span className="stat-label">ห้องเรียน</span></div>
              <div className="card stat"><span className="stat-value" style={{ fontSize: '1.35rem' }}>{subjectLabels.length}</span><span className="stat-label">รายวิชา</span></div>
            </div>
            {roomLabels.length > 0 && <p className="muted" style={{ margin: '0.3rem 0' }}><strong>ห้อง:</strong> {roomLabels.slice(0, 8).join(', ')}{roomLabels.length > 8 ? ` และอีก ${roomLabels.length - 8} ห้อง` : ''}</p>}
            {subjectLabels.length > 0 && <p className="muted" style={{ margin: '0.3rem 0' }}><strong>วิชา:</strong> {subjectLabels.slice(0, 6).join(', ')}{subjectLabels.length > 6 ? ` และอีก ${subjectLabels.length - 6} วิชา` : ''}</p>}
            {movePlan.unchangedIds.length > 0 && (
              <p className="muted" style={{ margin: '0.6rem 0 0' }}>{movePlan.unchangedIds.length} รายการอยู่ในภาคเรียนที่ {moveTarget} แล้ว จึงไม่ต้องย้าย</p>
            )}
            {conflicts.length > 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.7rem 0.8rem', borderRadius: 8, background: 'var(--warning-weak)', color: 'var(--warning)' }}>
                <strong>พบรายการซ้ำ {conflicts.length} รายการ — ระบบจะข้ามและไม่เขียนทับข้อมูลเดิม</strong>
              </div>
            )}
            <p className="muted" style={{ fontSize: '0.85rem' }}>ครูผู้สอน จำนวนคาบ ห้อง/สถานที่ และกลุ่มเลือกจะคงเดิมทั้งหมด</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMoveTarget(null)}>ยกเลิก</button>
              <button className="btn primary" onClick={confirmMove} disabled={movePlan.movableIds.length === 0}>ยืนยันย้าย {movePlan.movableIds.length} รายการ</button>
            </div>
          </Modal>
        );
      })()}

      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function AssignByClass({ api }: Props) {
  const { data } = api;
  const [classId, setClassId] = useState<string>(data.classes[0]?.id ?? '');
  const [semester, setSemester] = useState<Semester>(1);
  const [search, setSearch] = useState('');
  const [addSubjectSearch, setAddSubjectSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const sMap = useMemo(() => subjectMap(data.subjects), [data.subjects]);
  const tMap = useMemo(() => teacherMap(data.teachers), [data.teachers]);
  const currentClass = data.classes.find((c) => c.id === classId);

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

  const filteredAvailable = useMemo(() => {
    const q = addSubjectSearch.trim().toLowerCase();
    if (!q) return available;
    return available.filter((subject) =>
      [subject.code, subject.name, subject.area, subject.type]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [addSubjectSearch, available]);

  const openAdd = () => {
    if (!classId) return;
    setErr('');
    setAddSubjectSearch('');
    const first = available[0];
    setDraft({
      classId,
      semester,
      subjectId: first?.id ?? '',
      periods: undefined,
      room: '',
      teacherId: undefined,
      group: '',
    });
  };

  const save = () => {
    if (!draft || !draft.subjectId) {
      setErr('กรุณาเลือกวิชา');
      return;
    }
    if (draft.id) {
      if (findOfferingConflict(data.offerings, draft as Offering)) {
        setErr('ภาคเรียนปลายทางมีวิชานี้สำหรับห้องและกลุ่มเดียวกันอยู่แล้ว กรุณาเลือกภาคเรียนอื่น');
        return;
      }
      api.updateOffering(draft as Offering);
      setSemester(draft.semester);
    } else api.addOffering(draft);
    setDraft(null);
  };

  const summary = classId ? classCredits(classId, data.offerings, data.subjects) : null;
  const termPeriods = rows.reduce((sum, o) => {
    const s = sMap.get(o.subjectId);
    return s ? sum + offeringPeriods(o, s) : sum;
  }, 0);

  // สรุปแยกรายกลุ่มเลือกในภาคเรียนนี้ (แต่ละกลุ่ม = วิชาเรียนร่วมทั้งห้อง + วิชาเฉพาะกลุ่มนั้น)
  // ถ้าห้องไม่มีกลุ่มเลือก จะเหลือแถวเดียว = ทั้งห้อง
  const groupSummaries = useMemo(() => {
    const buckets = classGroupList.length > 0 ? classGroupList : [''];
    return buckets.map((g) => {
      const inBucket = rows.filter((o) => {
        const og = o.group?.trim() ?? '';
        return g === '' ? true : og === '' || og === g;
      });
      let periods = 0;
      let credits = 0;
      for (const o of inBucket) {
        const s = sMap.get(o.subjectId);
        if (!s) continue;
        periods += offeringPeriods(o, s);
        if (s.type !== 'กิจกรรมพัฒนาผู้เรียน') credits += s.credits;
      }
      return { group: g, count: inBucket.length, periods, credits };
    });
  }, [rows, classGroupList, sMap]);

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
        <div className="offering-summary-wrap">
          <table className="offering-summary-table">
            <thead>
              <tr>
                <th>{hasGroups ? 'กลุ่ม' : 'สรุป'}</th>
                <th className="num">วิชา</th>
                <th className="num">คาบ/สัปดาห์</th>
                <th className="num">หน่วยกิตรวม</th>
              </tr>
            </thead>
            <tbody>
              {groupSummaries.map((g) => (
                <tr key={g.group || '__all__'}>
                  <td>{g.group ? <span className="badge add">{g.group}</span> : 'ทั้งห้อง'}</td>
                  <td className="num">{g.count}</td>
                  <td className="num">{g.periods}</td>
                  <td className="num">{g.credits}</td>
                </tr>
              ))}
              {hasGroups && (
                <tr className="offering-summary-total">
                  <td>รวมทุกวิชาในห้อง</td>
                  <td className="num">{rows.length}</td>
                  <td className="num">{termPeriods}</td>
                  <td className="num">{summary.total}</td>
                </tr>
              )}
            </tbody>
          </table>
          {hasGroups && (
            <p className="muted offering-summary-note">
              แต่ละกลุ่มนับวิชาเรียนร่วมทั้งห้อง + วิชาเฉพาะกลุ่มนั้น (= สิ่งที่นักเรียนในกลุ่มเรียนจริง) · หน่วยกิต/คาบเป็นของภาคเรียนนี้
            </p>
          )}
        </div>
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
          <table className="offering-table">
            <thead>
              <tr>
                <th className="num">ลำดับ</th>
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
              {visibleRows.map((o, index) => {
                const s = sMap.get(o.subjectId);
                if (!s) return null;
                return (
                  <tr key={o.id}>
                    <td className="num">{index + 1}</td>
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
          {!draft.id && (
            <div className="field">
              <label>ค้นหารายวิชา</label>
              <input
                autoFocus
                value={addSubjectSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  const q = value.trim().toLowerCase();
                  const matches = q
                    ? available.filter((subject) =>
                      [subject.code, subject.name, subject.area, subject.type]
                        .join(' ')
                        .toLowerCase()
                        .includes(q),
                    )
                    : available;
                  const first = matches[0];
                  setAddSubjectSearch(value);
                  if (!matches.some((subject) => subject.id === draft.subjectId)) {
                    setDraft({
                      ...draft,
                      subjectId: first?.id ?? '',
                    });
                    setErr('');
                  }
                }}
                placeholder="🔍 รหัส / ชื่อวิชา / กลุ่มสาระ / ประเภท"
              />
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                พบ {filteredAvailable.length} จาก {available.length} วิชา
              </span>
            </div>
          )}
          <div className="field">
            <label>รายวิชา</label>
            {draft.id ? (
              <input readOnly value={(() => { const s = sMap.get(draft.subjectId); return s ? `${s.code} ${s.name}` : ''; })()} />
            ) : (
              <select
                value={draft.subjectId}
                onChange={(e) => {
                  const subjectId = e.target.value;
                  setDraft({ ...draft, subjectId });
                }}
              >
                {filteredAvailable.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name} ({s.type} {s.credits} นก.)</option>
                ))}
              </select>
            )}
          </div>
          {!draft.id && filteredAvailable.length === 0 && (
            <p style={{ color: 'var(--danger)', margin: '-0.4rem 0 0.75rem' }}>ไม่พบรายวิชาที่ตรงกับคำค้น</p>
          )}
          <div className="field">
            <label>ภาคเรียน</label>
            <select value={draft.semester} onChange={(e) => { setErr(''); setDraft({ ...draft, semester: Number(e.target.value) as Semester }); }}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
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
                .sort((a, b) => compareAreas(a.area, b.area) || a.name.localeCompare(b.name, 'th'))
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
            <button className="btn primary" onClick={save} disabled={!draft.subjectId}>บันทึก</button>
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
