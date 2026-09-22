import { useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import type { Semester } from '../types';
import { PrintOfferingsReport } from './PrintOfferingsReport';
import { exportOfferingsToExcel } from '../exportOfferings';

interface Props {
  api: AppDataApi;
}

export function OfferedCourses({ api }: Props) {
  const [semester, setSemester] = useState<Semester>(1);
  const [academicYear, setAcademicYear] = useState(() => String(new Date().getFullYear() + 543));
  const [exporting, setExporting] = useState(false);

  const handleExcel = async () => {
    setExporting(true);
    try {
      await exportOfferingsToExcel(api.data, semester, academicYear.trim());
    } catch (err) {
      console.error('ส่งออก Excel ไม่สำเร็จ', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="offered-courses-page">
      <div className="page-head">
        <h2>📋 แสดงรายวิชาที่เปิดสอน</h2>
        <p>แสดงเฉพาะรายวิชาที่จัดให้ห้องเรียนแล้ว แยกตามกลุ่มสาระ</p>
      </div>

      <div className="toolbar offered-courses-toolbar">
        <div className="pill-group" aria-label="เลือกภาคเรียน">
          <button className={semester === 1 ? 'active' : ''} onClick={() => setSemester(1)}>ภาคเรียนที่ 1</button>
          <button className={semester === 2 ? 'active' : ''} onClick={() => setSemester(2)}>ภาคเรียนที่ 2</button>
        </div>
        <label className="offered-year-field">
          <span>ปีการศึกษา</span>
          <input
            value={academicYear}
            inputMode="numeric"
            onChange={(event) => setAcademicYear(event.target.value)}
            placeholder="เช่น 2569"
          />
        </label>
        <span className="spacer" />
        <button className="btn" onClick={handleExcel} disabled={!academicYear.trim() || exporting}>
          {exporting ? '⏳ กำลังสร้าง…' : '⬇️ ส่งออก Excel'}
        </button>
        <button className="btn primary" onClick={() => window.print()} disabled={!academicYear.trim()}>
          🖨️ Print รายงาน
        </button>
      </div>

      <div className="card coupled-help offered-help">
        <strong>การนับจำนวนห้อง</strong>
        <span>ห้องควบที่เรียนรวมกันนับเป็น 1 ชุดสอน · คาบ/ภาคเรียน = คาบ/สัปดาห์ × 20</span>
      </div>

      <PrintOfferingsReport
        data={api.data}
        semester={semester}
        academicYear={academicYear.trim()}
        screenVisible
      />
    </div>
  );
}
