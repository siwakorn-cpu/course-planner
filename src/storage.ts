// ============================================================
// storage.ts — ชั้นจัดเก็บข้อมูล (persistence layer)
// รองรับ 2 โหมด (โครงส่วนอื่นเรียกผ่านฟังก์ชันเหล่านี้เท่านั้น):
//   - ฐานข้อมูลกลาง (ตั้งค่า VITE_API_URL) → เรียก Backend API
//   - ในเครื่อง (ไม่ตั้งค่า) → localStorage
// ============================================================
import { apiGetData, apiPutData, useRemote } from './api';
import {
  type AppData,
  type ClassRoom,
  DATA_VERSION,
  DEFAULT_GROUPS,
  DEFAULT_PLANS,
  DEFAULT_SETTINGS,
  type Offering,
  type Settings,
  type Teacher,
  gradeToLevel,
} from './types';

const STORAGE_KEY = 'course-planner:data';

/** รวม settings ที่โหลดมากับค่าเริ่มต้น กันฟิลด์ที่หายไปในข้อมูลเก่า */
function mergeSettings(loaded: Partial<Settings> | undefined): Settings {
  if (!loaded) return structuredClone(DEFAULT_SETTINGS);
  return {
    periodsPerCredit: loaded.periodsPerCredit ?? DEFAULT_SETTINGS.periodsPerCredit,
    teacherLoad: loaded.teacherLoad ?? DEFAULT_SETTINGS.teacherLoad,
    requirements: {
      'ม.ต้น': { ...DEFAULT_SETTINGS.requirements['ม.ต้น'], ...loaded.requirements?.['ม.ต้น'] },
      'ม.ปลาย': { ...DEFAULT_SETTINGS.requirements['ม.ปลาย'], ...loaded.requirements?.['ม.ปลาย'] },
    },
  };
}

/**
 * ย้ายข้อมูลเดิมที่ครูเป็นข้อความ (offering.teacher) ให้เป็นรายชื่อครูจริง (teacherId)
 * ทำงานเฉพาะกับข้อมูลเก่าก่อนเวอร์ชัน 2 — ถ้าแปลงแล้วจะไม่แปลงซ้ำ
 */
function migrateTeachers(
  rawTeachers: Teacher[],
  rawOfferings: Offering[],
): { teachers: Teacher[]; offerings: Offering[] } {
  const teachers = [...rawTeachers];
  const byName = new Map(teachers.map((t) => [t.name.trim(), t]));
  let seq = 0;

  const offerings = rawOfferings.map((o) => {
    const legacy = (o as Offering & { teacher?: string }).teacher;
    if (!o.teacherId && typeof legacy === 'string' && legacy.trim()) {
      const name = legacy.trim();
      let t = byName.get(name);
      if (!t) {
        t = { id: `tch-legacy-${Date.now().toString(36)}-${seq++}`, name };
        teachers.push(t);
        byName.set(name, t);
      }
      const { teacher: _drop, ...rest } = o as Offering & { teacher?: string };
      return { ...rest, teacherId: t.id };
    }
    return o;
  });

  return { teachers, offerings };
}

/** รวมรายการแผนการเรียน/กลุ่มการเรียน จากค่าที่บันทึกไว้ + ค่าที่ห้องต่าง ๆ ใช้อยู่ */
function collectTracks(
  rawPlans: string[] | undefined,
  rawGroups: string[] | undefined,
  classes: ClassRoom[],
): { plans: string[]; groups: string[] } {
  const plans = new Set(rawPlans ?? []);
  const groups = new Set(rawGroups ?? []);
  for (const c of classes) {
    const name = c.plan?.trim();
    if (!name) continue;
    (gradeToLevel(c.grade) === 'ม.ปลาย' ? plans : groups).add(name);
  }
  return {
    plans: plans.size ? [...plans] : [...DEFAULT_PLANS],
    groups: groups.size ? [...groups] : [...DEFAULT_GROUPS],
  };
}

/** ทำให้ก้อนข้อมูลสมบูรณ์เสมอ (กันข้อมูลเสีย/ไม่ครบ) */
export function normalize(raw: Partial<AppData> | undefined): AppData {
  const { teachers, offerings } = migrateTeachers(raw?.teachers ?? [], raw?.offerings ?? []);
  // เติม cohort='' ให้ข้อมูลเก่าที่ยังไม่มีฟิลด์รุ่น
  const classes = (raw?.classes ?? []).map((c) => ({ ...c, cohort: c.cohort ?? '' }));
  const { plans, groups } = collectTracks(raw?.plans, raw?.groups, classes);
  return {
    version: DATA_VERSION,
    subjects: raw?.subjects ?? [],
    classes,
    offerings,
    coupledGroups: (raw?.coupledGroups ?? []).map((g) => ({
      ...g,
      classIds: [...new Set(g.classIds ?? [])],
      jointSubjectIds: [...new Set(g.jointSubjectIds ?? [])],
    })),
    teachers,
    completed: raw?.completed ?? [],
    graduated: raw?.graduated ?? [],
    plans,
    groups,
    settings: mergeSettings(raw?.settings),
  };
}

/** ก้อนข้อมูลว่าง (ใช้เป็นค่าเริ่มต้นเมื่อยังไม่เคยมีข้อมูล และเป็น placeholder ระหว่างกำลังโหลด) */
export function emptyData(): AppData {
  return normalize(undefined);
}

/**
 * โหลดข้อมูล (async)
 *  - โหมดฐานข้อมูลกลาง: ดึงจาก API; ถ้ายังไม่มีข้อมูล → เริ่มจากข้อมูลว่าง (ไม่ยัดชุดตัวอย่าง)
 *  - โหมดในเครื่อง: อ่านจาก localStorage; ถ้าไม่มี/พัง → เริ่มจากข้อมูลว่าง
 */
export async function loadData(): Promise<AppData> {
  if (useRemote) {
    const raw = await apiGetData();
    if (!raw) return emptyData();
    return normalize(raw);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return normalize(JSON.parse(raw) as Partial<AppData>);
  } catch (err) {
    console.warn('โหลดข้อมูลไม่สำเร็จ เริ่มจากข้อมูลว่างแทน', err);
    return emptyData();
  }
}

/** บันทึกข้อมูล (async) — ฐานข้อมูลกลางหรือ localStorage ตามโหมด */
export async function saveData(data: AppData): Promise<void> {
  if (useRemote) {
    await apiPutData(data);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('บันทึกข้อมูลไม่สำเร็จ', err);
  }
}

// ---------- Export / Import เป็นไฟล์ JSON ----------

/** แปลงข้อมูลเป็นสตริง JSON สวยงามสำหรับสำรอง */
export function exportToJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/** สั่งดาวน์โหลดไฟล์ JSON สำรองข้อมูล (เรียกจากปุ่มในหน้าเว็บ) */
export function downloadBackup(data: AppData): void {
  const blob = new Blob([exportToJson(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `course-planner-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** อ่านไฟล์ที่ผู้ใช้เลือก แล้วแปลงกลับเป็น AppData (ตรวจสอบเบื้องต้น) */
export function importFromJson(text: string): AppData {
  const parsed = JSON.parse(text) as Partial<AppData>;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('ไฟล์ไม่ถูกต้อง: ไม่ใช่ข้อมูล JSON');
  }
  if (!Array.isArray(parsed.subjects) || !Array.isArray(parsed.classes) || !Array.isArray(parsed.offerings)) {
    throw new Error('ไฟล์ไม่ถูกต้อง: ขาดข้อมูล subjects/classes/offerings');
  }
  return normalize(parsed);
}
