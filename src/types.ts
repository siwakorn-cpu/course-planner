// ============================================================
// types.ts — โครงสร้างข้อมูลกลางของทั้งแอป (data model)
// แยกชั้นชัดเจน: ที่นี่กำหนด "รูปร่างข้อมูล" อย่างเดียว
// ============================================================

/** 8 กลุ่มสาระการเรียนรู้ ตามหลักสูตรแกนกลางฯ 2551 */
export const AREAS = [
  'ภาษาไทย',
  'คณิตศาสตร์',
  'วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษาฯ',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'การงานอาชีพ',
  'ภาษาต่างประเทศ',
] as const;
export type Area = (typeof AREAS)[number];

/** ประเภทของรายวิชา */
export type SubjectType = 'พื้นฐาน' | 'เพิ่มเติม';

/** ระดับชั้น */
export type Level = 'ม.ต้น' | 'ม.ปลาย';

/** ระดับชั้นรายชั้นปี */
export const GRADES = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'] as const;
export type Grade = (typeof GRADES)[number];

/** ภาคเรียน */
export type Semester = 1 | 2;

/** รายวิชา */
export interface Subject {
  id: string;
  code: string; // รหัสวิชา เช่น ท21101
  name: string; // ชื่อวิชา
  area: Area; // กลุ่มสาระ
  type: SubjectType; // พื้นฐาน | เพิ่มเติม
  credits: number; // หน่วยกิต
  periods: number; // คาบ/สัปดาห์ (ค่ามาตรฐานของวิชานี้)
  level: Level; // ม.ต้น | ม.ปลาย
}

/** ห้องเรียน */
export interface ClassRoom {
  id: string;
  grade: Grade; // ม.1..ม.6
  section: string; // ห้อง เช่น "1", "2/EP"
  plan: string; // แผนการเรียน เช่น วิทย์-คณิต, ทั่วไป
  students: number; // จำนวนนักเรียน
  cohort: string; // รุ่น เช่น "55" (ระบุว่านักเรียนใช้หลักสูตรของปีใด) — ว่างได้
}

/** ครูผู้สอน */
export interface Teacher {
  id: string;
  name: string; // ชื่อ-สกุล
  area?: Area; // กลุ่มสาระที่สังกัด (ไม่ระบุก็ได้)
}

/** การจัดสอน = จับคู่ห้อง × วิชา × ภาคเรียน */
export interface Offering {
  id: string;
  classId: string;
  subjectId: string;
  semester: Semester;
  periods?: number; // ถ้าระบุ = ใช้แทนคาบมาตรฐานของวิชา (override)
  room?: string; // สถานที่/ห้องปฏิบัติการ
  teacherId?: string; // อ้างอิงครูผู้สอน (ดูรายชื่อใน AppData.teachers)
  group?: string; // กลุ่มเลือกภายในห้อง (ว่าง = ทั้งห้องเรียนร่วมกัน; มีค่า = เฉพาะกลุ่มนั้น เช่น "ภาษาจีน")
}

/** เกณฑ์หน่วยกิตการจบของแต่ละระดับ (แก้ไขได้ในแอป) */
export interface LevelRequirement {
  basic: number; // หน่วยกิตพื้นฐานที่ต้องมี
  additionalMin: number; // หน่วยกิตเพิ่มเติมขั้นต่ำ (ม.ต้นไม่บังคับ = 0)
  totalMin: number; // หน่วยกิตรวมขั้นต่ำ
  totalMax: number; // หน่วยกิตรวมสูงสุด (0 = ไม่จำกัด)
  activityHours: number; // กิจกรรมพัฒนาผู้เรียน (ชม.)
}

/** รายการหน่วยกิต 1 วิชา (ใช้ทั้งหน่วยกิตเดิมและทำเนียบจบ) */
export interface CreditRecord {
  code: string; // รหัสวิชา
  name: string; // ชื่อวิชา
  credits: number; // หน่วยกิต
  type: SubjectType; // พื้นฐาน | เพิ่มเติม
  group?: string; // กลุ่มเลือกภายในห้อง (ว่าง = เรียนร่วมทั้งห้อง)
  note?: string; // หมายเหตุ เช่น "ม.4 ภาคเรียน 1/2566"
}

