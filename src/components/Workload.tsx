// Workload — ภาระงาน & อัตรากำลัง: คาบสอนต่อกลุ่มสาระ + ครูที่ต้องใช้ + Export CSV
import { useMemo, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import { type Area } from '../types';
import {
  type SemesterFilter,
  classLabel,
  teacherMap,
  teacherName,
  teachingUnits,
  teacherWorkloadInArea,
  workloadByArea,
} from '../calculations';
import { BarChart } from './common/BarChart';
import { downloadCsv } from '../exportCsv';

interface Props {
  api: AppDataApi;
}

export function Workload({ api }: Props) {
  const { data } = api;
  const [filter, setFilter] = useState<SemesterFilter>('ปี');
  const [openArea, setOpenArea] = useState<Area | null>(null);

  const tMap = useMemo(() => teacherMap(data.teachers), [data.teachers]);
  const classMap = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes]);

  // ภาระงานรายครูในกลุ่มสาระที่กางดู
  const teacherRows = useMemo(
    () => (openArea ? teacherWorkloadInArea(openArea, data.offerings, data.subjects, data.teachers, filter, data.coupledGroups) : []),
    [openArea, data.offerings, data.subjects, data.teachers, data.coupledGroups, filter],
  );

  const workload = useMemo(
    () => workloadByArea(data.offerings, data.subjects, data.settings, filter, data.coupledGroups),
    [data.offerings, data.subjects, data.settings, data.coupledGroups, filter],
  );

  const totals = workload.reduce(
    (acc, w) => {
      acc.periods += w.periods;
      acc.teachers += w.teachersRounded;
      return acc;
    },
    { periods: 0, teachers: 0 },
  );

  // รายการ offering ในกลุ่มสาระที่กางดู
  const detail = useMemo(() => {
    if (!openArea) return [];
    return teachingUnits(data.offerings, data.subjects, data.coupledGroups, filter)
      .filter((unit) => unit.subject.area === openArea)
      .map((unit) => {
        const classNames = unit.classIds.map((id) => {
          const c = classMap.get(id);
          return c ? classLabel(c, true) : '(ไม่พบห้อง)';
        });
        return {
          id: unit.id,
          code: unit.subject.code,
          name: unit.subject.name,
          className: classNames.join(' + '),
          isCoupled: unit.classIds.length > 1,
          semester: unit.semester,
          periods: unit.periods,
          teacher: unit.teacherId ? teacherName(tMap, unit.teacherId) : '—',
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className, 'th'));
  }, [openArea, data.offerings, data.subjects, data.coupledGroups, classMap, tMap, filter]);

  const exportCsv = () => {
    const headers = ['กลุ่มสาระ', 'จำนวนวิชาที่จัด', 'คาบรวม/สัปดาห์', 'ครูที่ต้องใช้ (ปัดขึ้น)', 'ครูที่ต้องใช้ (ทศนิยม)'];
    const rows = workload.map((w) => [w.area, w.offeringsCount, w.periods, w.teachersRounded, w.teachersNeeded.toFixed(2)]);
    rows.push(['รวมทั้งหมด', workload.reduce((a, w) => a + w.offeringsCount, 0), totals.periods, totals.teachers, (totals.periods / (data.settings.teacherLoad || 1)).toFixed(2)]);
    const label = filter === 'ปี' ? 'ทั้งปี' : `ภาคเรียน${filter}`;
    downloadCsv(`ภาระงานกลุ่มสาระ-${label}.csv`, headers, rows);
  };

  return (
    <div>
      <div className="page-head">
        <h2>👩‍🏫 ภาระงาน & อัตรากำลัง</h2>
        <p>คาบสอนรวมของแต่ละกลุ่มสาระ และจำนวนครูที่ต้องใช้โดยประมาณ (ภาระงานมาตรฐาน {data.settings.teacherLoad} คาบ/คน — แก้ได้ในตั้งค่า)</p>
      </div>

      <div className="toolbar">
        <div className="pill-group">
          <button className={filter === 1 ? 'active' : ''} onClick={() => setFilter(1)}>ภาคเรียนที่ 1</button>
          <button className={filter === 2 ? 'active' : ''} onClick={() => setFilter(2)}>ภาคเรียนที่ 2</button>
          <button className={filter === 'ปี' ? 'active' : ''} onClick={() => setFilter('ปี')}>รวมทั้งปี</button>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={exportCsv}>⬇️ Export CSV</button>
      </div>

      <div className="grid cols-auto" style={{ marginBottom: '1rem' }}>
        <div className="card stat"><span className="stat-value">{totals.periods}</span><span className="stat-label">คาบสอนรวม/สัปดาห์</span></div>
        <div className="card stat"><span className="stat-value">{totals.teachers}</span><span className="stat-label">ครูที่ต้องใช้รวม (คน)</span></div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>คาบสอนต่อกลุ่มสาระ</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>คลิกที่กลุ่มสาระเพื่อกางดูภาระงานรายครู</p>
        <BarChart
          data={workload.map((w) => ({ label: w.area, value: w.periods }))}
          unit=" คาบ"
          onSelect={(label) => setOpenArea(openArea === (label as Area) ? null : (label as Area))}
          activeLabel={openArea}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>กลุ่มสาระ</th>
              <th className="num">วิชาที่จัด</th>
              <th className="num">คาบรวม/สัปดาห์</th>
              <th className="num">ครูที่ต้องใช้</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workload.map((w) => (
              <tr key={w.area}>
                <td>{w.area}</td>
                <td className="num">{w.offeringsCount}</td>
                <td className="num">{w.periods}</td>
                <td className="num">
                  <strong>{w.teachersRounded}</strong> <span className="muted">({w.teachersNeeded.toFixed(2)})</span>
                </td>
                <td>
                  <button className="btn small ghost" onClick={() => setOpenArea(openArea === w.area ? null : w.area)} disabled={w.offeringsCount === 0}>
                    {openArea === w.area ? 'ซ่อน' : 'ดูรายละเอียด'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openArea && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>รายละเอียด: {openArea}</h3>

          <h4 style={{ margin: '0.25rem 0 0.5rem' }}>ภาระงานรายครู</h4>
          {teacherRows.length === 0 ? (
            <p className="muted">ไม่มีรายการ</p>
          ) : (
            <div className="table-wrap" style={{ marginBottom: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>ครูผู้สอน</th>
                    <th className="num">จำนวนวิชา</th>
                    <th className="num">คาบ/สัปดาห์</th>
                    <th className="num">เทียบภาระงาน</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherRows.map((tr) => {
                    const ratio = data.settings.teacherLoad > 0 ? tr.periods / data.settings.teacherLoad : 0;
                    return (
                      <tr key={tr.teacherId ?? '__none__'}>
                        <td>{tr.teacherId === null ? <span className="muted">{tr.name}</span> : tr.name}</td>
                        <td className="num">{tr.offeringsCount}</td>
                        <td className="num"><strong>{tr.periods}</strong></td>
                        <td className="num">
                          {tr.teacherId === null ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className={`badge ${tr.periods > data.settings.teacherLoad ? 'over' : 'ok'}`}>{Math.round(ratio * 100)}%</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h4 style={{ margin: '0.25rem 0 0.5rem' }}>รายวิชาทั้งหมด</h4>
          {detail.length === 0 ? (
            <p className="muted">ไม่มีรายการ</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>รหัส</th>
                    <th>ชื่อวิชา</th>
                    <th>ห้อง</th>
                    <th className="num">ภาคเรียน</th>
                    <th className="num">คาบ/สัปดาห์</th>
                    <th>ครูผู้สอน</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map((d) => (
                    <tr key={d.id}>
                      <td>{d.code}</td>
                      <td>{d.name}</td>
                      <td>{d.className}{d.isCoupled && <span className="badge ok" style={{ marginLeft: '0.35rem' }}>ห้องควบ</span>}</td>
                      <td className="num">{d.semester}</td>
                      <td className="num">{d.periods}</td>
                      <td>{d.teacher}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
