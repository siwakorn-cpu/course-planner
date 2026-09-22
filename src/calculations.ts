// ============================================================
// calculations.ts — ตรรกะการคำนวณล้วน (ไม่พึ่ง React/DOM)
// ทดสอบได้ด้วย vitest (ดู calculations.test.ts)
// ============================================================
import {
  AREAS,
  type Area,
  type ClassRoom,
  type CompletedCourse,
  type CreditRecord,
  type Level,
  type Offering,
  type Semester,
  type Settings,
  type Subject,
  type SubjectType,
  type Teacher,
  gradeToLevel,
} from './types';

/** ตัวเลือกช่วงภาคเรียนสำหรับการดูภาระงาน */
export type SemesterFilter = Semester | 'ปี';

// ---------- ตัวช่วยพื้นฐาน ----------

/** แปลงหน่วยกิต -> คาบ/สัปดาห์ (ตามค่าตั้งค่า) */
export function creditsToPeriods(credits: number, settings: Settings): number {
  return credits * settings.periodsPerCredit;
}

/** แปลงคาบ/สัปดาห์ -> หน่วยกิต */
export function periodsToCredits(periods: number, settings: Settings): number {
  if (settings.periodsPerCredit === 0) return 0;
  return periods / settings.periodsPerCredit;
}

/** คาบจริงของ Offering หนึ่งรายการ = override ถ้ามี ไม่งั้นใช้ค่ามาตรฐานของวิชา */
export function offeringPeriods(offering: Offering, subject: Subject): number {
  return offering.periods ?? subject.periods;
}

/** สร้าง map ค้นหาวิชาจาก id ได้เร็ว */
export function subjectMap(subjects: Subject[]): Map<string, Subject> {
  return new Map(subjects.map((s) => [s.id, s]));
}

// ---------- สรุปหน่วยกิตของห้อง ----------

export interface CreditSummary {
  basic: number; // หน่วยกิตพื้นฐาน
  additional: number; // หน่วยกิตเพิ่มเติม
  total: number; // รวม
}

/**
 * รวมหน่วยกิตของ Offering ในห้องหนึ่ง (นับทั้งปี ทุกภาคเรียน) แยกพื้นฐาน/เพิ่มเติม/รวม
 * @param group ตัวกรองกลุ่มเลือก:
 *   - undefined = รวมทุกวิชาในห้อง (ทุกกลุ่ม) — ใช้ดูภาพรวม/นับคาบ
 *   - '' = เฉพาะวิชาที่เรียนร่วมทั้งห้อง (ไม่อยู่กลุ่มเลือกใด)
 *   - 'ชื่อกลุ่ม' = วิชาร่วม + วิชาของกลุ่มนั้น (= หน่วยกิตจริงของนักเรียนในกลุ่มนี้)
 */
export function classCredits(
  classId: string,
  offerings: Offering[],
  subjects: Subject[],
  group?: string,
): CreditSummary {
  const sMap = subjectMap(subjects);
  const summary: CreditSummary = { basic: 0, additional: 0, total: 0 };
  for (const off of offerings) {
    if (off.classId !== classId) continue;
    const g = off.group?.trim() ?? '';
    if (group !== undefined && g !== '' && g !== group) continue;
    const subj = sMap.get(off.subjectId);
    if (!subj) continue;
    if (subj.type === 'พื้นฐาน') summary.basic += subj.credits;
    else if (subj.type === 'เพิ่มเติม') summary.additional += subj.credits;
    // กิจกรรมพัฒนาผู้เรียนไม่นับเป็นหน่วยกิตพื้นฐาน/เพิ่มเติม
    if (subj.type !== 'กิจกรรมพัฒนาผู้เรียน') summary.total += subj.credits;
  }
  return summary;
}

