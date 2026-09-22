// ============================================================
// importExcel.ts — นำเข้ารายวิชาจากไฟล์ Excel/CSV
// แยกเป็น 2 ส่วน:
//   1) ตรรกะแปลง/ตรวจสอบแถว (rowsToSubjects) — ทดสอบได้ ไม่พึ่งไฟล์จริง
//   2) ตัวห่ออ่านไฟล์ด้วย SheetJS + สร้างแม่แบบ + ดาวน์โหลด
// ============================================================
// หมายเหตุ: โหลดไลบรารี xlsx แบบ dynamic import เฉพาะตอนใช้งานจริง
// (เปิดแอปครั้งแรกจะเบา ไม่ต้องโหลด xlsx จนกว่าจะกดนำเข้า/ดาวน์โหลดแม่แบบ)
import {
  AREAS,
  type Area,
  type ClassRoom,
  type CompletedCourse,
  type Grade,
  GRADES,
  type Level,
  type Settings,
  type Subject,
  type SubjectType,
  type Teacher,
} from './types';
import { creditsToPeriods } from './calculations';

/** ฟิลด์มาตรฐานของ 1 แถว */
type CanonicalKey = 'code' | 'name' | 'area' | 'type' | 'credits' | 'periods' | 'level';

/** ชื่อหัวคอลัมน์ที่ยอมรับ (ไทย/อังกฤษ หลายแบบ) -> ฟิลด์มาตรฐาน */
const HEADER_ALIASES: Record<CanonicalKey, string[]> = {
  code: ['รหัสวิชา', 'รหัส', 'code', 'subjectcode'],
  name: ['ชื่อวิชา', 'ชื่อ', 'name', 'subjectname'],
  area: ['กลุ่มสาระ', 'กลุ่มสาระการเรียนรู้', 'สาระ', 'area'],
  type: ['ประเภท', 'ประเภทวิชา', 'type'],
  credits: ['หน่วยกิต', 'นก.', 'นก', 'credit', 'credits'],
  periods: ['คาบ/สัปดาห์', 'คาบต่อสัปดาห์', 'คาบ', 'จำนวนคาบ', 'period', 'periods'],
  level: ['ระดับ', 'ระดับชั้น', 'level'],
};

/** หัวคอลัมน์สำหรับแม่แบบ (ลำดับที่แนะนำ) */
export const TEMPLATE_HEADERS = ['รหัสวิชา', 'ชื่อวิชา', 'กลุ่มสาระ', 'ประเภท', 'หน่วยกิต', 'คาบ/สัปดาห์', 'ระดับ'];

function norm(s: unknown): string {
  return String(s ?? '').trim();
}

/** จับคู่ข้อความหัวคอลัมน์กับฟิลด์มาตรฐาน */
function matchHeader(header: string): CanonicalKey | null {
  const h = norm(header).toLowerCase().replace(/\s+/g, '');
  for (const key of Object.keys(HEADER_ALIASES) as CanonicalKey[]) {
    if (HEADER_ALIASES[key].some((a) => a.toLowerCase().replace(/\s+/g, '') === h)) return key;
  }
  return null;
}

/** ตีความกลุ่มสาระให้ตรงกับ 8 กลุ่มมาตรฐาน (ยืดหยุ่นเล็กน้อย) */
function resolveArea(value: string): Area | null {
  const v = norm(value);
  if (!v) return null;
  const exact = AREAS.find((a) => a === v);
  if (exact) return exact;
  // จับคู่แบบหลวม เช่น "วิทยาศาสตร์" -> "วิทยาศาสตร์และเทคโนโลยี", "สังคมศึกษา" -> "สังคมศึกษาฯ"
  const loose = AREAS.find((a) => a.startsWith(v) || v.startsWith(a.replace(/ฯ$/, '')));
  return loose ?? null;
}

function resolveType(value: string): SubjectType | null {
  const v = norm(value);
  if (/พื้น|base|core/i.test(v)) return 'พื้นฐาน';
  if (/เพิ่ม|add|elect/i.test(v)) return 'เพิ่มเติม';
  return null;
}

function resolveLevel(value: string): Level | null {
  const v = norm(value);
  if (/ปลาย|senior|4|5|6/i.test(v)) return 'ม.ปลาย';
  if (/ต้น|junior|1|2|3/i.test(v)) return 'ม.ต้น';
  return null;
}

