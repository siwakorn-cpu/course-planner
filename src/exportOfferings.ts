// exportOfferings — ส่งออกรายงาน "รายวิชาที่เปิดสอน" เป็นไฟล์ Excel (.xlsx)
// จัดหน้าให้สวยงามคล้ายหน้า Print: ฟอนต์ TH Sarabun New ขนาด 16, หัวรายงาน, เส้นตาราง
// แยก 1 ชีตต่อ 1 กลุ่มสาระ/กลุ่มย่อยที่มีข้อมูล (ให้ตรงกับหน้า Print)
import { SUBGROUP_AREAS, subjectPrintRows, type SubjectPrintRow } from './calculations';
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
  'ลำดับ', 'รหัสวิชา', 'รายวิชา', 'ประเภทวิชา', 'หน่วยกิต',
  'คาบ/สัปดาห์', 'คาบ/ภาคเรียน', 'ระดับชั้น/ห้อง', 'จำนวนห้อง', 'จำนวนคาบ', 'หมายเหตุ',
];
// คอลัมน์ที่จัดกึ่งกลาง (ที่เหลือชิดซ้าย): ลำดับ/รหัส/หน่วยกิต/คาบ/จำนวนห้อง/จำนวนคาบ
const CENTER_COLS = new Set([0, 1, 4, 5, 6, 8, 9]);

const FONT = 'TH Sarabun New';
const SIZE = 16;
const thin = { style: 'thin', color: { rgb: 'FF000000' } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

/** ตัดอักขระต้องห้ามของชื่อชีต Excel และจำกัดความยาว 31 ตัวอักษร */
function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
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
  const XLSX = await import('xlsx-js-style');
  const rows = subjectPrintRows(data.offerings, data.subjects, data.classes, data.coupledGroups, semester);
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const yearText = academicYear || '…………';

  // แตกเป็นส่วน ๆ (เฉพาะที่มีข้อมูล): กลุ่มสาระที่แยกกลุ่มย่อย → หลายชีต
  const sections: { area: Area; subGroup?: string; rows: SubjectPrintRow[] }[] = [];
  for (const area of AREAS) {
    const areaRows = rows.filter((r) => r.area === area);
    if (areaRows.length === 0) continue;
    if (SUBGROUP_AREAS[area]) {
      const labels = [...new Set(areaRows.map((r) => r.subGroup).filter((v): v is string => !!v))]
        .sort((a, b) => a.localeCompare(b, 'th'));
      for (const sg of labels) sections.push({ area, subGroup: sg, rows: areaRows.filter((r) => r.subGroup === sg) });
    } else {
      sections.push({ area, rows: areaRows });
    }
  }
  if (sections.length === 0) sections.push({ area: AREAS[0], rows: [] });

  for (const section of sections) {
    const areaRows = section.rows;
    const totalPeriods = areaRows.reduce((sum, r) => sum + r.totalPeriods, 0);
    const HEADER_ROW = 5; // แถวหัวคอลัมน์ (นับจาก 0)

    const aoa: (string | number)[][] = [
      ['รายวิชาที่เปิดสอน'],
      ['สอดคล้องตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551 (ฉบับปรับปรุง 2560)'],
      [`${AREA_TITLES[section.area]}${section.subGroup ? ` (${section.subGroup})` : ''}`],
      [`ภาคเรียนที่ ${semester} ปีการศึกษา ${yearText}`],
      [],
      HEADERS,
    ];

    const firstDataRow = aoa.length;
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
    const totalRow = areaRows.length > 0 ? aoa.length - 1 : -1;

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 6 }, { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 9 },
      { wch: 11 }, { wch: 12 }, { wch: 22 }, { wch: 9 }, { wch: 9 }, { wch: 18 },
    ];
    ws['!merges'] = [0, 1, 2, 3].map((row) => ({ s: { r: row, c: 0 }, e: { r: row, c: HEADERS.length - 1 } }));

    // ---- ใส่สไตล์ให้ทุกเซลล์ (ฟอนต์ TH Sarabun New 16 + จัดหน้าให้สวย) ----
    const range = XLSX.utils.decode_range(ws['!ref']!);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr] || (ws[addr] = { t: 's', v: '' });
        const font: Record<string, unknown> = { name: FONT, sz: SIZE };
        const alignment: Record<string, unknown> = { vertical: 'center', wrapText: true };
        const s: Record<string, unknown> = { font, alignment };

        if (R === 0) { // ชื่อรายงาน
          font.bold = true; font.sz = 22; alignment.horizontal = 'center';
        } else if (R === 1) { // คำอธิบายหลักสูตร
          font.sz = 15; alignment.horizontal = 'center';
        } else if (R === 2) { // ชื่อกลุ่มสาระ
          font.bold = true; font.sz = 18; alignment.horizontal = 'center';
        } else if (R === 3) { // ภาคเรียน/ปีการศึกษา
          alignment.horizontal = 'center';
        } else if (R === HEADER_ROW) { // หัวคอลัมน์
          font.bold = true;
          alignment.horizontal = 'center';
          s.border = border;
          s.fill = { patternType: 'solid', fgColor: { rgb: 'FFE8E8E8' } };
        } else if (R >= firstDataRow) { // ข้อมูล / แถวรวม / แถวว่าง
          if (totalRow >= 0) {
            s.border = border;
            alignment.horizontal = CENTER_COLS.has(C) ? 'center' : 'left';
            alignment.vertical = 'top';
            if (R === totalRow) { font.bold = true; alignment.horizontal = 'center'; }
          } else {
            alignment.horizontal = 'center'; // แถว "ไม่มีรายวิชา"
            font.italic = true;
          }
        }
        cell.s = s;
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(section.subGroup ?? section.area, usedNames));
  }

  XLSX.writeFile(wb, `รายวิชาที่เปิดสอน-ภาคเรียน${semester}-${yearText}.xlsx`);
}
