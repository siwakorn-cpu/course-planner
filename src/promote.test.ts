// ============================================================
// promote.test.ts — ทดสอบตรรกะเลื่อนชั้น
// ============================================================
import { describe, expect, it } from 'vitest';
import { promoteAllData } from './promote';
import { type AppData, DATA_VERSION, DEFAULT_SETTINGS } from './types';

function baseData(): AppData {
  return {
    version: DATA_VERSION,
    subjects: [
      { id: 's1', code: 'ค21101', name: 'คณิต 1', area: 'คณิตศาสตร์', type: 'พื้นฐาน', credits: 1.5, periods: 3, level: 'ม.ต้น' },
      { id: 's2', code: 'จ20201', name: 'จีน', area: 'ภาษาต่างประเทศ', type: 'เพิ่มเติม', credits: 1.0, periods: 2, level: 'ม.ต้น' },
    ],
    classes: [
      { id: 'c1', grade: 'ม.1', section: '1', plan: 'ทั่วไป', students: 40, cohort: '69' },
      { id: 'c3', grade: 'ม.3', section: '1', plan: 'ทั่วไป', students: 38, cohort: '67' },
    ],
    offerings: [
      { id: 'o1', classId: 'c1', subjectId: 's1', semester: 1 },
      { id: 'o2', classId: 'c1', subjectId: 's2', semester: 1, group: 'จีน' },
      { id: 'o3', classId: 'c3', subjectId: 's1', semester: 1 },
    ],
    teachers: [],
    completed: [
      { id: 'd1', classId: 'c3', code: 'ท', name: 'ไทยเดิม', credits: 2, type: 'พื้นฐาน' },
    ],
    graduated: [],
    plans: [],
    groups: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

describe('เลื่อนชั้น', () => {
  it('ม.1 เลื่อนเป็น ม.2 และโอน offerings เข้าหน่วยกิตเดิม แล้วล้าง', () => {
    const { data, promotedCount, graduatedCount } = promoteAllData(baseData());
    expect(promotedCount).toBe(1);
    expect(graduatedCount).toBe(1);

    const c1 = data.classes.find((c) => c.id === 'c1')!;
    expect(c1.grade).toBe('ม.2');
    expect(c1.cohort).toBe('69'); // รุ่นคงเดิม

    // offerings ถูกล้างทั้งหมด
    expect(data.offerings).toHaveLength(0);

    // c1 ได้หน่วยกิตเดิมจาก offerings 2 วิชา (คงกลุ่มเลือกไว้)
    const c1Completed = data.completed.filter((x) => x.classId === 'c1');
    expect(c1Completed).toHaveLength(2);
    expect(c1Completed.find((x) => x.code === 'จ20201')?.group).toBe('จีน');
  });

  it('ม.3 จบการศึกษา → เข้าทำเนียบ พร้อมหน่วยกิตเดิม + วิชาปีสุดท้าย', () => {
    const { data } = promoteAllData(baseData());
    // c3 หายจาก classes/completed
    expect(data.classes.find((c) => c.id === 'c3')).toBeUndefined();
    expect(data.completed.find((x) => x.classId === 'c3')).toBeUndefined();

    expect(data.graduated).toHaveLength(1);
    const g = data.graduated[0];
    expect(g.grade).toBe('ม.3');
    expect(g.level).toBe('ม.ต้น');
    // courses = completed เดิม (ไทยเดิม) + offering ปีสุดท้าย (ค21101)
    expect(g.courses).toHaveLength(2);
    expect(g.courses.map((x) => x.code).sort()).toEqual(['ค21101', 'ท']);
  });

  it('ม.6 = จบ, ม.5 = เลื่อนเป็น ม.6', () => {
    const d = baseData();
    d.classes = [
      { id: 'a', grade: 'ม.5', section: '1', plan: 'วิทย์-คณิต', students: 30, cohort: '66' },
      { id: 'b', grade: 'ม.6', section: '1', plan: 'วิทย์-คณิต', students: 30, cohort: '65' },
    ];
    d.offerings = [];
    d.completed = [];
    const { data, promotedCount, graduatedCount } = promoteAllData(d);
    expect(promotedCount).toBe(1);
    expect(graduatedCount).toBe(1);
    expect(data.classes.find((c) => c.id === 'a')!.grade).toBe('ม.6');
    expect(data.graduated[0].grade).toBe('ม.6');
    expect(data.graduated[0].level).toBe('ม.ปลาย');
  });
});
