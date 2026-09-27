// Workload — ภาระงาน & อัตรากำลัง: คาบสอนต่อกลุ่มสาระ + ครูที่ต้องใช้ + Export CSV
import { useMemo, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import {
  type SemesterFilter,
  areaSupportsSubGroup,
  classLabel,
  subGroupOf,
  teacherMap,
  teacherName,
  teachingUnits,
  teacherWorkloadInArea,
  workloadByGroup,
} from '../calculations';
import { BarChart } from './common/BarChart';
import { downloadCsv } from '../exportCsv';

interface Props {
  api: AppDataApi;
}

export function Workload({ api }: Props) {
  const { data } = api;
  const [filter, setFilter] = useState<SemesterFilter>('ปี');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const tMap = useMemo(() => teacherMap(data.teachers), [data.teachers]);
  const classMap = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes]);

  const workload = useMemo(
    () => workloadByGroup(data.offerings, data.subjects, data.teachers, data.settings, filter, data.coupledGroups),
    [data.offerings, data.subjects, data.teachers, data.settings, data.coupledGroups, filter],
  );

  const openGroup = useMemo(() => workload.find((g) => g.key === openKey) ?? null, [workload, openKey]);

  // ภาระงานรายครูในกลุ่มที่กางดู (กรองเฉพาะกลุ่มย่อยที่เลือก ถ้าเป็นกลุ่มสาระที่แยกกลุ่มย่อย)
  const teacherRows = useMemo(() => {
    if (!openGroup) return [];
    const match = areaSupportsSubGroup(openGroup.area)
      ? (s: Parameters<typeof subGroupOf>[0]) => subGroupOf(s) === openGroup.subGroup
      : undefined;
    return teacherWorkloadInArea(openGroup.area, data.offerings, data.subjects, data.teachers, filter, data.coupledGroups, match);
  }, [openGroup, data.offerings, data.subjects, data.teachers, data.coupledGroups, filter]);

  // จำนวนครูต่อกลุ่ม: กลุ่มปกติ = ครูที่สังกัดกลุ่มสาระ; กลุ่มย่อย = ครูที่สังกัดกลุ่มนี้และระบุกลุ่มย่อยตรงกัน
  const teacherCountByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of workload) {
      counts.set(
        g.key,
        areaSupportsSubGroup(g.area)
          ? data.teachers.filter((t) => t.area === g.area && (t.subGroup?.trim() || undefined) === g.subGroup).length
          : data.teachers.filter((t) => t.area === g.area).length,
      );
    }
    return counts;
  }, [workload, data.teachers]);

  const totals = workload.reduce(
    (acc, w) => {
      acc.periods += w.periods;
      acc.teachers += w.teachersRounded;
      return acc;
    },
    { periods: 0, teachers: 0 },
  );

  // รายการ offering ในกลุ่มที่กางดู
  const detail = useMemo(() => {
    if (!openGroup) return [];
    return teachingUnits(data.offerings, data.subjects, data.coupledGroups, filter)
      .filter((unit) => unit.subject.area === openGroup.area && (!areaSupportsSubGroup(openGroup.area) || subGroupOf(unit.subject) === openGroup.subGroup))
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
  }, [openGroup, data.offerings, data.subjects, data.coupledGroups, classMap, tMap, filter]);

  const exportCsv = () => {
    const headers = [
      'กลุ่มสาระ', 'จำนวนวิชาที่จัด', 'คาบรวม/สัปดาห์',
      'จำนวนครูในกลุ่มสาระ', 'คาบเฉลี่ยต่อครูในกลุ่มสาระ',
      'ครูที่ต้องใช้ (ปัดขึ้น)', 'ครูที่ต้องใช้ (ทศนิยม)',
    ];
    const rows = workload.map((w) => {
      const teacherCount = teacherCountByKey.get(w.key) ?? 0;
      return [
        w.label, w.offeringsCount, w.periods, teacherCount,
        teacherCount > 0 ? (w.periods / teacherCount).toFixed(2) : '',
        w.teachersRounded, w.teachersNeeded.toFixed(2),
      ];
    });
    const registeredTeachers = [...teacherCountByKey.values()].reduce((sum, count) => sum + count, 0);
    rows.push([
      'รวมทั้งหมด', workload.reduce((a, w) => a + w.offeringsCount, 0), totals.periods, registeredTeachers,
      registeredTeachers > 0 ? (totals.periods / registeredTeachers).toFixed(2) : '',
      totals.teachers, (totals.periods / (data.settings.teacherLoad || 1)).toFixed(2),
    ]);
    const label = filter === 'ปี' ? 'ทั้งปี' : `ภาคเรียน${filter}`;
    downloadCsv(`ภาระงานกลุ่มสาระ-${label}.csv`, headers, rows);
  };

  return (
    <div className="workload-page">
      <div className="page-head">
        <h2>👩‍🏫 ภาระงาน & อัตรากำลัง</h2>
        <p>คาบสอนรวม คาบเฉลี่ยต่อครูในกลุ่มสาระ และจำนวนครูที่ต้องใช้โดยประมาณ (ภาระงานมาตรฐาน {data.settings.teacherLoad} คาบ/คน)</p>
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
        <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>คลิกที่กลุ่มสาระเพื่อกางดูภาระงานรายครู · วิทยาศาสตร์และเทคโนโลยี (แยกสาย) และภาษาต่างประเทศ (แยกภาษา) คิดอัตรากำลังแยกกลุ่มย่อย</p>
        <BarChart
          data={workload.map((w) => ({ label: w.label, value: w.periods }))}
          unit=" คาบ"
          onSelect={(label) => {
            const g = workload.find((w) => w.label === label);
            if (g) setOpenKey(openKey === g.key ? null : g.key);
          }}
          activeLabel={openGroup?.label ?? null}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>กลุ่มสาระ</th>
              <th className="num">วิชาที่จัด</th>
              <th className="num">คาบรวม/สัปดาห์</th>
              <th className="num">คาบเฉลี่ย/ครูในกลุ่มสาระ</th>
              <th className="num">ครูที่ต้องใช้</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workload.map((w) => {
              const teacherCount = teacherCountByKey.get(w.key) ?? 0;
              return (
                <tr key={w.key} className={w.subGroup ? 'sci-tech-row' : undefined}>
                  <td>{w.subGroup ? <span style={{ paddingLeft: '0.8rem' }}>↳ {w.label}</span> : w.label}</td>
                  <td className="num">{w.offeringsCount}</td>
                  <td className="num">{w.periods}</td>
                  <td className="num">
                    {teacherCount > 0 ? (
                      <><strong>{(w.periods / teacherCount).toFixed(2)}</strong> <span className="muted">({teacherCount} คน)</span></>
                    ) : (
                      <span className="muted">— {w.subGroup ? '(ยังไม่ระบุครูในกลุ่มย่อยนี้)' : '(ยังไม่ระบุกลุ่มสาระของครู)'}</span>
                    )}
                  </td>
                  <td className="num">
                    <strong>{w.teachersRounded}</strong> <span className="muted">({w.teachersNeeded.toFixed(2)})</span>
                  </td>
                  <td>
                    <button className="btn small ghost" onClick={() => setOpenKey(openKey === w.key ? null : w.key)} disabled={w.offeringsCount === 0}>
                      {openKey === w.key ? 'ซ่อน' : 'ดูรายละเอียด'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openGroup && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>รายละเอียด: {openGroup.subGroup ? `${openGroup.area} · ${openGroup.label}` : openGroup.label}</h3>

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