function toNumber(value: unknown): number | null {
  const v = norm(value).replace(/,/g, '');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface ParsedRow {
  rowNumber: number; // เลขแถวในไฟล์ (นับรวมหัวตาราง)
  data?: Omit<Subject, 'id'>;
  errors: string[];
  isUpdate: boolean; // รหัสซ้ำกับคลังเดิม = จะอัปเดต
}

export interface ParseResult {
  rows: ParsedRow[];
  valid: ParsedRow[];
  invalid: ParsedRow[];
  addCount: number;
  updateCount: number;
  headerError?: string;
}

/**
 * แปลงข้อมูลแบบ array-of-arrays (รวมแถวหัว) เป็นรายวิชา พร้อมตรวจสอบ
 * @param aoa ข้อมูลจากชีต (แถวแรก = หัวตาราง)
 * @param settings ใช้เติมคาบอัตโนมัติเมื่อไม่กรอก
 * @param existingCodes รหัสวิชาที่มีอยู่แล้วในคลัง (ตัวพิมพ์เล็ก) เพื่อบอกว่าเป็นการอัปเดต
 */
export function rowsToSubjects(
  aoa: unknown[][],
  settings: Settings,
  existingCodes: Set<string>,
): ParseResult {
  const rows: ParsedRow[] = [];

  // หาแถวหัวตาราง = แถวแรกที่ไม่ว่าง
  const headerIndex = aoa.findIndex((r) => r.some((c) => norm(c) !== ''));
  if (headerIndex === -1) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไฟล์ว่างเปล่า' };
  }

  const headerRow = aoa[headerIndex];
  const colMap = new Map<CanonicalKey, number>();
  headerRow.forEach((h, i) => {
    const key = matchHeader(String(h));
    if (key && !colMap.has(key)) colMap.set(key, i);
  });

  const required: CanonicalKey[] = ['code', 'name', 'area', 'type', 'level'];
  const missing = required.filter((k) => !colMap.has(k));
  if (missing.length > 0) {
    const thai: Record<CanonicalKey, string> = {
      code: 'รหัสวิชา', name: 'ชื่อวิชา', area: 'กลุ่มสาระ', type: 'ประเภท',
      credits: 'หน่วยกิต', periods: 'คาบ/สัปดาห์', level: 'ระดับ',
    };
    return {
      rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0,
      headerError: `ไม่พบคอลัมน์ที่จำเป็น: ${missing.map((k) => thai[k]).join(', ')}`,
    };
  }

  const get = (row: unknown[], key: CanonicalKey): unknown => {
    const idx = colMap.get(key);
    return idx == null ? '' : row[idx];
  };

  const seenInFile = new Set<string>();

  for (let i = headerIndex + 1; i < aoa.length; i++) {
    const row = aoa[i];
    // ข้ามแถวว่าง
    if (!row || row.every((c) => norm(c) === '')) continue;

    const errors: string[] = [];
    const code = norm(get(row, 'code'));
    const name = norm(get(row, 'name'));
    const area = resolveArea(String(get(row, 'area')));
    const type = resolveType(String(get(row, 'type')));
    const level = resolveLevel(String(get(row, 'level')));
    // หน่วยกิต: ถ้าเว้นว่าง/ไม่มีคอลัมน์ = 0 (เช่น กิจกรรมพัฒนาผู้เรียน) ; ถ้ากรอกค่าผิดถึงจะเตือน
    const creditsRaw = norm(get(row, 'credits'));
    const credits = creditsRaw === '' ? 0 : toNumber(get(row, 'credits'));
    let periods = colMap.has('periods') ? toNumber(get(row, 'periods')) : null;

    if (!code) errors.push('ไม่มีรหัสวิชา');
    if (!name) errors.push('ไม่มีชื่อวิชา');
    if (!area) errors.push(`กลุ่มสาระไม่ถูกต้อง ("${norm(get(row, 'area'))}")`);
    if (!type) errors.push(`ประเภทไม่ถูกต้อง ("${norm(get(row, 'type'))}") ต้องเป็น พื้นฐาน/เพิ่มเติม`);
    if (!level) errors.push(`ระดับไม่ถูกต้อง ("${norm(get(row, 'level'))}") ต้องเป็น ม.ต้น/ม.ปลาย`);
    if (credits == null || credits < 0) errors.push(`หน่วยกิตไม่ถูกต้อง ("${creditsRaw}")`);

    const codeKey = code.toLowerCase();
    if (code && seenInFile.has(codeKey)) errors.push('รหัสวิชาซ้ำกันภายในไฟล์');
    if (code) seenInFile.add(codeKey);

    if (errors.length > 0) {
      rows.push({ rowNumber: i + 1, errors, isUpdate: false });
      continue;
    }

    // เติมคาบอัตโนมัติถ้าไม่ได้กรอก
    if (periods == null) periods = creditsToPeriods(credits as number, settings);

    rows.push({
      rowNumber: i + 1,
      data: {
        code,
        name,
        area: area as Area,
        type: type as SubjectType,
        credits: credits as number,
        periods,
        level: level as Level,
      },
      errors: [],
      isUpdate: existingCodes.has(codeKey),
    });
  }

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);
  return {
    rows,
    valid,
    invalid,
    addCount: valid.filter((r) => !r.isUpdate).length,
    updateCount: valid.filter((r) => r.isUpdate).length,
  };
}