/** รวมหน่วยกิตจากรายการ CreditRecord (กรองตามกลุ่มเลือกได้ เหมือน classCredits) */
export function sumCreditRecords(records: CreditRecord[], group?: string): CreditSummary {
  const summary: CreditSummary = { basic: 0, additional: 0, total: 0 };
  for (const r of records) {
    const g = r.group?.trim() ?? '';
    if (group !== undefined && g !== '' && g !== group) continue;
    if (r.type === 'พื้นฐาน') summary.basic += r.credits;
    else if (r.type === 'เพิ่มเติม') summary.additional += r.credits;
    if (r.type !== 'กิจกรรมพัฒนาผู้เรียน') summary.total += r.credits;
  }
  return summary;
}

/** รวมหน่วยกิตที่เรียนจบแล้ว (สะสมเดิม) ของห้องหนึ่ง แยกพื้นฐาน/เพิ่มเติม/รวม */
export function completedCredits(classId: string, completed: CompletedCourse[], group?: string): CreditSummary {
  return sumCreditRecords(completed.filter((c) => c.classId === classId), group);
}

/** หน่วยกิตสะสมรวม = เรียนจบแล้ว (เดิม) + ที่กำลังจัดในระบบ */
export function cumulativeCredits(
  classId: string,
  offerings: Offering[],
  subjects: Subject[],
  completed: CompletedCourse[],
  group?: string,
): CreditSummary {
  const a = completedCredits(classId, completed, group);
  const b = classCredits(classId, offerings, subjects, group);
  return { basic: a.basic + b.basic, additional: a.additional + b.additional, total: a.total + b.total };
}

/**
 * แตก "กลุ่มย่อย" อัตโนมัติจากชื่อห้องรวม
 * เช่น ม.5 ห้อง "5,6,7" -> ["5/5","5/6","5/7"] ; ห้องเดี่ยว "1" -> [] (ไม่ใช่ห้องรวม)
 */
export function subRoomGroups(c: ClassRoom): string[] {
  const gradeNum = c.grade.replace('ม.', '');
  let tokens: string[] = [];
  if (c.section.includes(',')) {
    tokens = c.section.split(',').map((t) => t.trim()).filter(Boolean);
  } else if (/^\s*\d+(\s*[/ ]\s*\d+)+\s*$/.test(c.section)) {
    tokens = c.section.split(/[/ ]+/).map((t) => t.trim()).filter(Boolean);
  }
  if (tokens.length <= 1) return [];
  return tokens.map((t) => `${gradeNum}/${t}`);
}

/** 1 บรรทัดรายวิชา (สำหรับแสดงรายวิชาสะสมของห้อง/กลุ่ม) */
export interface CourseLine {
  code: string;
  name: string;
  credits: number;
  type: SubjectType;
  group?: string;
  source: 'เดิม' | 'ปีนี้';
  note?: string;
}

/**
 * รายวิชาทั้งหมดที่ห้อง/กลุ่มเรียน (หน่วยกิตเดิม + ที่กำลังจัด)
 * @param group '' = เฉพาะวิชาร่วม, 'ชื่อกลุ่ม' = วิชาร่วม + ของกลุ่มนั้น, undefined = ทุกวิชา
 */
export function coursesForClass(
  classId: string,
  offerings: Offering[],
  subjects: Subject[],
  completed: CompletedCourse[],
  group?: string,
): CourseLine[] {
  const sMap = subjectMap(subjects);
  const inGroup = (g?: string) => {
    const gg = g?.trim() ?? '';
    return group === undefined || gg === '' || gg === group;
  };
  const lines: CourseLine[] = [];
  for (const c of completed) {
    if (c.classId !== classId || !inGroup(c.group)) continue;
    lines.push({ code: c.code, name: c.name, credits: c.credits, type: c.type, group: c.group, source: 'เดิม', note: c.note });
  }
  for (const o of offerings) {
    if (o.classId !== classId || !inGroup(o.group)) continue;
    const s = sMap.get(o.subjectId);
    if (!s) continue;
    lines.push({ code: s.code, name: s.name, credits: s.credits, type: s.type, group: o.group, source: 'ปีนี้' });
  }
  return lines;
}

