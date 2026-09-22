// Dashboard — ภาพรวม: ตัวเลขสรุป + กราฟคาบต่อกลุ่มสาระ
import { useMemo } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import type { TabId } from './TabNav';
import { totalPeriods, workloadByArea } from '../calculations';
import { BarChart } from './common/BarChart';

interface Props {
  api: AppDataApi;
  goto: (tab: TabId) => void;
}

export function Dashboard({ api, goto }: Props) {
  const { data } = api;

  const periodsYear = useMemo(() => totalPeriods(data.offerings, data.subjects, 'ปี', data.coupledGroups), [data]);
  const workload = useMemo(() => workloadByArea(data.offerings, data.subjects, data.settings, 'ปี', data.coupledGroups), [data]);
  // ครูที่ต้องใช้ = ผลรวมความต้องการของแต่ละกลุ่มสาระ (ปัดขึ้นรายกลุ่ม)
  // ให้ตรงกับหน้า "ภาระงาน & อัตรากำลัง" เพราะครูสังกัดกลุ่มสาระ แชร์ข้ามกลุ่มไม่ได้
  const teachers = useMemo(() => workload.reduce((sum, w) => sum + w.teachersRounded, 0), [workload]);

  const stats = [
    { label: 'รายวิชาในคลัง', value: data.subjects.length, tab: 'subjects' as TabId },
    { label: 'ห้องเรียน', value: data.classes.length, tab: 'classes' as TabId },
    { label: 'รายการจัดสอน', value: data.offerings.length, tab: 'offerings' as TabId },
    { label: 'คาบสอนรวม/สัปดาห์ (ทั้งปี)', value: periodsYear, tab: 'workload' as TabId },
    { label: 'ครูที่ต้องใช้โดยประมาณ', value: teachers, tab: 'workload' as TabId },
  ];

  return (
    <div>
      <div className="page-head">
        <h2>📊 ภาพรวม</h2>
        <p>สรุปข้อมูลทั้งหมดในระบบ คลิกการ์ดเพื่อไปยังหน้าที่เกี่ยวข้อง</p>
      </div>

      <div className="grid cols-auto">
        {stats.map((s) => (
          <button
            key={s.label}
            className="card stat"
            style={{ textAlign: 'left', cursor: 'pointer' }}
            onClick={() => goto(s.tab)}
          >
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>คาบสอนต่อกลุ่มสาระ (ทั้งปี)</h3>
        {periodsYear === 0 ? (
          <p className="muted">ยังไม่มีการจัดสอน — ไปที่แท็บ “จัดรายวิชา” เพื่อเริ่ม</p>
        ) : (
          <BarChart data={workload.map((w) => ({ label: w.area, value: w.periods }))} unit=" คาบ" />
        )}
      </div>
    </div>
  );
}