// ---------- ส่วนที่ทำงานกับไฟล์จริง (ใช้ SheetJS) ----------

/** อ่านไฟล์ Excel/CSV ที่ผู้ใช้เลือก แล้วแปลงเป็น ParseResult */
export async function parseSubjectFile(
  file: File,
  settings: Settings,
  existingCodes: Set<string>,
): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไม่พบชีตข้อมูลในไฟล์' };
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  return rowsToSubjects(aoa, settings, existingCodes);
}

/** สร้างและดาวน์โหลดไฟล์แม่แบบ Excel พร้อมตัวอย่างและชีตคำอธิบาย */
export async function downloadTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const example = [
    ['ค21101', 'คณิตศาสตร์ 1', 'คณิตศาสตร์', 'พื้นฐาน', 1.5, 3, 'ม.ต้น'],
    ['ว31201', 'ฟิสิกส์ 1', 'วิทยาศาสตร์และเทคโนโลยี', 'เพิ่มเติม', 1.5, 3, 'ม.ปลาย'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...example]);
  ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];

  const help = XLSX.utils.aoa_to_sheet([
    ['คำอธิบายการกรอก'],
    [''],
    ['คอลัมน์', 'คำอธิบาย', 'ค่าที่ใช้ได้'],
    ['รหัสวิชา', 'รหัสประจำวิชา (ห้ามซ้ำ; ถ้าซ้ำกับที่มีอยู่จะอัปเดตทับ)', 'เช่น ค21101'],
    ['ชื่อวิชา', 'ชื่อรายวิชา', 'ข้อความ'],
    ['กลุ่มสาระ', '1 ใน 8 กลุ่มสาระ + กิจกรรมพัฒนาผู้เรียน', AREAS.join(' / ')],
    ['ประเภท', 'ประเภทวิชา', 'พื้นฐาน / เพิ่มเติม'],
    ['หน่วยกิต', 'จำนวนหน่วยกิต (เว้นว่างได้ = 0 เช่น กิจกรรมพัฒนาผู้เรียน)', 'ตัวเลข เช่น 0, 0.5, 1, 1.5'],
    ['คาบ/สัปดาห์', 'คาบต่อสัปดาห์ (เว้นว่างได้ = คำนวณจากหน่วยกิตให้อัตโนมัติ)', 'ตัวเลข'],
    ['ระดับ', 'ระดับชั้น', 'ม.ต้น / ม.ปลาย'],
  ]);
  help['!cols'] = [{ wch: 14 }, { wch: 52 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายวิชา');
  XLSX.utils.book_append_sheet(wb, help, 'คำอธิบาย');
  XLSX.writeFile(wb, 'แม่แบบนำเข้ารายวิชา.xlsx');
}

// ============================================================
// นำเข้ารายชื่อครู
// ============================================================

type TeacherKey = 'name' | 'area';

const TEACHER_HEADER_ALIASES: Record<TeacherKey, string[]> = {
  name: ['ชื่อ-สกุล', 'ชื่อ-นามสกุล', 'ชื่อครู', 'ชื่อ', 'name', 'teacher'],
  area: ['กลุ่มสาระ', 'กลุ่มสาระการเรียนรู้', 'สาระ', 'area'],
};

export const TEACHER_TEMPLATE_HEADERS = ['ชื่อ-สกุล', 'กลุ่มสาระ'];

function matchTeacherHeader(header: string): TeacherKey | null {
  const h = norm(header).toLowerCase().replace(/\s+/g, '');
  for (const key of Object.keys(TEACHER_HEADER_ALIASES) as TeacherKey[]) {
    if (TEACHER_HEADER_ALIASES[key].some((a) => a.toLowerCase().replace(/\s+/g, '') === h)) return key;
  }
  return null;
}

export interface ParsedTeacherRow {
  rowNumber: number;
  data?: Omit<Teacher, 'id'>;
  errors: string[];
  isUpdate: boolean; // ชื่อซ้ำกับรายชื่อเดิม = จะอัปเดต
}

export interface TeacherParseResult {
  rows: ParsedTeacherRow[];
  valid: ParsedTeacherRow[];
  invalid: ParsedTeacherRow[];
  addCount: number;
  updateCount: number;
  headerError?: string;
}

/**
 * แปลงข้อมูล array-of-arrays เป็นรายชื่อครู พร้อมตรวจสอบ
 * @param existingNames ชื่อครูที่มีอยู่แล้ว (ตัวพิมพ์เล็ก, trim) เพื่อบอกว่าเป็นการอัปเดต
 */
export function rowsToTeachers(aoa: unknown[][], existingNames: Set<string>): TeacherParseResult {
  const rows: ParsedTeacherRow[] = [];

  const headerIndex = aoa.findIndex((r) => r.some((c) => norm(c) !== ''));
  if (headerIndex === -1) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไฟล์ว่างเปล่า' };
  }

  const headerRow = aoa[headerIndex];
  const colMap = new Map<TeacherKey, number>();
  headerRow.forEach((h, i) => {
    const key = matchTeacherHeader(String(h));
    if (key && !colMap.has(key)) colMap.set(key, i);
  });

  if (!colMap.has('name')) {
    return {
      rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0,
      headerError: 'ไม่พบคอลัมน์ที่จำเป็น: ชื่อ-สกุล',
    };
  }

  const get = (row: unknown[], key: TeacherKey): unknown => {
    const idx = colMap.get(key);
    return idx == null ? '' : row[idx];
  };

  const seenInFile = new Set<string>();

  for (let i = headerIndex + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.every((c) => norm(c) === '')) continue;

    const errors: string[] = [];
    const name = norm(get(row, 'name'));
    const areaRaw = norm(get(row, 'area'));
    const area = areaRaw ? resolveArea(areaRaw) : undefined;

    if (!name) errors.push('ไม่มีชื่อครู');
    if (areaRaw && !area) errors.push(`กลุ่มสาระไม่ถูกต้อง ("${areaRaw}")`);

    const nameKey = name.toLowerCase();
    if (name && seenInFile.has(nameKey)) errors.push('ชื่อครูซ้ำกันภายในไฟล์');
    if (name) seenInFile.add(nameKey);

    if (errors.length > 0) {
      rows.push({ rowNumber: i + 1, errors, isUpdate: false });
      continue;
    }

    rows.push({
      rowNumber: i + 1,
      data: { name, area: area ?? undefined },
      errors: [],
      isUpdate: existingNames.has(nameKey),
    });
  }

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);
  return {
    rows,
    valid,
    invalid,
    addCount: valid.filter((r) => !r.isUpdate).length,
    updateCount: valid.filter((r) => r.isUpdate).length,
  };
}