/** รายชื่อกลุ่มเลือกจากทั้งหน่วยกิตเดิมและการจัดสอนปัจจุบันของห้อง */
export function allGroupsForClass(classId: string, offerings: Offering[], completed: CompletedCourse[]): string[] {
  const set = new Set<string>();
  for (const o of offerings) if (o.classId === classId && o.group?.trim()) set.add(o.group.trim());
  for (const c of completed) if (c.classId === classId && c.group?.trim()) set.add(c.group.trim());
  return [...set].sort((a, b) => a.localeCompare(b, 'th'));
}

/** รายชื่อกลุ่มเลือกภายในห้อง (เฉพาะที่ไม่ว่าง) เรียงตามตัวอักษร */
export function classElectiveGroups(classId: string, offerings: Offering[]): string[] {
  const set = new Set<string>();
  for (const off of offerings) {
    if (off.classId !== classId) continue;
    const g = off.group?.trim();
    if (g) set.add(g);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'th'));
}

// ---------- เทียบเกณฑ์การจบ ----------

export type ReqState = 'ครบ' | 'ยังไม่ครบ' | 'เกิน';

export interface CheckItem {
  label: string; // ชื่อรายการ เช่น "หน่วยกิตพื้นฐาน"
  value: number; // ค่าที่ทำได้
  target: number; // เกณฑ์
  kind: 'min' | 'max'; // เป็นเกณฑ์ขั้นต่ำ หรือ เพดานสูงสุด
  state: ReqState;
  percent: number; // ความคืบหน้าเทียบเกณฑ์ (0..100+)
}

function evalMin(value: number, target: number): ReqState {
  if (target <= 0) return 'ครบ';
  return value >= target ? 'ครบ' : 'ยังไม่ครบ';
}

function evalMax(value: number, target: number): ReqState {
  if (target <= 0) return 'ครบ';
  return value > target ? 'เกิน' : 'ครบ';
}

function pct(value: number, target: number): number {
  if (target <= 0) return 100;
  return Math.round((value / target) * 100);
}

/**
 * ประเมินหน่วยกิตของห้องเทียบเกณฑ์การจบตามระดับ
 * คืนรายการตรวจสอบทีละข้อ พร้อมสถานะ
 */
export function evaluateRequirements(
  summary: CreditSummary,
  level: Level,
  settings: Settings,
): CheckItem[] {
  const req = settings.requirements[level];
  const items: CheckItem[] = [];

  items.push({
    label: 'หน่วยกิตพื้นฐาน',
    value: summary.basic,
    target: req.basic,
    kind: 'min',
    state: evalMin(summary.basic, req.basic),
    percent: pct(summary.basic, req.basic),
  });

  if (req.additionalMin > 0) {
    items.push({
      label: 'หน่วยกิตเพิ่มเติม',
      value: summary.additional,
      target: req.additionalMin,
      kind: 'min',
      state: evalMin(summary.additional, req.additionalMin),
      percent: pct(summary.additional, req.additionalMin),
    });
  }

  if (req.totalMin > 0) {
    items.push({
      label: 'หน่วยกิตรวม (ขั้นต่ำ)',
      value: summary.total,
      target: req.totalMin,
      kind: 'min',
      state: evalMin(summary.total, req.totalMin),
      percent: pct(summary.total, req.totalMin),
    });
  }

  if (req.totalMax > 0) {
    items.push({
      label: 'หน่วยกิตรวม (ไม่เกิน)',
      value: summary.total,
      target: req.totalMax,
      kind: 'max',
      state: evalMax(summary.total, req.totalMax),
      percent: pct(summary.total, req.totalMax),
    });
  }

  return items;
}

/** ห้องนี้ผ่านเกณฑ์ครบทุกข้อหรือยัง */
export function isClassComplete(items: CheckItem[]): boolean {
  return items.every((i) => i.state === 'ครบ');
}