/** วิชาที่เรียนจบไปแล้ว (หน่วยกิตสะสมเดิม) — บันทึกระดับห้อง/รุ่น แยกจากการจัดสอนปัจจุบัน */
export interface CompletedCourse extends CreditRecord {
  id: string;
  classId: string; // ห้องที่เรียนวิชานี้จบแล้ว
}

/** ห้องที่จบการศึกษาแล้ว (ทำเนียบจบ) — บันทึกสรุป ณ วันจบ */
export interface GraduatedClass {
  id: string;
  grade: Grade; // ระดับชั้น ณ วันจบ (ม.3 หรือ ม.6)
  section: string;
  plan: string;
  cohort: string;
  students: number;
  level: Level;
  graduatedAt: string; // วันที่บันทึกจบ (YYYY-MM-DD)
  courses: CreditRecord[]; // รายวิชาทั้งหมดที่เรียนสะสม
}

/** ค่าตั้งค่าการคำนวณและเกณฑ์ */
export interface Settings {
  periodsPerCredit: number; // 1 หน่วยกิต = กี่คาบ/สัปดาห์ (ค่าเริ่มต้น 2)
  teacherLoad: number; // ภาระงานสอนมาตรฐานต่อครู (คาบ/สัปดาห์, ค่าเริ่มต้น 20)
  requirements: Record<Level, LevelRequirement>;
}

/** ก้อนข้อมูลทั้งหมดของแอป (ใช้ตอน Export/Import) */
export interface AppData {
  version: number;
  subjects: Subject[];
  classes: ClassRoom[];
  offerings: Offering[];
  teachers: Teacher[];
  completed: CompletedCourse[]; // วิชาที่เรียนจบแล้ว (หน่วยกิตสะสมเดิม) รายห้อง
  graduated: GraduatedClass[]; // ทำเนียบจบการศึกษา
  plans: string[]; // รายการแผนการเรียน (ม.ปลาย) ที่เลือกได้
  groups: string[]; // รายการกลุ่มการเรียน (ม.ต้น) ที่เลือกได้
  settings: Settings;
}

/** เวอร์ชันสคีมาข้อมูล — เพิ่มเลขนี้เมื่อโครงสร้างเปลี่ยน */
export const DATA_VERSION = 5;

/** แผนการเรียนตั้งต้น (ม.ปลาย) — แก้ไข/เพิ่ม/ลบได้ในแอป */
export const DEFAULT_PLANS = ['วิทย์-คณิต', 'ศิลป์-คำนวณ', 'ศิลป์-ภาษา', 'ศิลป์-ทั่วไป'];

/** กลุ่มการเรียนตั้งต้น (ม.ต้น) — แก้ไข/เพิ่ม/ลบได้ในแอป */
export const DEFAULT_GROUPS = ['ทั่วไป', 'ห้องเรียนพิเศษ (Gifted)', 'English Program (EP)'];

/** รายการแผน/กลุ่มที่เลือกได้ตามระดับของห้อง */
export function tracksForLevel(data: AppData, level: Level): string[] {
  return level === 'ม.ปลาย' ? data.plans : data.groups;
}

/** ค่าตั้งต้นของ Settings ตามหลักสูตรแกนกลางฯ 2551 */
export const DEFAULT_SETTINGS: Settings = {
  periodsPerCredit: 2,
  teacherLoad: 20,
  requirements: {
    'ม.ต้น': {
      basic: 63,
      additionalMin: 0,
      totalMin: 0,
      totalMax: 81,
      activityHours: 360,
    },
    'ม.ปลาย': {
      basic: 41,
      additionalMin: 40,
      totalMin: 81,
      totalMax: 0,
      activityHours: 360,
    },
  },
};

/** แปลงระดับชั้น (ม.1..ม.6) เป็นระดับ (ม.ต้น/ม.ปลาย) */
export function gradeToLevel(grade: Grade): Level {
  return grade === 'ม.4' || grade === 'ม.5' || grade === 'ม.6'
    ? 'ม.ปลาย'
    : 'ม.ต้น';
}