/** อ่านไฟล์ Excel/CSV รายชื่อครู แล้วแปลงเป็น TeacherParseResult */
export async function parseTeacherFile(file: File, existingNames: Set<string>): Promise<TeacherParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไม่พบชีตข้อมูลในไฟล์' };
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  return rowsToTeachers(aoa, existingNames);
}

/** สร้างและดาวน์โหลดแม่แบบ Excel รายชื่อครู */
export async function downloadTeacherTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const example = [
    ['นายสมชาย ใจดี', 'คณิตศาสตร์'],
    ['นางสาวสมหญิง เก่งกล้า', 'ภาษาต่างประเทศ'],
    ['นายเอกชัย รักเรียน', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([TEACHER_TEMPLATE_HEADERS, ...example]);
  ws['!cols'] = [{ wch: 28 }, { wch: 26 }];

  const help = XLSX.utils.aoa_to_sheet([
    ['คำอธิบายการกรอก'],
    [''],
    ['คอลัมน์', 'คำอธิบาย', 'ค่าที่ใช้ได้'],
    ['ชื่อ-สกุล', 'ชื่อ-นามสกุลครู (ห้ามซ้ำ; ถ้าซ้ำกับที่มีอยู่จะอัปเดตทับ)', 'ข้อความ'],
    ['กลุ่มสาระ', 'กลุ่มสาระที่สังกัด (เว้นว่างได้)', AREAS.join(' / ')],
  ]);
  help['!cols'] = [{ wch: 14 }, { wch: 52 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อครู');
  XLSX.utils.book_append_sheet(wb, help, 'คำอธิบาย');
  XLSX.writeFile(wb, 'แม่แบบนำเข้ารายชื่อครู.xlsx');
}

// ============================================================
// นำเข้าห้องเรียน
// ============================================================

type ClassKey = 'grade' | 'section' | 'plan' | 'students' | 'cohort';

const CLASS_HEADER_ALIASES: Record<ClassKey, string[]> = {
  grade: ['ระดับชั้น', 'ระดับ', 'ชั้น', 'grade'],
  section: ['ห้อง', 'ห้องเรียน', 'section', 'room'],
  plan: ['แผนการเรียน/กลุ่มการเรียน', 'แผนการเรียน', 'กลุ่มการเรียน', 'แผน/กลุ่ม', 'แผน', 'กลุ่ม', 'plan', 'track'],
  students: ['จำนวนนักเรียน', 'จำนวน', 'นักเรียน', 'students'],
  cohort: ['รุ่น', 'cohort'],
};

export const CLASS_TEMPLATE_HEADERS = ['ระดับชั้น', 'ห้อง', 'แผนการเรียน/กลุ่มการเรียน', 'รุ่น', 'จำนวนนักเรียน'];

function matchClassHeader(header: string): ClassKey | null {
  const h = norm(header).toLowerCase().replace(/\s+/g, '');
  for (const key of Object.keys(CLASS_HEADER_ALIASES) as ClassKey[]) {
    if (CLASS_HEADER_ALIASES[key].some((a) => a.toLowerCase().replace(/\s+/g, '') === h)) return key;
  }
  return null;
}

/** ตีความระดับชั้นให้เป็น ม.1..ม.6 (รับ "ม.1", "1", "มัธยม 4" ฯลฯ) */
function resolveGrade(value: string): Grade | null {
  const s = norm(value);
  if (!s) return null;
  const exact = GRADES.find((g) => g === s);
  if (exact) return exact;
  const m = s.match(/[1-6]/);
  return m ? (`ม.${m[0]}` as Grade) : null;
}

/** คีย์ระบุห้องซ้ำ = ระดับชั้น + ห้อง + รุ่น */
export function classKey(grade: string, section: string, cohort: string): string {
  return `${norm(grade)}/${norm(section).toLowerCase()}#${norm(cohort)}`;
}

export interface ParsedClassRow {
  rowNumber: number;
  data?: Omit<ClassRoom, 'id'>;
  errors: string[];
  isUpdate: boolean;
}

export interface ClassParseResult {
  rows: ParsedClassRow[];
  valid: ParsedClassRow[];
  invalid: ParsedClassRow[];
  addCount: number;
  updateCount: number;
  headerError?: string;
}

/**
 * แปลงข้อมูล array-of-arrays เป็นห้องเรียน พร้อมตรวจสอบ
 * @param existingKeys คีย์ห้องที่มีอยู่แล้ว (ดู classKey) เพื่อบอกว่าเป็นการอัปเดต
 */
export function rowsToClasses(aoa: unknown[][], existingKeys: Set<string>): ClassParseResult {
  const rows: ParsedClassRow[] = [];

  const headerIndex = aoa.findIndex((r) => r.some((c) => norm(c) !== ''));
  if (headerIndex === -1) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไฟล์ว่างเปล่า' };
  }

  const headerRow = aoa[headerIndex];
  const colMap = new Map<ClassKey, number>();
  headerRow.forEach((h, i) => {
    const key = matchClassHeader(String(h));
    if (key && !colMap.has(key)) colMap.set(key, i);
  });

  const missing = (['grade', 'section'] as ClassKey[]).filter((k) => !colMap.has(k));
  if (missing.length > 0) {
    const thai: Record<ClassKey, string> = {
      grade: 'ระดับชั้น', section: 'ห้อง', plan: 'แผน/กลุ่ม', students: 'จำนวนนักเรียน', cohort: 'รุ่น',
    };
    return {
      rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0,
      headerError: `ไม่พบคอลัมน์ที่จำเป็น: ${missing.map((k) => thai[k]).join(', ')}`,
    };
  }

  const get = (row: unknown[], key: ClassKey): unknown => {
    const idx = colMap.get(key);
    return idx == null ? '' : row[idx];
  };

  const seenInFile = new Set<string>();

  for (let i = headerIndex + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.every((c) => norm(c) === '')) continue;

    const errors: string[] = [];
    const grade = resolveGrade(String(get(row, 'grade')));
    const section = norm(get(row, 'section'));
    const plan = norm(get(row, 'plan'));
    const cohort = norm(get(row, 'cohort'));
    const studentsRaw = colMap.has('students') ? toNumber(get(row, 'students')) : null;

    if (!grade) errors.push(`ระดับชั้นไม่ถูกต้อง ("${norm(get(row, 'grade'))}") ต้องเป็น ม.1–ม.6`);
    if (!section) errors.push('ไม่มีห้อง');

    const key = grade ? classKey(grade, section, cohort) : '';
    if (grade && section && seenInFile.has(key)) errors.push('ห้อง+รุ่นซ้ำกันภายในไฟล์');
    if (key) seenInFile.add(key);

    if (errors.length > 0) {
      rows.push({ rowNumber: i + 1, errors, isUpdate: false });
      continue;
    }

    rows.push({
      rowNumber: i + 1,
      data: {
        grade: grade as Grade,
        section,
        plan,
        cohort,
        students: studentsRaw != null && studentsRaw >= 0 ? studentsRaw : 0,
      },
      errors: [],
      isUpdate: existingKeys.has(key),
    });
  }

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);
  return {
    rows,
    valid,
    invalid,
    addCount: valid.filter((r) => !r.isUpdate).length,
    updateCount: valid.filter((r) => r.isUpdate).length,
  };
}