// ---------- ภาระงาน & อัตรากำลังของกลุ่มสาระ ----------

/** Offering ที่อยู่ในช่วงภาคเรียนที่เลือก */
function inSemester(off: Offering, filter: SemesterFilter): boolean {
  return filter === 'ปี' ? true : off.semester === filter;
}

export interface AreaWorkload {
  area: Area;
  periods: number; // คาบรวม/สัปดาห์
  offeringsCount: number; // จำนวนรายการจัดสอน
  teachersNeeded: number; // ครูที่ต้องใช้ (ทศนิยม)
  teachersRounded: number; // ปัดขึ้นเป็นจำนวนคน
}

/**
 * สรุปคาบสอนรวมของแต่ละกลุ่มสาระ + ครูที่ต้องใช้โดยประมาณ
 * @param filter 1 | 2 | 'ปี' (ทั้งปี = รวมทั้งสองภาคเรียน)
 */
export function workloadByArea(
  offerings: Offering[],
  subjects: Subject[],
  settings: Settings,
  filter: SemesterFilter = 'ปี',
): AreaWorkload[] {
  const sMap = subjectMap(subjects);
  const acc = new Map<Area, { periods: number; count: number }>();
  for (const area of AREAS) acc.set(area, { periods: 0, count: 0 });

  for (const off of offerings) {
    if (!inSemester(off, filter)) continue;
    const subj = sMap.get(off.subjectId);
    if (!subj) continue;
    const bucket = acc.get(subj.area)!;
    bucket.periods += offeringPeriods(off, subj);
    bucket.count += 1;
  }

  const load = settings.teacherLoad > 0 ? settings.teacherLoad : 1;
  return AREAS.map((area) => {
    const b = acc.get(area)!;
    return {
      area,
      periods: b.periods,
      offeringsCount: b.count,
      teachersNeeded: b.periods / load,
      teachersRounded: Math.ceil(b.periods / load),
    };
  });
}

/** คาบสอนรวมทั้งโรงเรียน ในช่วงภาคเรียนที่เลือก */
export function totalPeriods(
  offerings: Offering[],
  subjects: Subject[],
  filter: SemesterFilter = 'ปี',
): number {
  const sMap = subjectMap(subjects);
  let sum = 0;
  for (const off of offerings) {
    if (!inSemester(off, filter)) continue;
    const subj = sMap.get(off.subjectId);
    if (!subj) continue;
    sum += offeringPeriods(off, subj);
  }
  return sum;
}

/** ครูที่ต้องใช้ทั้งโรงเรียนโดยประมาณ (ปัดขึ้น) */
export function totalTeachersNeeded(
  offerings: Offering[],
  subjects: Subject[],
  settings: Settings,
  filter: SemesterFilter = 'ปี',
): number {
  const load = settings.teacherLoad > 0 ? settings.teacherLoad : 1;
  return Math.ceil(totalPeriods(offerings, subjects, filter) / load);
}

// ---------- ตัวช่วยเกี่ยวกับห้อง ----------

/**
 * label สวย ๆ ของห้อง เช่น "ม.1/2 (วิทย์-คณิต)"
 * @param withCohort ต่อท้ายด้วยรุ่น เช่น "ม.1/2 (วิทย์-คณิต) รุ่น 55" (ถ้ามีรุ่น)
 */
export function classLabel(c: ClassRoom, withCohort = false): string {
  const plan = c.plan ? ` (${c.plan})` : '';
  const cohort = withCohort && c.cohort ? ` รุ่น ${c.cohort}` : '';
  return `${c.grade}/${c.section}${plan}${cohort}`;
}

/** ระดับของห้อง (ม.ต้น/ม.ปลาย) */
export function classLevel(c: ClassRoom): Level {
  return gradeToLevel(c.grade);
}

// ---------- ภาระงานรายครู ----------

