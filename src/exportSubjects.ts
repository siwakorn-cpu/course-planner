// exportSubjects — ส่งออก "คลังรายวิชา" เป็นไฟล์ Excel (.xlsx) โดยเลือกคอลัมน์ได้
// ฟอนต์ TH Sarabun New ขนาด 16 + เส้นตาราง ให้เข้าชุดกับรายงานรายวิชาที่เปิดสอน
import { subGroupOf } from './calculations';
import type { Subject } from './types';

export type SubjectColumnId = 'no' | 'code' | 'name' | 'area' | 'subGroup' | 'type' | 'level' | 'credits' | 'periods';

interface SubjectColumn {
  id: SubjectColumnId;
  label: string;
  width: number; // ความกว้างคอลัมน์ (ตัวอักษร)
  center?: boolean;
  value: (s: Subject, index: number) => string | number;
}

/** คอลัมน์ทั้งหมดที่เลือกส่งออกได้ (ลำดับในไฟล์ตามลำดับนี้) */
export const SUBJECT_COLUMNS: SubjectColumn[] = [
  { id: 'no', label: 'ลำดับ', width: 7, center: true, value: (_, i) => i + 1 },
  { id: 'code', label: 'รหัสวิชา', width: 11, center: true, value: (s) => s.code },
  { id: 'name', label: 'ชื่อวิชา', width: 32, value: (s) => s.name },
  { id: 'area', label: 'กลุ่มสาระ', width: 26, value: (s) => s.area },
  { id: 'subGroup', label: 'กลุ่มย่อย', width: 14, value: (s) => subGroupOf(s) ?? '' },
  { id: 'type', label: 'ประเภท', width: 18, value: (s) => s.type },
  { id: 'level', label: 'ระดับ', width: 9, center: true, value: (s) => s.level },
  { id: 'credits', label: 'หน่วยกิต', width: 10, center: true, value: (s) => s.credits },
  { id: 'periods', label: 'คาบ/สัปดาห์', width: 12, center: true, value: (s) => s.periods },
];

/** สร้างตาราง (หัวคอลัมน์ + ข้อมูล) ตามคอลัมน์ที่เลือก */
export function subjectExportTable(subjects: Subject[], columnIds: SubjectColumnId[]) {
  const wanted = new Set(columnIds);
  const columns = SUBJECT_COLUMNS.filter((c) => wanted.has(c.id));
  return {
    columns,
    header: columns.map((c) => c.label),
    rows: subjects.map((s, i) => columns.map((c) => c.value(s, i))),
  };
}

const FONT = 'TH Sarabun New';
const SIZE = 16;
const thin = { style: 'thin', color: { rgb: 'FF000000' } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

/** สร้างและดาวน์โหลดไฟล์ Excel ของคลังรายวิชา (เรียงตามลำดับที่ส่งเข้ามา) */
export async function exportSubjectsToExcel(subjects: Subject[], columnIds: SubjectColumnId[], fileName: string): Promise<void> {
  const XLSX = await import('xlsx-js-style');
  const { columns, header, rows } = subjectExportTable(subjects, columnIds);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = columns.map((c) => ({ wch: c.width }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr] || (ws[addr] = { t: 's', v: '' });
      const isHeader = R === 0;
      cell.s = {
        font: { name: FONT, sz: SIZE, bold: isHeader },
        alignment: { vertical: 'center', wrapText: true, horizontal: isHeader || columns[C].center ? 'center' : 'left' },
        border,
        ...(isHeader ? { fill: { patternType: 'solid', fgColor: { rgb: 'FFE8E8E8' } } } : {}),
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'คลังรายวิชา');
  XLSX.writeFile(wb, fileName);
}
