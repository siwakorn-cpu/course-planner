// CumulativeCredits — หน่วยกิตรวมสะสม (เดิม + ที่กำลังจัด) เทียบเกณฑ์จบ + ทำเนียบจบการศึกษา
import { useRef, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import {
  type CheckItem,
  type CourseLine,
  type CreditSummary,
  allGroupsForClass,
  classCredits,
  classLabel,
  classLevel,
  completedCredits,
  coursesForClass,
  cumulativeCredits,
  evaluateRequirements,
  isClassComplete,
  sumCreditRecords,
} from '../calculations';
import type { Level } from '../types';
import { downloadCsv } from '../exportCsv';
import { type CompletedParseResult, downloadCompletedTemplate, parseCompletedFile } from '../importExcel';
import { Toast, type ToastData } from './common/Toast';
import { ImportCompletedModal } from './ImportCompletedModal';

interface Props {
  api: AppDataApi;
}

function pClass(item: CheckItem): string {
  if (item.state === 'เกิน') return 'over';
  if (item.state === 'ครบ') return 'ok';
  return 'warn';
}
function bClass(state: CheckItem['state']): string {
  if (state === 'ครบ') return 'ok';
  if (state === 'เกิน') return 'over';
  return 'warn';
}

function CourseTable({ lines }: { lines: CourseLine[] }) {
  if (lines.length === 0) return <p className="muted" style={{ margin: '0.4rem 0 0' }}>ยังไม่มีรายวิชา</p>;
  return (
    <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
      <table>
        <thead>
          <tr><th>รหัส</th><th>ชื่อวิชา</th><th>ประเภท</th><th className="num">นก.</th><th>ที่มา</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.code}-${i}`}>
              <td>{l.code}</td>
              <td>{l.name}</td>
              <td><span className={`badge ${l.type === 'พื้นฐาน' ? 'base' : 'add'}`}>{l.type}</span></td>
              <td className="num">{l.credits}</td>
              <td><span className="muted">{l.source}{l.group ? ` · ${l.group}` : ''}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Checklist({ items }: { items: CheckItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {items.map((item) => (
        <div key={item.label}>
          <div className="row-gap" style={{ justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span>{item.label}</span>
            <span>
              <strong>{item.value}</strong>
              <span className="muted"> / {item.kind === 'max' ? '≤ ' : ''}{item.target}</span>{' '}
              <span className={`badge ${bClass(item.state)}`}>{item.state}</span>
            </span>
          </div>
          <div className={`progress ${pClass(item)}`}>
            <span style={{ width: `${Math.min(100, item.percent)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CumulativeCredits({ api }: Props) {
  const { data } = api;
  const [importState, setImportState] = useState<{ result: CompletedParseResult; fileName: string } | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (message: string, type: ToastData['type'] = 'success') => setToast({ message, type });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const onPickFile = async (file: File) => {
    try {
      const existingKeys = new Set(data.completed.map((c) => `${c.classId}::${c.code.trim().toLowerCase()}`));
      const result = await parseCompletedFile(file, data.classes, existingKeys);
      setImportState({ result, fileName: file.name });
    } catch (e) {
      flash('อ่านไฟล์ไม่สำเร็จ: ' + (e instanceof Error ? e.message : 'ไฟล์ไม่ถูกต้อง'), 'error');
    }
  };

  const sorted = [...data.classes].sort((a, b) =>
    a.grade === b.grade ? a.section.localeCompare(b.section, 'th') : a.grade.localeCompare(b.grade, 'th'),
  );
  const evalOf = (sum: CreditSummary, level: Level) => evaluateRequirements(sum, level, data.settings);

  // เส้นแสดงที่มา "เดิม a + ปีนี้ b"
  const breakdown = (classId: string, group?: string) => {
    const old = completedCredits(classId, data.completed, group);
    const now = classCredits(classId, data.offerings, data.subjects, group);
    return (
      <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
        เดิม {old.total} + ปีนี้ {now.total} = <strong>{old.total + now.total}</strong> นก.
      </p>
    );
  };

  const exportCsv = () => {
    const headers = ['ห้อง', 'รุ่น', 'ระดับ', 'กลุ่มเลือก', 'เดิม(นก.)', 'ปีนี้(นก.)', 'รวมสะสม(นก.)', 'สถานะ'];
    const rows: (string | number)[][] = [];
    for (const c of sorted) {
      const level = classLevel(c);
      const groups = allGroupsForClass(c.id, data.offerings, data.completed);
      const targets = groups.length > 0 ? groups : [undefined];
      for (const g of targets) {
        const old = completedCredits(c.id, data.completed, g);
        const now = classCredits(c.id, data.offerings, data.subjects, g);
        const sum = cumulativeCredits(c.id, data.offerings, data.subjects, data.completed, g);
        rows.push([
          `${c.grade}/${c.section}`, c.cohort, level, g ?? '(ทั้งห้อง)',
          old.total, now.total, sum.total,
          isClassComplete(evalOf(sum, level)) ? 'ครบเกณฑ์' : 'ยังไม่ครบ',
        ]);
      }
    }
    downloadCsv('หน่วยกิตรวมสะสม.csv', headers, rows);
  };

  return (
    <div>
      <div className="page-head">
        <h2>🎯 หน่วยกิตรวมสะสม</h2>
        <p>หน่วยกิตสะสมของแต่ละห้อง = เรียนจบแล้ว (เดิม) + ที่กำลังจัดในระบบ เทียบกับเกณฑ์การจบ</p>
      </div>

      <div className="toolbar">
        <span className="muted">รวมหน่วยกิตเดิม + ปีปัจจุบัน (ต่างจากแท็บ “สรุปหน่วยกิต” ที่ดูเฉพาะปีนี้)</span>
        <span className="spacer" />
        <button className="btn" onClick={() => downloadCompletedTemplate()}>⬇️ แม่แบบหน่วยกิตเดิม</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ นำเข้าหน่วยกิตเดิม</button>
        <button className="btn" onClick={exportCsv} disabled={sorted.length === 0}>⬇️ Export CSV</button>
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

      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
      {importState && (
        <ImportCompletedModal
          result={importState.result}
          fileName={importState.fileName}
          api={api}
          onClose={() => setImportState(null)}
          onDone={flash}
        />
      )}

      {sorted.length === 0 ? (
        <div className="card empty">ยังไม่มีห้องเรียน</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {sorted.map((c) => {
            const level = classLevel(c);
            const groups = allGroupsForClass(c.id, data.offerings, data.completed);
            const hasGroups = groups.length > 0;

            if (!hasGroups) {
              const sum = cumulativeCredits(c.id, data.offerings, data.subjects, data.completed);
              const items = evalOf(sum, level);
              const complete = isClassComplete(items);
              return (
                <div className="card" key={c.id}>
                  <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{classLabel(c)}</h3>
                      <span className="muted" style={{ fontSize: '0.85rem' }}>{level}{c.cohort ? ` · รุ่น ${c.cohort}` : ''}</span>
                    </div>
                    <span className={`badge ${complete ? 'ok' : 'warn'}`}>{complete ? 'ครบเกณฑ์' : 'ยังไม่ครบ'}</span>
                  </div>
                  {breakdown(c.id)}
                  <div style={{ marginTop: '0.6rem' }}><Checklist items={items} /></div>
                  <button className="btn small ghost" style={{ marginTop: '0.5rem' }} onClick={() => toggle(`${c.id}|`)}>
                    {expanded.has(`${c.id}|`) ? 'ซ่อนรายวิชา' : 'ดูรายวิชาสะสม'}
                  </button>
                  {expanded.has(`${c.id}|`) && (
                    <CourseTable lines={coursesForClass(c.id, data.offerings, data.subjects, data.completed)} />
                  )}
                </div>
              );
            }

            return (
              <div className="card" key={c.id}>
                <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{classLabel(c)}</h3>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>{level}{c.cohort ? ` · รุ่น ${c.cohort}` : ''}</span>
                  </div>
                  <span className="badge base">{groups.length} กลุ่มเลือก</span>
                </div>
                {groups.map((g) => {
                  const sum = cumulativeCredits(c.id, data.offerings, data.subjects, data.completed, g);
                  const items = evalOf(sum, level);
                  const complete = isClassComplete(items);
                  return (
                    <div key={g} style={{ marginTop: '0.7rem', borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
                      <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                        <strong>กลุ่ม: {g}</strong>
                        <span className={`badge ${complete ? 'ok' : 'warn'}`}>{complete ? 'ครบเกณฑ์' : 'ยังไม่ครบ'}</span>
                      </div>
                      {breakdown(c.id, g)}
                      <div style={{ marginTop: '0.5rem' }}><Checklist items={items} /></div>
                      <button className="btn small ghost" style={{ marginTop: '0.5rem' }} onClick={() => toggle(`${c.id}|${g}`)}>
                        {expanded.has(`${c.id}|${g}`) ? 'ซ่อนรายวิชา' : 'ดูรายวิชาของกลุ่มนี้'}
                      </button>
                      {expanded.has(`${c.id}|${g}`) && (
                        <CourseTable lines={coursesForClass(c.id, data.offerings, data.subjects, data.completed, g)} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {data.graduated.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: '1.75rem' }}>🎓 ทำเนียบจบการศึกษา ({data.graduated.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ห้อง</th>
                  <th>รุ่น</th>
                  <th>ระดับ</th>
                  <th>แผน/กลุ่ม</th>
                  <th className="num">นร.</th>
                  <th className="num">รวม(นก.)</th>
                  <th>วันที่จบ</th>
                </tr>
              </thead>
              <tbody>
                {[...data.graduated]
                  .sort((a, b) => b.graduatedAt.localeCompare(a.graduatedAt))
                  .map((g) => {
                    const sum = sumCreditRecords(g.courses);
                    return (
                      <tr key={g.id}>
                        <td>{g.grade}/{g.section}</td>
                        <td>{g.cohort || '—'}</td>
                        <td>{g.level}</td>
                        <td>{g.plan || '—'}</td>
                        <td className="num">{g.students}</td>
                        <td className="num"><strong>{sum.total}</strong></td>
                        <td>{g.graduatedAt}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