export function teacherMap(teachers: Teacher[]): Map<string, Teacher> {
  return new Map(teachers.map((t) => [t.id, t]));
}

/** ชื่อครูจาก id (คืน "(ไม่ระบุครู)" ถ้าไม่มี) */
export function teacherName(tMap: Map<string, Teacher>, teacherId?: string): string {
  if (!teacherId) return '(ไม่ระบุครู)';
  return tMap.get(teacherId)?.name ?? '(ครูถูกลบแล้ว)';
}

export interface TeacherWorkload {
  teacherId: string | null; // null = ยังไม่ระบุครู
  name: string;
  periods: number; // คาบรวม/สัปดาห์
  offeringsCount: number; // จำนวนวิชาที่สอน
}

/**
 * ภาระงานรายครูในกลุ่มสาระหนึ่ง (เรียงคาบมาก -> น้อย)
 * รวมกลุ่ม "(ไม่ระบุครู)" ไว้ท้ายสุดถ้ามี
 */
export function teacherWorkloadInArea(
  area: Area,
  offerings: Offering[],
  subjects: Subject[],
  teachers: Teacher[],
  filter: SemesterFilter = 'ปี',
): TeacherWorkload[] {
  const sMap = subjectMap(subjects);
  const tMap = teacherMap(teachers);
  const acc = new Map<string, { periods: number; count: number }>();

  for (const off of offerings) {
    if (!inSemester(off, filter)) continue;
    const subj = sMap.get(off.subjectId);
    if (!subj || subj.area !== area) continue;
    const key = off.teacherId ?? '__none__';
    const b = acc.get(key) ?? { periods: 0, count: 0 };
    b.periods += offeringPeriods(off, subj);
    b.count += 1;
    acc.set(key, b);
  }

  const rows: TeacherWorkload[] = [];
  for (const [key, b] of acc) {
    const isNone = key === '__none__';
    rows.push({
      teacherId: isNone ? null : key,
      name: isNone ? '(ไม่ระบุครู)' : teacherName(tMap, key),
      periods: b.periods,
      offeringsCount: b.count,
    });
  }
  rows.sort((a, b) => {
    if (a.teacherId === null) return 1;
    if (b.teacherId === null) return -1;
    return b.periods - a.periods;
  });
  return rows;
}

/**
 * ภาระงานรวมของครูทุกคน (ทุกกลุ่มสาระ) — ใช้ในแท็บ "ครูผู้สอน"
 * รวมครูที่ยังไม่มีคาบ (periods=0) ด้วย และเพิ่มแถว "(ไม่ระบุครู)" ถ้ามี offering ที่ไม่ระบุครู
 */
export function teacherWorkloadTotals(
  offerings: Offering[],
  subjects: Subject[],
  teachers: Teacher[],
  filter: SemesterFilter = 'ปี',
): TeacherWorkload[] {
  const sMap = subjectMap(subjects);
  const acc = new Map<string, { periods: number; count: number }>();
  teachers.forEach((t) => acc.set(t.id, { periods: 0, count: 0 }));
  let none = { periods: 0, count: 0 };

  for (const off of offerings) {
    if (!inSemester(off, filter)) continue;
    const subj = sMap.get(off.subjectId);
    if (!subj) continue;
    const p = offeringPeriods(off, subj);
    if (off.teacherId && acc.has(off.teacherId)) {
      const b = acc.get(off.teacherId)!;
      b.periods += p;
      b.count += 1;
    } else {
      none = { periods: none.periods + p, count: none.count + 1 };
    }
  }

  const rows: TeacherWorkload[] = teachers.map((t) => ({
    teacherId: t.id,
    name: t.name,
    periods: acc.get(t.id)!.periods,
    offeringsCount: acc.get(t.id)!.count,
  }));
  if (none.count > 0) {
    rows.push({ teacherId: null, name: '(ไม่ระบุครู)', periods: none.periods, offeringsCount: none.count });
  }
  return rows;
}
