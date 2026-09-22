// Teachers — จัดการรายชื่อครู: เพิ่ม/แก้/ลบ/นำเข้า Excel + ดูภาระคาบสอนรวมต่อคน
import { useMemo, useRef, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { AREAS, type Area, type Teacher } from '../types';
import { type SemesterFilter, teacherWorkloadTotals } from '../calculations';
import { downloadTeacherTemplate, parseTeacherFile, type TeacherParseResult } from '../importExcel';
import { Modal } from './common/Modal';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';
import { ImportTeachersModal } from './ImportTeachersModal';

interface Props {
  api: AppDataApi;
}

type Draft = Omit<Teacher, 'id'> & { id?: string };

const emptyDraft = (): Draft => ({ name: '', area: undefined });

export function Teachers({ api }: Props) {
  const { data } = api;
  const [filter, setFilter] = useState<SemesterFilter>('ปี');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [importState, setImportState] = useState<{ result: TeacherParseResult; fileName: string } | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3500);
  };

  const onPickFile = async (file: File) => {
    try {
      const existingNames = new Set(data.teachers.map((t) => t.name.trim().toLowerCase()));
      const result = await parseTeacherFile(file, existingNames);
      setImportState({ result, fileName: file.name });
    } catch (e) {
      flash('อ่านไฟล์ไม่สำเร็จ: ' + (e instanceof Error ? e.message : 'ไฟล์ไม่ถูกต้อง'));
    }
  };

  const loadByTeacher = useMemo(
    () => teacherWorkloadTotals(data.offerings, data.subjects, data.teachers, filter),
    [data.offerings, data.subjects, data.teachers, filter],
  );
  const loadOf = (id: string) => loadByTeacher.find((r) => r.teacherId === id);
  const unassigned = loadByTeacher.find((r) => r.teacherId === null);

  const openDraft = (d: Draft) => {
    setErr('');
    setDraft(d);
  };

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setErr('กรุณากรอกชื่อครู');
      return;
    }
    if (draft.id) api.updateTeacher(draft as Teacher);
    else api.addTeacher(draft);
    setDraft(null);
  };

  const sorted = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name, 'th'));

  return (
    <div>
      <div className="page-head">
        <h2>🧑‍🏫 ครูผู้สอน</h2>
        <p>จัดการรายชื่อครู และดูภาระคาบสอนรวมของแต่ละคน (ภาระงานมาตรฐาน {data.settings.teacherLoad} คาบ/สัปดาห์)</p>
      </div>

      <div className="toolbar">
        <div className="pill-group">
          <button className={filter === 1 ? 'active' : ''} onClick={() => setFilter(1)}>ภาคเรียนที่ 1</button>
          <button className={filter === 2 ? 'active' : ''} onClick={() => setFilter(2)}>ภาคเรียนที่ 2</button>
          <button className={filter === 'ปี' ? 'active' : ''} onClick={() => setFilter('ปี')}>รวมทั้งปี</button>
        </div>
        <span className="muted">ทั้งหมด {data.teachers.length} คน</span>
        <span className="spacer" />
        <button className="btn" onClick={() => downloadTeacherTemplate()}>⬇️ แม่แบบ Excel</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ นำเข้า Excel</button>
        <button className="btn primary" onClick={() => openDraft(emptyDraft())}>+ เพิ่มครู</button>
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
      </div>

      {msg && <div className="card" style={{ marginBottom: '0.75rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}>{msg}</div>}

      {sorted.length === 0 ? (
        <div className="card empty">ยังไม่มีรายชื่อครู กด “เพิ่มครู” เพื่อเริ่ม</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชื่อ-สกุล</th>
                <th>กลุ่มสาระ</th>
                <th className="num">วิชาที่สอน</th>
                <th className="num">คาบ/สัปดาห์</th>
                <th className="num">เทียบภาระงาน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const load = loadOf(t.id);
                const periods = load?.periods ?? 0;
                const ratio = data.settings.teacherLoad > 0 ? periods / data.settings.teacherLoad : 0;
                const over = periods > data.settings.teacherLoad;
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.area ?? <span className="muted">—</span>}</td>
                    <td className="num">{load?.offeringsCount ?? 0}</td>
                    <td className="num"><strong>{periods}</strong></td>
                    <td className="num">
                      <span className={`badge ${over ? 'over' : periods === 0 ? 'warn' : 'ok'}`}>
                        {Math.round(ratio * 100)}%
                      </span>
                    </td>
                    <td>
                      <div className="row-gap">
                        <button className="btn small ghost" onClick={() => openDraft({ ...t })}>แก้ไข</button>
                        <button
                          className="btn small ghost"
                          onClick={() =>
                            setConfirmState({
                              title: 'ลบครู',
                              message: `ลบครู "${t.name}" ?\n(วิชาที่ครูคนนี้สอนจะถูกตั้งเป็น "ไม่ระบุครู" ไม่ถูกลบ)`,
                              confirmLabel: 'ลบ',
                              danger: true,
                              onConfirm: () => api.removeTeacher(t.id),
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
              {unassigned && (
                <tr>
                  <td className="muted">(ไม่ระบุครู)</td>
                  <td></td>
                  <td className="num">{unassigned.offeringsCount}</td>
                  <td className="num"><strong>{unassigned.periods}</strong></td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        “เทียบภาระงาน” = คาบของครู ÷ ภาระงานมาตรฐาน · เกิน 100% = สอนเกินเกณฑ์ (แดง)
      </p>

      {draft && (
        <Modal title={draft.id ? 'แก้ไขข้อมูลครู' : 'เพิ่มครู'} onClose={() => setDraft(null)}>
          <div className="field">
            <label>ชื่อ-สกุล</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น นายสมชาย ใจดี" />
          </div>
          <div className="field">
            <label>กลุ่มสาระ (ไม่ระบุก็ได้)</label>
            <select
              value={draft.area ?? ''}
              onChange={(e) => setDraft({ ...draft, area: e.target.value === '' ? undefined : (e.target.value as Area) })}
            >
              <option value="">— ไม่ระบุ —</option>
              {AREAS.map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
          </div>
          {err && <p style={{ color: 'var(--danger)', margin: '0.25rem 0 0' }}>{err}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setDraft(null)}>ยกเลิก</button>
            <button className="btn primary" onClick={save}>บันทึก</button>
          </div>
        </Modal>
      )}

      {importState && (
        <ImportTeachersModal
          result={importState.result}
          fileName={importState.fileName}
          api={api}
          onClose={() => setImportState(null)}
          onDone={flash}
        />
      )}

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}
    </div>
  );
}
