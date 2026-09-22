import { useMemo } from 'react';
import { subjectPrintRows } from '../calculations';
import { AREAS, type AppData, type Area, type Semester } from '../types';

interface Props {
  data: AppData;
  semester: Semester;
  academicYear: string;
  screenVisible?: boolean;
}

const AREA_TITLES: Record<Area, string> = {
  'ภาษาไทย': 'กลุ่มสาระการเรียนรู้ภาษาไทย',
  'คณิตศาสตร์': 'กลุ่มสาระการเรียนรู้คณิตศาสตร์',
  'วิทยาศาสตร์และเทคโนโลยี': 'กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษาฯ': 'กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม',
  'สุขศึกษาและพลศึกษา': 'กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา',
  'ศิลปะ': 'กลุ่มสาระการเรียนรู้ศิลปะ',
  'การงานอาชีพ': 'กลุ่มสาระการเรียนรู้การงานอาชีพ',
  'ภาษาต่างประเทศ': 'กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ',
  'กิจกรรมพัฒนาผู้เรียน': 'กิจกรรมพัฒนาผู้เรียน',
};

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function PrintOfferingsReport({ data, semester, academicYear, screenVisible = false }: Props) {
  const rows = useMemo(
    () => subjectPrintRows(data.offerings, data.subjects, data.classes, data.coupledGroups, semester),
    [data.offerings, data.subjects, data.classes, data.coupledGroups, semester],
  );

  return (
    <div className={`print-report${screenVisible ? ' print-report-visible' : ''}`} aria-hidden={!screenVisible}>
      {AREAS.map((area) => {
        const areaRows = rows.filter((row) => row.area === area);
        const totalPeriods = areaRows.reduce((sum, row) => sum + row.totalPeriods, 0);
        return (
          <section className="print-area-section" key={area}>
            <header className="print-report-head">
              <h1>รายวิชาที่เปิดสอน</h1>
              <p>สอดคล้องตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551 (ฉบับปรับปรุง 2560)</p>
              <p>{AREA_TITLES[area]}</p>
              <p>ภาคเรียนที่ {semester} ปีการศึกษา {academicYear || '…………'}</p>
            </header>

            <div className="print-course-table-wrap">
            <table className="print-course-table">
              <colgroup>
                <col className="print-col-order" />
                <col className="print-col-code" />
                <col className="print-col-name" />
                <col className="print-col-type" />
                <col className="print-col-credit" />
                <col className="print-col-period" />
                <col className="print-col-term" />
                <col className="print-col-class" />
                <col className="print-col-count" />
                <col className="print-col-total" />
                <col className="print-col-note" />
              </colgroup>
              <thead>
                <tr>
                  <th>ลำดับที่</th>
                  <th>รหัสวิชา</th>
                  <th>รายวิชา</th>
                  <th>ประเภทวิชา</th>
                  <th>หน่วยกิต</th>
                  <th>คาบ/สัปดาห์</th>
                  <th>คาบ/ภาคเรียน</th>
                  <th>ระดับชั้น/ห้อง</th>
                  <th>จำนวนห้อง</th>
                  <th>จำนวนคาบ</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {areaRows.length === 0 ? (
                  <tr><td colSpan={11} className="print-empty">ไม่มีรายวิชาที่จัดสอนในภาคเรียนนี้</td></tr>
                ) : areaRows.map((row, index) => (
                  <tr key={`${row.subjectId}:${row.periodsPerWeek}`}>
                    <td className="print-num">{index + 1}</td>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.type}</td>
                    <td className="print-num">{row.type === 'กิจกรรมพัฒนาผู้เรียน' ? '—' : displayNumber(row.credits)}</td>
                    <td className="print-num">{displayNumber(row.periodsPerWeek)}</td>
                    <td className="print-num">{displayNumber(row.periodsPerTerm)}</td>
                    <td>{row.classNames}</td>
                    <td className="print-num">{row.teachingGroupCount}</td>
                    <td className="print-num">{displayNumber(row.totalPeriods)}</td>
                    <td>{row.notes}</td>
                  </tr>
                ))}
                <tr className="print-total-row">
                  <td colSpan={9}>รวมจำนวนคาบ</td>
                  <td className="print-num">{displayNumber(totalPeriods)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