/** อ่านไฟล์ Excel/CSV ห้องเรียน แล้วแปลงเป็น ClassParseResult */
export async function parseClassFile(file: File, existingKeys: Set<string>): Promise<ClassParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไม่พบชีตข้อมูลในไฟล์' };
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  return rowsToClasses(aoa, existingKeys);
}

/** สร้างและดาวน์โหลดแม่แบบ Excel ห้องเรียน */
export async function downloadClassTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const example = [
    ['ม.1', '1', 'ทั่วไป', '69', 40],
    ['ม.1', '2', 'ห้องเรียนพิเศษ (Gifted)', '69', 30],
    ['ม.4', '1', 'วิทย์-คณิต', '66', 36],
  ];
  const ws = XLSX.utils.aoa_to_sheet([CLASS_TEMPLATE_HEADERS, ...example]);
  ws['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 26 }, { wch: 8 }, { wch: 14 }];

  const help = XLSX.utils.aoa_to_sheet([
    ['คำอธิบายการกรอก'],
    [''],
    ['คอลัมน์', 'คำอธิบาย', 'ค่าที่ใช้ได้'],
    ['ระดับชั้น', 'ระดับชั้นของห้อง', 'ม.1 / ม.2 / ม.3 / ม.4 / ม.5 / ม.6 (หรือใส่เลข 1–6)'],
    ['ห้อง', 'ชื่อห้อง', 'เช่น 1, 2/EP'],
    ['แผนการเรียน/กลุ่มการเรียน', 'ม.ปลาย=แผนการเรียน, ม.ต้น=กลุ่มการเรียน (เว้นว่างได้; ค่าใหม่จะถูกเพิ่มเข้ารายการให้เลือกอัตโนมัติ)', 'เช่น วิทย์-คณิต, ทั่วไป'],
    ['รุ่น', 'รุ่น/หลักสูตรปี (เว้นว่างได้)', 'เช่น 69'],
    ['จำนวนนักเรียน', 'จำนวนนักเรียน (เว้นว่าง = 0)', 'ตัวเลข'],
  ]);
  help['!cols'] = [{ wch: 22 }, { wch: 60 }, { wch: 44 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ห้องเรียน');
  XLSX.utils.book_append_sheet(wb, help, 'คำอธิบาย');
  XLSX.writeFile(wb, 'แม่แบบนำเข้าห้องเรียน.xlsx');
}

// ============================================================
// นำเข้าหน่วยกิตเดิม (วิชาที่เรียนจบแล้ว) — ต้องระบุห้องเพื่อจับคู่
// ============================================================

type CompletedKey = 'grade' | 'section' | 'cohort' | 'code' | 'name' | 'credits' | 'type' | 'group' | 'note';

const COMPLETED_HEADER_ALIASES: Record<CompletedKey, string[]> = {
  grade: ['ระดับชั้น', 'ระดับ', 'ชั้น', 'grade'],
  section: ['ห้อง', 'ห้องเรียน', 'section'],
  cohort: ['รุ่น', 'cohort'],
  code: ['รหัสวิชา', 'รหัส', 'code'],
  name: ['ชื่อวิชา', 'ชื่อ', 'name'],
  credits: ['หน่วยกิต', 'นก.', 'นก', 'credits', 'credit'],
  type: ['ประเภท', 'type'],
  group: ['กลุ่มเลือก', 'กลุ่ม', 'group'],
  note: ['หมายเหตุ', 'note', 'ปีการศึกษา', 'ภาคเรียน'],
};

export const COMPLETED_TEMPLATE_HEADERS = ['ระดับชั้น', 'ห้อง', 'รุ่น', 'รหัสวิชา', 'ชื่อวิชา', 'หน่วยกิต', 'ประเภท', 'กลุ่มเลือก', 'หมายเหตุ'];

function matchCompletedHeader(header: string): CompletedKey | null {
  const h = norm(header).toLowerCase().replace(/\s+/g, '');
  for (const key of Object.keys(COMPLETED_HEADER_ALIASES) as CompletedKey[]) {
    if (COMPLETED_HEADER_ALIASES[key].some((a) => a.toLowerCase().replace(/\s+/g, '') === h)) return key;
  }
  return null;
}

export interface ParsedCompletedRow {
  rowNumber: number;
  data?: Omit<CompletedCourse, 'id'>; // classId ถูก resolve แล้ว
  classLabel?: string;
  errors: string[];
  isUpdate: boolean;
}

export interface CompletedParseResult {
  rows: ParsedCompletedRow[];
  valid: ParsedCompletedRow[];
  invalid: ParsedCompletedRow[];
  addCount: number;
  updateCount: number;
  headerError?: string;
}

type ClassRef = { id: string; grade: string; section: string; cohort: string };

/**
 * แปลงข้อมูล array-of-arrays เป็นหน่วยกิตเดิม พร้อมจับคู่ห้องและตรวจสอบ
 * @param classes ห้องที่มีอยู่ (เพื่อจับคู่ ระดับชั้น+ห้อง+รุ่น -> classId)
 * @param existingKeys คีย์ `${classId}::${code}` ที่มีอยู่แล้ว เพื่อบอกว่าเป็นการอัปเดต
 */
export function rowsToCompleted(
  aoa: unknown[][],
  classes: ClassRef[],
  existingKeys: Set<string>,
): CompletedParseResult {
  const rows: ParsedCompletedRow[] = [];

  const headerIndex = aoa.findIndex((r) => r.some((c) => norm(c) !== ''));
  if (headerIndex === -1) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไฟล์ว่างเปล่า' };
  }
  const headerRow = aoa[headerIndex];
  const colMap = new Map<CompletedKey, number>();
  headerRow.forEach((h, i) => {
    const key = matchCompletedHeader(String(h));
    if (key && !colMap.has(key)) colMap.set(key, i);
  });

  const required: CompletedKey[] = ['grade', 'section', 'code', 'name', 'credits', 'type'];
  const missing = required.filter((k) => !colMap.has(k));
  if (missing.length > 0) {
    const thai: Record<CompletedKey, string> = {
      grade: 'ระดับชั้น', section: 'ห้อง', cohort: 'รุ่น', code: 'รหัสวิชา', name: 'ชื่อวิชา',
      credits: 'หน่วยกิต', type: 'ประเภท', group: 'กลุ่มเลือก', note: 'หมายเหตุ',
    };
    return {
      rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0,
      headerError: `ไม่พบคอลัมน์ที่จำเป็น: ${missing.map((k) => thai[k]).join(', ')}`,
    };
  }

  // ตารางค้นหาห้อง
  const exact = new Map<string, ClassRef>();
  const byGradeSection = new Map<string, ClassRef[]>();
  for (const c of classes) {
    exact.set(classKey(c.grade, c.section, c.cohort), c);
    const gk = `${norm(c.grade)}/${norm(c.section).toLowerCase()}`;
    (byGradeSection.get(gk) ?? byGradeSection.set(gk, []).get(gk)!).push(c);
  }

  const get = (row: unknown[], key: CompletedKey): unknown => {
    const idx = colMap.get(key);
    return idx == null ? '' : row[idx];
  };
  const seenInFile = new Set<string>();

  for (let i = headerIndex + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.every((c) => norm(c) === '')) continue;

    const errors: string[] = [];
    const grade = resolveGrade(String(get(row, 'grade')));
    const section = norm(get(row, 'section'));
    const cohort = norm(get(row, 'cohort'));
    const code = norm(get(row, 'code'));
    const name = norm(get(row, 'name'));
    const credits = toNumber(get(row, 'credits'));
    const type = resolveType(String(get(row, 'type')));
    const group = norm(get(row, 'group'));
    const note = norm(get(row, 'note'));

    // จับคู่ห้อง
    let cls: ClassRef | undefined;
    if (grade && section) {
      cls = exact.get(classKey(grade, section, cohort));
      if (!cls && !cohort) {
        const arr = byGradeSection.get(`${grade}/${section.toLowerCase()}`) ?? [];
        if (arr.length === 1) cls = arr[0];
        else if (arr.length > 1) errors.push(`ห้อง ${grade}/${section} มีหลายรุ่น กรุณาระบุคอลัมน์รุ่น`);
      }
    }

    if (!grade) errors.push(`ระดับชั้นไม่ถูกต้อง ("${norm(get(row, 'grade'))}")`);
    if (!section) errors.push('ไม่มีห้อง');
    if (grade && section && !cls && errors.length === 0) {
      errors.push(`ไม่พบห้อง ${grade}/${section}${cohort ? ` รุ่น ${cohort}` : ''} ในระบบ (สร้างห้องก่อน)`);
    }
    if (!code) errors.push('ไม่มีรหัสวิชา');
    if (!name) errors.push('ไม่มีชื่อวิชา');
    if (credits == null || credits < 0) errors.push('หน่วยกิตไม่ถูกต้อง');
    if (!type) errors.push(`ประเภทไม่ถูกต้อง ("${norm(get(row, 'type'))}") ต้องเป็น พื้นฐาน/เพิ่มเติม`);

    if (cls && code) {
      const dupKey = `${cls.id}::${code.toLowerCase()}`;
      if (seenInFile.has(dupKey)) errors.push('วิชาซ้ำในห้องเดียวกันภายในไฟล์');
      seenInFile.add(dupKey);
    }

    if (errors.length > 0) {
      rows.push({ rowNumber: i + 1, errors, isUpdate: false });
      continue;
    }

    const classId = cls!.id;
    rows.push({
      rowNumber: i + 1,
      classLabel: `${grade}/${section}${cohort ? ` รุ่น ${cohort}` : ''}`,
      data: {
        classId,
        code,
        name,
        credits: credits as number,
        type: type as SubjectType,
        group: group || undefined,
        note: note || undefined,
      },
      errors: [],
      isUpdate: existingKeys.has(`${classId}::${code.toLowerCase()}`),
    });
  }

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);
  return {
    rows,
    valid,
    invalid,
    addCount: valid.filter((r) => !r.isUpdate).length,
    updateCount: valid.filter((r) => r.isUpdate).length,
  };
}

