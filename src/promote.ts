// ============================================================
// promote.ts — ตรรกะ "เลื่อนชั้น/ขึ้นปีการศึกษา" (ฟังก์ชันล้วน ทดสอบได้)
// กติกา:
//   - ม.1→ม.2, ม.2→ม.3, ม.4→ม.5, ม.5→ม.6 (รุ่นคงเดิม)
//   - ม.3, ม.6 = จบการศึกษา → ย้ายเข้าทำเนียบจบ
//   - วิชาที่จัดสอนปีปัจจุบัน (offerings) โอนเข้า "หน่วยกิตเดิม" ของห้อง แล้วล้าง
// ============================================================
import {
  type AppData,
  type ClassRoom,
  type CompletedCourse,
  type CreditRecord,
  type Grade,
  type GraduatedClass,
  gradeToLevel,
} from './types';

/** ระดับชั้นถัดไป (null = จบการศึกษา) */
const NEXT_GRADE: Record<Grade, Grade | null> = {
  'ม.1': 'ม.2',
  'ม.2': 'ม.3',
  'ม.3': null,
  'ม.4': 'ม.5',
  'ม.5': 'ม.6',
  'ม.6': null,
};

let seq = 0;
const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export interface PromoteResult {
  data: AppData;
  promotedCount: number; // ห้องที่เลื่อนขึ้น
  graduatedCount: number; // ห้องที่จบการศึกษา
}

/** แปลง AppData เป็นสถานะหลังเลื่อนชั้น (ไม่แก้ของเดิม) */
export function promoteAllData(data: AppData): PromoteResult {
  const sMap = new Map(data.subjects.map((s) => [s.id, s]));
  const stamp = new Date().toISOString().slice(0, 10);

  const toRecord = (subjectId: string, group: string | undefined, fromGrade: Grade): CreditRecord | null => {
    const s = sMap.get(subjectId);
    if (!s) return null;
    return { code: s.code, name: s.name, credits: s.credits, type: s.type, group, note: `จาก ${fromGrade}` };
  };
  const strip = (c: CompletedCourse): CreditRecord => ({
    code: c.code, name: c.name, credits: c.credits, type: c.type, group: c.group, note: c.note,
  });

  const classes: ClassRoom[] = [];
  const completed: CompletedCourse[] = [];
  const graduated: GraduatedClass[] = [...data.graduated];
  let promotedCount = 0;
  let graduatedCount = 0;

  for (const c of data.classes) {
    const classOffs = data.offerings.filter((o) => o.classId === c.id);
    const converted = classOffs
      .map((o) => toRecord(o.subjectId, o.group, c.grade))
      .filter((r): r is CreditRecord => r !== null);
    const existing = data.completed.filter((x) => x.classId === c.id);

    if (NEXT_GRADE[c.grade] === null) {
      // จบการศึกษา → ทำเนียบจบ
      graduated.push({
        id: genId('grad'),
        grade: c.grade,
        section: c.section,
        plan: c.plan,
        cohort: c.cohort,
        students: c.students,
        level: gradeToLevel(c.grade),
        graduatedAt: stamp,
        courses: [...existing.map(strip), ...converted],
      });
      graduatedCount += 1;
    } else {
      // เลื่อนชั้น: grade +1, คงหน่วยกิตเดิม + โอน offerings เข้าเป็นหน่วยกิตเดิม
      classes.push({ ...c, grade: NEXT_GRADE[c.grade]! });
      completed.push(...existing);
      completed.push(...converted.map((r) => ({ ...r, id: genId('done'), classId: c.id })));
      promotedCount += 1;
    }
  }

  return {
    data: {
      ...data,
      classes,
      completed,
      offerings: [],
      graduated,
      coupledGroups: data.coupledGroups
        .map((g) => ({ ...g, classIds: g.classIds.filter((id) => classes.some((c) => c.id === id)) }))
        .filter((g) => g.classIds.length >= 2),
    },
    promotedCount,
    graduatedCount,
  };
}
