// Classes — ห้องเรียน: เพิ่ม/แก้/ลบ/นำเข้า Excel พร้อมสรุปหน่วยกิตสะสมของแต่ละห้อง
import { useRef, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { type ClassRoom, type Grade, GRADES, gradeToLevel, tracksForLevel } from '../types';
import { classCredits, classElectiveGroups, classLevel, completedCredits } from '../calculations';
import { classKey, downloadClassTemplate, parseClassFile, type ClassParseResult } from '../importExcel';
import { Modal } from './common/Modal';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';
import { Toast, type ToastData } from './common/Toast';
import { ImportClassesModal } from './ImportClassesModal';
import { CompletedCoursesModal } from './CompletedCoursesModal';

interface Props {
  api: AppDataApi;
}

type Draft = Omit<ClassRoom, 'id'> & { id?: string };

const emptyDraft = (): Draft => ({ grade: 'ม.1', section: '', plan: 'ทั่วไป', students: 40, cohort: '' });

export function Classes({ api }: Props) {
  const { data } = api;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);
  const [newTrack, setNewTrack] = useState('');
  const [importState, setImportState] = useState<{ result: ClassParseResult; fileName: string } | null>(null);
  const [completedFor, setCompletedFor] = useState<ClassRoom | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (message: string, type: ToastData['type'] = 'success') => setToast({ message, type });

  const onPickFile = async (file: File) => {
    try {
      const existingKeys = new Set(data.classes.map((c) => classKey(c.grade, c.section, c.cohort)));
      const result = await parseClassFile(file, existingKeys);
      setImportState({ result, fileName: file.name });
    } catch (e) {
      flash('อ่านไฟล์ไม่สำเร็จ: ' + (e instanceof Error ? e.message : 'ไฟล์ไม่ถูกต้อง'), 'error');
    }
  };

  // แผน/กลุ่ม ตามระดับของห้องที่กำลังแก้ไข
  const draftLevel = draft ? gradeToLevel(draft.grade) : 'ม.ต้น';
  const trackLabel = draftLevel === 'ม.ปลาย' ? 'แผนการเรียน' : 'กลุ่มการเรียน';
  const trackOptions = tracksForLevel(data, draftLevel);

  const openDraft = (d: Draft) => {
    setErr('');
    setAddingTrack(false);
    setDraft(d);
  };

  const save = () => {
    if (!draft) return;
    if (!draft.section.trim()) {
      setErr('กรุณากรอกชื่อห้อง');
      return;
    }
    const isEdit = !!draft.id;
    if (isEdit) api.updateClass(draft as ClassRoom);
    else api.addClass(draft);
    setDraft(null);
    flash(isEdit ? `แก้ไขห้อง ${draft.grade}/${draft.section} แล้ว` : `เพิ่มห้อง ${draft.grade}/${draft.section} แล้ว`);
  };

  const sorted = [...data.classes].sort((a, b) =>
    a.grade === b.grade ? a.section.localeCompare(b.section, 'th') : a.grade.localeCompare(b.grade, 'th'),
  );

  const toggleSel = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const confirmDeleteSelected = () => {
    const ids = [...selectedIds];
    setConfirmState({
      title: 'ลบห้องที่เลือก',
      message: `ลบห้องเรียน ${ids.length} ห้องที่เลือก ?\n(การจัดสอนและหน่วยกิตเดิมของห้องเหล่านี้จะถูกลบไปด้วย)`,
      confirmLabel: `ลบ ${ids.length} ห้อง`,
      danger: true,
      onConfirm: () => {
        api.removeClasses(ids);
        flash(`ลบห้องเรียนแล้ว ${ids.length} ห้อง`);
        exitSelect();
      },
    });
  };

  return (
    <div>
      <div className="page-head">
        <h2>🏫 ห้องเรียน</h2>
        <p>จัดการห้องเรียนและดูหน่วยกิตสะสมของแต่ละห้อง (รวมทุกภาคเรียน)</p>
      </div>

      <div className="toolbar">
        {!selectMode ? (
          <>
            <span className="muted">ทั้งหมด {data.classes.length} ห้อง</span>
            <button
              className="btn"
              onClick={() =>
                setConfirmState({
                  title: '🎓 เลื่อนชั้น / ขึ้นปีการศึกษา',
                  message:
                    'เลื่อนทุกห้องขึ้น 1 ระดับ (ม.1→2, ม.2→3, ม.4→5, ม.5→6) โดยรุ่นคงเดิม\n' +
                    '• วิชาที่จัดปีนี้จะถูกโอนเข้า “หน่วยกิตเดิม” ของห้อง แล้วล้างเพื่อจัดปีใหม่\n' +
                    '• ห้อง ม.3 และ ม.6 จะจบการศึกษา → ย้ายเข้า “ทำเนียบจบการศึกษา”\n\n' +
                    'แนะนำ Export สำรองข้อมูลก่อน (แท็บตั้งค่า) — ยืนยันดำเนินการ?',
                  confirmLabel: 'เลื่อนชั้น',
                  danger: true,
                  onConfirm: () => {
                    const r = api.promoteAll();
                    flash(`เลื่อนชั้นแล้ว: เลื่อนขึ้น ${r.promotedCount} ห้อง · จบการศึกษา ${r.graduatedCount} ห้อง`);
                  },
                })
              }
            >
              🎓 เลื่อนชั้น
            </button>
            <button className="btn" onClick={() => setSelectMode(true)} disabled={sorted.length === 0}>☑️ เลือกหลายห้อง</button>
            <span className="spacer" />
            <button className="btn" onClick={() => downloadClassTemplate()}>⬇️ แม่แบบ Excel</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ นำเข้า Excel</button>
            <button className="btn primary" onClick={() => openDraft(emptyDraft())}>+ เพิ่มห้องเรียน</button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
                e.target.value = '';
              }}
            />
          </>
        ) : (
          <>
            <span className="muted">เลือกแล้ว {selectedIds.size} ห้อง</span>
            <button className="btn small" onClick={() => setSelectedIds(new Set(sorted.map((c) => c.id)))}>เลือกทั้งหมด</button>
            <button className="btn small" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>ล้าง</button>
            <span className="spacer" />
            <button className="btn danger" onClick={confirmDeleteSelected} disabled={selectedIds.size === 0}>🗑️ ลบที่เลือก ({selectedIds.size})</button>
            <button className="btn" onClick={exitSelect}>เสร็จสิ้น</button>
          </>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="card empty">ยังไม่มีห้องเรียน กด “เพิ่มห้องเรียน” เพื่อเริ่ม</div>
      ) : (
        <div className="grid class-cards">
          {sorted.map((c) => {
            const groups = classElectiveGroups(c.id, data.offerings);
            const hasGroups = groups.length > 0;
            // ถ้ามีกลุ่มเลือก ให้แสดงหน่วยกิต "วิชาร่วม" (นับครั้งเดียว) กันตัวเลขเกินจริง
            const sum = classCredits(c.id, data.offerings, data.subjects, hasGroups ? '' : undefined);
            const done = completedCredits(c.id, data.completed);
            const selected = selectedIds.has(c.id);
            return (
              <div
                className="card class-card"
                key={c.id}
                onClick={selectMode ? () => toggleSel(c.id) : undefined}
                style={selectMode ? { cursor: 'pointer', borderColor: selected ? 'var(--primary)' : undefined, background: selected ? 'var(--primary-weak)' : undefined } : undefined}
              >
                <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                  <div className="row-gap" style={{ gap: '0.4rem' }}>
                    {selectMode && <input type="checkbox" checked={selected} onChange={() => toggleSel(c.id)} onClick={(e) => e.stopPropagation()} />}
                    <h3 style={{ margin: 0 }}>{c.grade}/{c.section}</h3>
                  </div>
                  <div className="row-gap">
                    {c.cohort && <span className="badge add">รุ่น {c.cohort}</span>}
                    <span className="badge base">{classLevel(c)}</span>
                  </div>
                </div>
                <p className="muted" style={{ margin: '0.1rem 0 0.35rem', fontSize: '0.85rem' }}>
                  {c.plan || 'ทั่วไป'} · {c.students} คน
                </p>
                <div className="class-credits">
                  <span>พื้นฐาน <strong>{sum.basic}</strong></span>
                  <span>เพิ่มเติม <strong style={{ color: 'var(--warning)' }}>{sum.additional}</strong></span>
                  <span>{hasGroups ? 'ร่วม' : 'รวม'} <strong>{sum.total}</strong> นก.</span>
                </div>
                {hasGroups && (
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>
                    + {groups.length} กลุ่มเลือก (ดูหน่วยกิตรายกลุ่มที่ “สรุปหน่วยกิต”)
                  </p>
                )}
                {done.total > 0 && (
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>
                    เรียนจบแล้ว (สะสมเดิม): <strong>{done.total}</strong> นก.
                  </p>
                )}
                {!selectMode && (
                  <div className="row-gap" style={{ marginTop: '0.35rem' }}>
                    <button className="btn small ghost" onClick={() => setCompletedFor(c)}>📚 หน่วยกิตเดิม</button>
                    <button className="btn small ghost" onClick={() => openDraft({ ...c })}>แก้ไข</button>
                    <button
                      className="btn small ghost"
                      onClick={() =>
                        setConfirmState({
                          title: 'ลบห้องเรียน',
                          message: `ลบห้อง ${c.grade}/${c.section}${c.cohort ? ` รุ่น ${c.cohort}` : ''} ?\n(การจัดสอนของห้องนี้จะถูกลบไปด้วย)`,
                          confirmLabel: 'ลบ',
                          danger: true,
                          onConfirm: () => api.removeClass(c.id),
                        })
                      }
                    >
                      ลบ
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? 'แก้ไขห้องเรียน' : 'เพิ่มห้องเรียน'} onClose={() => setDraft(null)}>
          <div className="form-row">
            <div className="field">
              <label>ระดับชั้น</label>
              <select value={draft.grade} onChange={(e) => setDraft({ ...draft, grade: e.target.value as Grade })}>
                {GRADES.map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>
            <div className="field">
              <label>ห้อง</label>
              <input value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })} placeholder="เช่น 1, 2/EP" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>{trackLabel}</label>
              {!addingTrack ? (
                <select
                  value={draft.plan}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setNewTrack('');
                      setAddingTrack(true);
                    } else {
                      setDraft({ ...draft, plan: e.target.value });
                    }
                  }}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {trackOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
                  {draft.plan && !trackOptions.includes(draft.plan) && (
                    <option value={draft.plan}>{draft.plan}</option>
                  )}
                  <option value="__new__">➕ เพิ่ม{trackLabel}ใหม่…</option>
                </select>
              ) : (
                <div className="row-gap">
                  <input
                    autoFocus
                    value={newTrack}
                    onChange={(e) => setNewTrack(e.target.value)}
                    placeholder={`ชื่อ${trackLabel}ใหม่`}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn small primary"
                    onClick={() => {
                      const name = newTrack.trim();
                      if (name) {
                        api.addTrack(draftLevel, name);
                        setDraft({ ...draft, plan: name });
                      }
                      setAddingTrack(false);
                    }}
                  >
                    เพิ่ม
                  </button>
                  <button className="btn small ghost" onClick={() => setAddingTrack(false)}>ยกเลิก</button>
                </div>
              )}
            </div>
            <div className="field">
              <label>รุ่น (หลักสูตรปี)</label>
              <input value={draft.cohort} onChange={(e) => setDraft({ ...draft, cohort: e.target.value })} placeholder="เช่น 55" />
            </div>
            <div className="field">
              <label>จำนวนนักเรียน</label>
              <input type="number" min={0} value={draft.students} onChange={(e) => setDraft({ ...draft, students: Number(e.target.value) })} />
            </div>
          </div>
          {err && <p style={{ color: 'var(--danger)', margin: '0.25rem 0 0' }}>{err}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setDraft(null)}>ยกเลิก</button>
            <button className="btn primary" onClick={save}>บันทึก</button>
          </div>
        </Modal>
      )}

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}

      {importState && (
        <ImportClassesModal
          result={importState.result}
          fileName={importState.fileName}
          api={api}
          onClose={() => setImportState(null)}
          onDone={flash}
        />
      )}

      {completedFor && (
        <CompletedCoursesModal classroom={completedFor} api={api} onClose={() => setCompletedFor(null)} />
      )}

      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
