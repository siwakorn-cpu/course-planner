// exportOfferings — ส่งออกรายงาน "รายวิชาที่เปิดสอน" เป็นไฟล์ Excel (.xlsx)
// จัดกลุ่มตามกลุ่มสาระ (1 ชีตต่อ 1 กลุ่มสาระที่มีข้อมูล) ให้ตรงกับหน้า Print
import { subjectPrintRows } from './calculations';
import { AREAS, type AppData, type Area, type Semester } from './types';

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

const HEADERS = [
  'ลำดับที่', 'รหัสวิชา', 'รายวิชา', 'ประเภทวิชา', 'หน่วยกิต',
  'คาบ/สัปดาห์', 'คาบ/ภาคเรียน', 'ระดับชั้น/ห้อง', 'จำนวนห้อง', 'จำนวนคาบ', 'หมายเหตุ',
];

/** ตัดอักขระต้องห้ามของชื่อชีต Excel และจำกัดความยาว 31 ตัวอักษร */
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

/** สร้างและดาวน์โหลดไฟล์ Excel ของรายงานรายวิชาที่เปิดสอน */
export async function exportOfferingsToExcel(
  data: AppData,
  semester: Semester,
  academicYear: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = subjectPrintRows(data.offerings, data.subjects, data.classes, data.coupledGroups, semester);
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const yearText = academicYear || '…………';

  const areasWithData = AREAS.filter((area) => rows.some((r) => r.area === area));
  const targetAreas = areasWithData.length > 0 ? areasWithData : AREAS.slice(0, 1);

  for (const area of targetAreas) {
    const areaRows = rows.filter((r) => r.area === area);
    const totalPeriods = areaRows.reduce((sum, r) => sum + r.totalPeriods, 0);

    const aoa: (string | number)[][] = [
      ['รายวิชาที่เปิดสอน'],
      ['สอดคล้องตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551 (ฉบับปรับปรุง 2560)'],
      [AREA_TITLES[area]],
      [`ภาคเรียนที่ ${semester} ปีการศึกษา ${yearText}`],
      [],
      HEADERS,
    ];

    if (areaRows.length === 0) {
      aoa.push(['ไม่มีรายวิชาที่จัดสอนในภาคเรียนนี้']);
    } else {
      areaRows.forEach((r, i) => {
        aoa.push([
          i + 1,
          r.code,
          r.name,
          r.type,
          r.type === 'กิจกรรมพัฒนาผู้เรียน' ? '—' : r.credits,
          r.periodsPerWeek,
          r.periodsPerTerm,
          r.classNames,
          r.teachingGroupCount,
          r.totalPeriods,
          r.notes,
        ]);
      });
      aoa.push(['', '', '', '', '', '', '', '', 'รวมจำนวนคาบ', totalPeriods, '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 7 }, { wch: 10 }, { wch: 28 }, { wch: 20 }, { wch: 8 },
      { wch: 10 }, { wch: 11 }, { wch: 22 }, { wch: 9 }, { wch: 9 }, { wch: 18 },
    ];
    // ผสานเซลล์หัวรายงาน 4 บรรทัดให้กว้างเต็มตาราง
    ws['!merges'] = [0, 1, 2, 3].map((row) => ({ s: { r: row, c: 0 }, e: { r: row, c: HEADERS.length - 1 } }));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(area, usedNames));
  }

  XLSX.writeFile(wb, `รายวิชาที่เปิดสอน-ภาคเรียน${semester}-${yearText}.xlsx`);
}