/** อ่านไฟล์ Excel/CSV หน่วยกิตเดิม แล้วแปลงเป็น CompletedParseResult */
export async function parseCompletedFile(file: File, classes: ClassRef[], existingKeys: Set<string>): Promise<CompletedParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { rows: [], valid: [], invalid: [], addCount: 0, updateCount: 0, headerError: 'ไม่พบชีตข้อมูลในไฟล์' };
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  return rowsToCompleted(aoa, classes, existingKeys);
}

/** สร้างและดาวน์โหลดแม่แบบ Excel หน่วยกิตเดิม */
export async function downloadCompletedTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const example = [
    ['ม.5', '1', '66', 'ค31101', 'คณิตศาสตร์ 1', 1.0, 'พื้นฐาน', '', 'ม.4 ภาค 1/2566'],
    ['ม.5', '1', '66', 'ว31201', 'ฟิสิกส์ 1', 1.5, 'เพิ่มเติม', 'วิทย์-คณิต', 'ม.4 ภาค 1/2566'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([COMPLETED_TEMPLATE_HEADERS, ...example]);
  ws['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 22 }];

  const help = XLSX.utils.aoa_to_sheet([
    ['คำอธิบายการกรอก'],
    [''],
    ['คอลัมน์', 'คำอธิบาย'],
    ['ระดับชั้น / ห้อง / รุ่น', 'ใช้ระบุห้องที่วิชานี้นับให้ — ต้องตรงกับห้องที่มีในระบบ (รุ่นช่วยแยกห้องชื่อซ้ำข้ามปี)'],
    ['รหัสวิชา / ชื่อวิชา', 'รหัสและชื่อวิชาที่เรียนจบแล้ว'],
    ['หน่วยกิต', 'จำนวนหน่วยกิต'],
    ['ประเภท', 'พื้นฐาน / เพิ่มเติม'],
    ['กลุ่มเลือก', '(ถ้ามี) กลุ่มเลือกภายในห้อง เช่น วิทย์-คณิต, ภาษาจีน — เว้นว่างถ้าเรียนร่วมทั้งห้อง'],
    ['หมายเหตุ', 'เช่น ปี/ภาคเรียนที่เรียน'],
  ]);
  help['!cols'] = [{ wch: 22 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'หน่วยกิตเดิม');
  XLSX.utils.book_append_sheet(wb, help, 'คำอธิบาย');
  XLSX.writeFile(wb, 'แม่แบบนำเข้าหน่วยกิตเดิม.xlsx');
}
