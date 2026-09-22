// Subjects — คลังรายวิชา: เพิ่ม/แก้/ลบ/ค้นหา/กรอง + นำเข้าจาก Excel
import { useMemo, useRef, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import {
  AREAS,
  compareAreas,
  type Area,
  type Level,
  type Subject,
  type SubjectType,
} from '../types';
import { creditsToPeriods } from '../calculations';
import { downloadTemplate, parseSubjectFile, type ParseResult } from '../importExcel';
import { Modal } from './common/Modal';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';
import { Toast, type ToastData } from './common/Toast';
import { ImportSubjectsModal } from './ImportSubjectsModal';

interface Props {
  api: AppDataApi;
}

type Draft = Omit<Subject, 'id'> & { id?: string };

/** คอลัมน์ที่เรียงได้ */
type SortKey = 'code' | 'name' | 'area' | 'type' | 'level' | 'credits' | 'periods';
type SortDir = 'asc' | 'desc';
const NUMERIC_KEYS: SortKey[] = ['credits', 'periods'];

/** หัวคอลัมน์ที่คลิกเพื่อเรียงได้ */
function SortHeader({
  label,
  col,
  numeric,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  numeric?: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`sortable${numeric ? ' num' : ''}`}
      onClick={() => onSort(col)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title="คลิกเพื่อเรียงลำดับ"
    >
      {label}
      <span className={`sort-ind${active ? ' active' : ''}`} aria-hidden>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
}

const emptyDraft = (): Draft => ({
  code: '',
  name: '',
  area: 'ภาษาไทย',
  type: 'พื้นฐาน',
  credits: 1,
  periods: 2,
  level: 'ม.ต้น',
});

export function Subjects({ api }: Props) {
  const { data } = api;
  const [search, setSearch] = useState('');
  const [fArea, setFArea] = useState<Area | 'ทั้งหมด'>('ทั้งหมด');
  const [fType, setFType] = useState<SubjectType | 'ทั้งหมด'>('ทั้งหมด');
  const [fLevel, setFLevel] = useState<Level | 'ทั้งหมด'>('ทั้งหมด');
  const [sortKey, setSortKey] = useState<SortKey>('area');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importState, setImportState] = useState<{ result: ParseResult; fileName: string } | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (message: string, type: ToastData['type'] = 'success') => setToast({ message, type });

  const onPickFile = async (file: File) => {
    try {
      const existingCodes = new Set(data.subjects.map((s) => s.code.trim().toLowerCase()));
      const result = await parseSubjectFile(file, data.settings, existingCodes);
      setImportState({ result, fileName: file.name });
    } catch (err) {
      flash('อ่านไฟล์ไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ไฟล์ไม่ถูกต้อง'), 'error');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.subjects.filter((s) => {
      if (fArea !== 'ทั้งหมด' && s.area !== fArea) return false;
      if (fType !== 'ทั้งหมด' && s.type !== fType) return false;
      if (fLevel !== 'ทั้งหมด' && s.level !== fLevel) return false;
      if (q && !(`${s.code} ${s.name}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data.subjects, search, fArea, fType, fLevel]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'area') {
        cmp = compareAreas(a.area, b.area) || a.code.localeCompare(b.code, 'th');
      } else if (NUMERIC_KEYS.includes(sortKey)) {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      } else {
        cmp = String(a[sortKey]).localeCompare(String(b[sortKey]), 'th');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const save = () => {
    if (!draft) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      flash('กรุณากรอกรหัสวิชาและชื่อวิชาให้ครบก่อนบันทึก', 'error');
      return;
    }
    const isEdit = !!draft.id;
    const label = `${draft.code} ${draft.name}`.trim();
    if (isEdit) api.updateSubject(draft as Subject);
    else api.addSubject(draft);
    setDraft(null);
    flash(isEdit ? `แก้ไขรายวิชา “${label}” แล้ว` : `เพิ่มรายวิชา “${label}” แล้ว`);
  };

  return (
    <div>
      <div className="page-head">
        <h2>📚 คลังรายวิชา</h2>
        <p>เพิ่ม แก้ไข ค้นหา และกรองรายวิชาทั้งหมดของโรงเรียน</p>
      </div>

      <div className="toolbar">
        <input
          placeholder="🔍 ค้นหา รหัส/ชื่อวิชา"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 200, padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <select value={fArea} onChange={(e) => setFArea(e.target.value as Area | 'ทั้งหมด')} className="filter-select">
          <option value="ทั้งหมด">ทุกกลุ่มสาระ</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value as SubjectType | 'ทั้งหมด')} className="filter-select">
          <option value="ทั้งหมด">ทุกประเภท</option>
          <option value="พื้นฐาน">พื้นฐาน</option>
          <option value="เพิ่มเติม">เพิ่มเติม</option>
          <option value="กิจกรรมพัฒนาผู้เรียน">กิจกรรมพัฒนาผู้เรียน</option>
        </select>
        <select value={fLevel} onChange={(e) => setFLevel(e.target.value as Level | 'ทั้งหมด')} className="filter-select">
          <option value="ทั้งหมด">ทุกระดับ</option>
          <option value="ม.ต้น">ม.ต้น</option>
          <option value="ม.ปลาย">ม.ปลาย</option>
        </select>
        <span className="spacer" />
        <button className="btn" onClick={() => downloadTemplate()}>⬇️ แม่แบบ Excel</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ นำเข้า Excel</button>
        <button className="btn primary" onClick={() => setDraft(emptyDraft())}>+ เพิ่มรายวิชา</button>
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

      <p className="muted" style={{ marginTop: 0 }}>พบ {filtered.length} รายวิชา (จากทั้งหมด {data.subjects.length})</p>

      {filtered.length === 0 ? (
        <div className="card empty">ไม่พบรายวิชาตามเงื่อนไข</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortHeader label="รหัส" col="code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="ชื่อวิชา" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="กลุ่มสาระ" col="area" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="ประเภท" col="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="ระดับ" col="level" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="นก." col="credits" numeric sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="คาบ/สัปดาห์" col="periods" numeric sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id}>
                  <td>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.area}</td>
                  <td>
                    <span className={`badge ${s.type === 'พื้นฐาน' ? 'base' : s.type === 'เพิ่มเติม' ? 'add' : 'activity'}`}>{s.type}</span>
                  </td>
                  <td>{s.level}</td>
                  <td className="num">{s.credits}</td>
                  <td className="num">{s.periods}</td>
                  <td>
                    <div className="row-gap">
                      <button className="btn small ghost" onClick={() => setDraft({ ...s })}>แก้ไข</button>
                      <button
                        className="btn small ghost"
                        onClick={() =>
                          setConfirmState({
                            title: 'ลบรายวิชา',
                            message: `ลบวิชา "${s.code} ${s.name}" ?\n(การจัดสอนที่ใช้วิชานี้จะถูกลบไปด้วย)`,
                            confirmLabel: 'ลบ',
                            danger: true,
                            onConfirm: () => api.removeSubject(s.id),
                          })
                        }
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? 'แก้ไขรายวิชา' : 'เพิ่มรายวิชา'} onClose={() => setDraft(null)}>
          <div className="form-row">
            <div className="field">
              <label>รหัสวิชา</label>
              <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="เช่น ค21101" />
            </div>
            <div className="field">
              <label>ชื่อวิชา</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น คณิตศาสตร์ 1" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>กลุ่มสาระ</label>
              <select value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value as Area })}>
                {AREAS.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div className="field">
              <label>ประเภท</label>
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as SubjectType })}>
                <option value="พื้นฐาน">พื้นฐาน</option>
                <option value="เพิ่มเติม">เพิ่มเติม</option>
                <option value="กิจกรรมพัฒนาผู้เรียน">กิจกรรมพัฒนาผู้เรียน</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>ระดับ</label>
              <select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Level })}>
                <option value="ม.ต้น">ม.ต้น</option>
                <option value="ม.ปลาย">ม.ปลาย</option>
              </select>
            </div>
            <div className="field">
              <label>หน่วยกิต</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={draft.credits}
                onChange={(e) => {
                  const credits = Number(e.target.value);
                  // ช่วยเติมคาบให้อัตโนมัติตามค่าตั้งค่า (แก้เองต่อได้)
                  setDraft({ ...draft, credits, periods: creditsToPeriods(credits, data.settings) });
                }}
              />
            </div>
            <div className="field">
              <label>คาบ/สัปดาห์</label>
              <input type="number" min={0} step={1} value={draft.periods} onChange={(e) => setDraft({ ...draft, periods: Number(e.target.value) })} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDraft(null)}>ยกเลิก</button>
            <button className="btn primary" onClick={save}>บันทึก</button>
          </div>
        </Modal>
      )}

      {importState && (
        <ImportSubjectsModal
          result={importState.result}
          fileName={importState.fileName}
          api={api}
          onClose={() => setImportState(null)}
          onDone={flash}
        />
      )}

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}

      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
