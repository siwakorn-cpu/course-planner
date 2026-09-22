// CreditSummary — สรุปหน่วยกิต: เทียบแต่ละห้อง (และกลุ่มเลือก) กับเกณฑ์การจบ + Export CSV
import type { AppDataApi } from '../hooks/useAppData';
import {
  type CheckItem,
  type CreditSummary as CreditSummaryType,
  classCredits,
  classElectiveGroups,
  classLabel,
  classLevel,
  completedCredits,
  evaluateRequirements,
  isClassComplete,
} from '../calculations';
import type { Level } from '../types';
import { downloadCsv } from '../exportCsv';

interface Props {
  api: AppDataApi;
}

function progressClass(item: CheckItem): string {
  if (item.state === 'เกิน') return 'over';
  if (item.state === 'ครบ') return 'ok';
  return 'warn';
}

function badgeClass(state: CheckItem['state']): string {
  if (state === 'ครบ') return 'ok';
  if (state === 'เกิน') return 'over';
  return 'warn';
}

/** แถบเช็กลิสต์เทียบเกณฑ์จบ 1 ชุด */
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
              <span className={`badge ${badgeClass(item.state)}`}>{item.state}</span>
            </span>
          </div>
          <div className={`progress ${progressClass(item)}`}>
            <span style={{ width: `${Math.min(100, item.percent)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CreditSummary({ api }: Props) {
  const { data } = api;
  const sorted = [...data.classes].sort((a, b) =>
    a.grade === b.grade ? a.section.localeCompare(b.section, 'th') : a.grade.localeCompare(b.grade, 'th'),
  );

  const evalOf = (sum: CreditSummaryType, level: Level) => evaluateRequirements(sum, level, data.settings);

  const exportCsv = () => {
    const headers = ['ห้อง', 'รุ่น', 'ระดับ', 'แผน/กลุ่ม', 'กลุ่มเลือก', 'พื้นฐาน(นก.)', 'เพิ่มเติม(นก.)', 'รวม(นก.)', 'สถานะ'];
    const rows: (string | number)[][] = [];
    for (const c of sorted) {
      const level = classLevel(c);
      const groups = classElectiveGroups(c.id, data.offerings);
      const targets = groups.length > 0 ? groups : [undefined];
      for (const g of targets) {
        const sum = classCredits(c.id, data.offerings, data.subjects, g);
        rows.push([
          `${c.grade}/${c.section}`,
          c.cohort,
          level,
          c.plan,
          g ?? '(ทั้งห้อง)',
          sum.basic,
          sum.additional,
          sum.total,
          isClassComplete(evalOf(sum, level)) ? 'ครบเกณฑ์' : 'ยังไม่ครบ',
        ]);
      }
    }
    downloadCsv('สรุปหน่วยกิตรายห้อง.csv', headers, rows);
  };

  return (
    <div>
      <div className="page-head">
        <h2>✅ สรุปหน่วยกิต</h2>
        <p>เทียบหน่วยกิตสะสมของแต่ละห้อง (รวมทุกภาคเรียน) กับเกณฑ์การจบตามระดับ · ห้องที่มีกลุ่มเลือกจะแยกเทียบรายกลุ่ม</p>
      </div>

      <div className="toolbar">
        <span className="muted">แก้เกณฑ์การจบได้ที่แท็บ “ตั้งค่า”</span>
        <span className="spacer" />
        <button className="btn" onClick={exportCsv} disabled={sorted.length === 0}>⬇️ Export CSV</button>
      </div>

      {sorted.length === 0 ? (
        <div className="card empty">ยังไม่มีห้องเรียน</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {sorted.map((c) => {
            const level = classLevel(c);
            const groups = classElectiveGroups(c.id, data.offerings);
            const hasGroups = groups.length > 0;
            const done = completedCredits(c.id, data.completed);
            const completedBlock = done.total > 0 ? (
              <div style={{ marginTop: '0.6rem', background: 'var(--surface-2)', borderRadius: 8, padding: '0.45rem 0.7rem', fontSize: '0.85rem' }}>
                <span className="muted">เรียนไปแล้ว (สะสมเดิม): </span>
                พื้นฐาน <strong>{done.basic}</strong> · เพิ่มเติม <strong>{done.additional}</strong> · รวม <strong>{done.total}</strong> นก.
              </div>
            ) : null;

            // ไม่มีกลุ่มเลือก → เทียบรวมทั้งห้องแบบเดิม
            if (!hasGroups) {
              const sum = classCredits(c.id, data.offerings, data.subjects);
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
                  {completedBlock}
                  <div style={{ marginTop: '0.8rem' }}><Checklist items={items} /></div>
                </div>
              );
            }

            // มีกลุ่มเลือก → เทียบเกณฑ์แยกรายกลุ่ม (วิชาร่วม + วิชาของกลุ่มนั้น)
            const common = classCredits(c.id, data.offerings, data.subjects, '');
            return (
              <div className="card" key={c.id}>
                <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{classLabel(c)}</h3>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>{level}{c.cohort ? ` · รุ่น ${c.cohort}` : ''}</span>
                  </div>
                  <span className="badge base">{groups.length} กลุ่มเลือก</span>
                </div>
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                  วิชาร่วมทั้งห้อง: พื้นฐาน {common.basic} · เพิ่มเติม {common.additional} นก. (นับให้ทุกกลุ่มแล้ว)
                </p>
                {completedBlock}

                {groups.map((g) => {
                  const sum = classCredits(c.id, data.offerings, data.subjects, g);
                  const items = evalOf(sum, level);
                  const complete = isClassComplete(items);
                  return (
                    <div key={g} style={{ marginTop: '0.8rem', borderTop: '1px solid var(--border)', paddingTop: '0.7rem' }}>
                      <div className="row-gap" style={{ justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <strong>กลุ่ม: {g}</strong>
                        <span className={`badge ${complete ? 'ok' : 'warn'}`}>{complete ? 'ครบเกณฑ์' : 'ยังไม่ครบ'}</span>
                      </div>
                      <Checklist items={items} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
