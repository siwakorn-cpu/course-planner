// ============================================================
// calculations.test.ts — ทดสอบความถูกต้องของการคำนวณหน่วยกิต/คาบ
// รันด้วย: npm run test
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  classCredits,
  classElectiveGroups,
  completedCredits,
  coursesForClass,
  cumulativeCredits,
  creditsToPeriods,
  subRoomGroups,
  evaluateRequirements,
  isClassComplete,
  offeringPeriods,
  periodsToCredits,
  teacherWorkloadInArea,
  teacherWorkloadTotals,
  totalPeriods,
  totalTeachersNeeded,
  workloadByArea,
} from './calculations';
import {
  AREAS,
  compareAreas,
  DEFAULT_SETTINGS,
  type Offering,
  type Settings,
  type Subject,
  type Teacher,
} from './types';

const settings: Settings = structuredClone(DEFAULT_SETTINGS);

describe('ลำดับกลุ่มสาระ', () => {
  it('เรียงตามลำดับ 01–09 โดยไม่ใช้ลำดับตัวอักษร', () => {
    const shuffled = ['กิจกรรมพัฒนาผู้เรียน', 'คณิตศาสตร์', 'ภาษาไทย'] as const;
    expect([...shuffled].sort(compareAreas)).toEqual(AREAS.filter((a) => shuffled.includes(a as typeof shuffled[number])));
  });
});

// ---- ชุดข้อมูลทดสอบเล็ก ๆ ----
const subjects: Subject[] = [
  { id: 's1', code: 'ค', name: 'คณิตพื้นฐาน', area: 'คณิตศาสตร์', type: 'พื้นฐาน', credits: 1.5, periods: 3, level: 'ม.ต้น' },
  { id: 's2', code: 'ว', name: 'วิทย์พื้นฐาน', area: 'วิทยาศาสตร์และเทคโนโลยี', type: 'พื้นฐาน', credits: 1.5, periods: 3, level: 'ม.ต้น' },
  { id: 's3', code: 'คพ', name: 'คณิตเพิ่มเติม', area: 'คณิตศาสตร์', type: 'เพิ่มเติม', credits: 1.0, periods: 2, level: 'ม.ต้น' },
];

const offerings: Offering[] = [
  { id: 'o1', classId: 'c1', subjectId: 's1', semester: 1 },
  { id: 'o2', classId: 'c1', subjectId: 's2', semester: 1 },
  { id: 'o3', classId: 'c1', subjectId: 's3', semester: 2, periods: 4 }, // override คาบ
];

describe('การแปลงหน่วยกิต <-> คาบ', () => {
  it('1 หน่วยกิต = 2 คาบ (ค่าเริ่มต้น)', () => {
    expect(creditsToPeriods(1, settings)).toBe(2);
    expect(creditsToPeriods(1.5, settings)).toBe(3);
  });
  it('แปลงคาบกลับเป็นหน่วยกิต', () => {
    expect(periodsToCredits(4, settings)).toBe(2);
  });
});

describe('คาบของ Offering', () => {
  it('ใช้ค่ามาตรฐานของวิชาเมื่อไม่ override', () => {
    expect(offeringPeriods(offerings[0], subjects[0])).toBe(3);
  });
  it('ใช้ค่า override เมื่อระบุ', () => {
    expect(offeringPeriods(offerings[2], subjects[2])).toBe(4);
  });
});

describe('สรุปหน่วยกิตของห้อง', () => {
  it('แยกพื้นฐาน/เพิ่มเติม/รวมถูกต้อง', () => {
    const sum = classCredits('c1', offerings, subjects);
    expect(sum.basic).toBe(3); // 1.5 + 1.5
    expect(sum.additional).toBe(1); // 1.0
    expect(sum.total).toBe(4);
  });
  it('ห้องที่ไม่มี offering ได้ศูนย์', () => {
    const sum = classCredits('ไม่มี', offerings, subjects);
    expect(sum).toEqual({ basic: 0, additional: 0, total: 0 });
  });
});

describe('กลุ่มเลือกภายในห้อง', () => {
  const subs: Subject[] = [
    { id: 'b1', code: 'ท', name: 'ไทยพื้นฐาน', area: 'ภาษาไทย', type: 'พื้นฐาน', credits: 1.0, periods: 2, level: 'ม.ปลาย' },
    { id: 'e1', code: 'จ', name: 'ภาษาจีน', area: 'ภาษาต่างประเทศ', type: 'เพิ่มเติม', credits: 1.5, periods: 3, level: 'ม.ปลาย' },
    { id: 'e2', code: 'ญ', name: 'ภาษาญี่ปุ่น', area: 'ภาษาต่างประเทศ', type: 'เพิ่มเติม', credits: 1.5, periods: 3, level: 'ม.ปลาย' },
  ];
  const offs: Offering[] = [
    { id: 'a', classId: 'c1', subjectId: 'b1', semester: 1 }, // เรียนร่วมทั้งห้อง
    { id: 'b', classId: 'c1', subjectId: 'e1', semester: 1, group: 'จีน' },
    { id: 'c', classId: 'c1', subjectId: 'e2', semester: 1, group: 'ญี่ปุ่น' },
  ];

  it('ดึงรายชื่อกลุ่มเลือก (เรียงไทย)', () => {
    expect(classElectiveGroups('c1', offs)).toEqual(['จีน', 'ญี่ปุ่น']);
  });
  it('หน่วยกิตของกลุ่ม = วิชาร่วม + วิชาของกลุ่มนั้น', () => {
    expect(classCredits('c1', offs, subs, 'จีน')).toEqual({ basic: 1, additional: 1.5, total: 2.5 });
    expect(classCredits('c1', offs, subs, 'ญี่ปุ่น')).toEqual({ basic: 1, additional: 1.5, total: 2.5 });
  });
  it("group '' = เฉพาะวิชาร่วม", () => {
    expect(classCredits('c1', offs, subs, '').total).toBe(1);
  });
  it('ไม่ระบุ group = รวมทุกวิชา (ใช้ดูภาพรวม/คาบ)', () => {
    expect(classCredits('c1', offs, subs).total).toBe(4);
  });
});

describe('หน่วยกิตเดิม (เรียนจบแล้ว)', () => {
  it('รวมแยกพื้นฐาน/เพิ่มเติม/รวม เฉพาะห้องที่ระบุ', () => {
    const done = completedCredits('c1', [
      { id: 'd1', classId: 'c1', code: 'ค21102', name: 'คณิต 2', credits: 1.5, type: 'พื้นฐาน' },
      { id: 'd2', classId: 'c1', code: 'จ20201', name: 'จีน', credits: 1.0, type: 'เพิ่มเติม' },
      { id: 'd3', classId: 'c2', code: 'ท', name: 'ไทย', credits: 1.0, type: 'พื้นฐาน' },
    ]);
    expect(done).toEqual({ basic: 1.5, additional: 1, total: 2.5 });
  });
  it('ห้องที่ไม่มีประวัติ = ศูนย์', () => {
    expect(completedCredits('cX', [])).toEqual({ basic: 0, additional: 0, total: 0 });
  });
  it('หน่วยกิตสะสมรวม = เดิม + ปีนี้', () => {
    const completed = [
      { id: 'd1', classId: 'c1', code: 'x', name: 'x', credits: 3, type: 'พื้นฐาน' as const },
    ];
    const cum = cumulativeCredits('c1', offerings, subjects, completed);
    // offerings c1: s1(1.5 พื้นฐาน)+s2(1.5 พื้นฐาน)+s3(1.0 เพิ่มเติม) = 4 ; +เดิม 3(พื้นฐาน) = 7
    expect(cum.total).toBe(7);
    expect(cum.basic).toBe(6); // 3 + 1.5 + 1.5
    expect(cum.additional).toBe(1); // s3
  });
});

describe('ห้องรวม/กลุ่มย่อยอัตโนมัติ', () => {
  const mk = (grade: any, section: string) => ({ id: 'x', grade, section, plan: '', students: 0, cohort: '' });
  it('ห้อง "5,6,7" -> 5/5, 5/6, 5/7', () => {
    expect(subRoomGroups(mk('ม.5', '5,6,7'))).toEqual(['5/5', '5/6', '5/7']);
  });
  it('รองรับคั่นด้วย / หรือช่องว่าง (เฉพาะตัวเลข)', () => {
    expect(subRoomGroups(mk('ม.4', '1/2/3'))).toEqual(['4/1', '4/2', '4/3']);
  });
  it('ห้องเดี่ยว/ชื่อพิเศษ = ไม่ใช่ห้องรวม', () => {
    expect(subRoomGroups(mk('ม.1', '1'))).toEqual([]);
    expect(subRoomGroups(mk('ม.1', '2/EP'))).toEqual([]); // มี / แต่ไม่ใช่ตัวเลขล้วน
  });

  it('coursesForClass แยกวิชาร่วม + วิชาของกลุ่ม', () => {
    const subs = subjects; // s1,s2 พื้นฐาน, s3 เพิ่มเติม
    const offs = [
      { id: 'o1', classId: 'c1', subjectId: 's1', semester: 1 as const }, // ร่วม
      { id: 'o2', classId: 'c1', subjectId: 's3', semester: 1 as const, group: '5/5' },
    ];
    const done = [{ id: 'd', classId: 'c1', code: 'เดิม', name: 'วิชาเดิม', credits: 1, type: 'พื้นฐาน' as const }];
    const g55 = coursesForClass('c1', offs, subs, done, '5/5');
    // ร่วม (s1 + เดิม) + กลุ่ม 5/5 (s3) = 3 บรรทัด
    expect(g55).toHaveLength(3);
    // กลุ่มอื่นที่ไม่มีวิชา -> เห็นเฉพาะวิชาร่วม (s1 + เดิม) = 2
    expect(coursesForClass('c1', offs, subs, done, '5/6')).toHaveLength(2);
  });
});

describe('เกณฑ์การจบ', () => {
  it('ม.ต้น: พื้นฐานครบ 63 = ครบ, เกิน 81 = เกิน', () => {
    const items = evaluateRequirements({ basic: 63, additional: 10, total: 82 }, 'ม.ต้น', settings);
    const basic = items.find((i) => i.label === 'หน่วยกิตพื้นฐาน')!;
    const max = items.find((i) => i.label.includes('ไม่เกิน'))!;
    expect(basic.state).toBe('ครบ');
    expect(max.state).toBe('เกิน');
  });
  it('ม.ต้น: พื้นฐานไม่ถึง = ยังไม่ครบ', () => {
    const items = evaluateRequirements({ basic: 40, additional: 0, total: 40 }, 'ม.ต้น', settings);
    expect(items[0].state).toBe('ยังไม่ครบ');
    expect(items[0].percent).toBe(Math.round((40 / 63) * 100));
  });
  it('ม.ปลาย: ครบทุกเกณฑ์ => isClassComplete = true', () => {
    const items = evaluateRequirements({ basic: 41, additional: 40, total: 82 }, 'ม.ปลาย', settings);
    expect(isClassComplete(items)).toBe(true);
  });
  it('ม.ปลาย: เพิ่มเติมไม่ถึง 40 => ยังไม่ครบ', () => {
    const items = evaluateRequirements({ basic: 41, additional: 20, total: 61 }, 'ม.ปลาย', settings);
    expect(isClassComplete(items)).toBe(false);
  });
});

describe('ภาระงาน & อัตรากำลังของกลุ่มสาระ', () => {
  it('รวมคาบทั้งปี แยกกลุ่มสาระถูกต้อง', () => {
    const load = workloadByArea(offerings, subjects, settings, 'ปี');
    const math = load.find((l) => l.area === 'คณิตศาสตร์')!;
    const sci = load.find((l) => l.area === 'วิทยาศาสตร์และเทคโนโลยี')!;
    expect(math.periods).toBe(3 + 4); // คณิตพื้นฐาน 3 + คณิตเพิ่มเติม override 4
    expect(sci.periods).toBe(3);
    expect(math.offeringsCount).toBe(2);
  });
  it('กรองเฉพาะภาคเรียนที่ 1', () => {
    const load = workloadByArea(offerings, subjects, settings, 1);
    const math = load.find((l) => l.area === 'คณิตศาสตร์')!;
    expect(math.periods).toBe(3); // เฉพาะคณิตพื้นฐาน (เพิ่มเติมอยู่เทอม 2)
  });
  it('ครูที่ต้องใช้ = คาบ ÷ ภาระงานมาตรฐาน (ปัดขึ้น)', () => {
    const custom: Settings = { ...settings, teacherLoad: 5 };
    const load = workloadByArea(offerings, subjects, custom, 'ปี');
    const math = load.find((l) => l.area === 'คณิตศาสตร์')!;
    expect(math.periods).toBe(7);
    expect(math.teachersNeeded).toBeCloseTo(7 / 5);
    expect(math.teachersRounded).toBe(2); // ceil(1.4)
  });
});

describe('ภาระงานรายครู', () => {
  const teachers: Teacher[] = [
    { id: 't1', name: 'ครูคณิต ก', area: 'คณิตศาสตร์' },
    { id: 't2', name: 'ครูคณิต ข', area: 'คณิตศาสตร์' },
    { id: 't3', name: 'ครูวิทย์', area: 'วิทยาศาสตร์และเทคโนโลยี' },
  ];
  // s1=คณิตพื้นฐาน 3 คาบ, s3=คณิตเพิ่มเติม 2 คาบ, s2=วิทย์ 3 คาบ
  const offs: Offering[] = [
    { id: 'a', classId: 'c1', subjectId: 's1', semester: 1, teacherId: 't1' },
    { id: 'b', classId: 'c1', subjectId: 's3', semester: 1, teacherId: 't2' },
    { id: 'c', classId: 'c2', subjectId: 's1', semester: 1, teacherId: 't1' },
    { id: 'd', classId: 'c1', subjectId: 's2', semester: 1 }, // ไม่ระบุครู
  ];

  it('รวมคาบรายครูในกลุ่มสาระ + จัด "ไม่ระบุครู" ท้ายสุด', () => {
    const rows = teacherWorkloadInArea('คณิตศาสตร์', offs, subjects, teachers, 'ปี');
    expect(rows[0]).toMatchObject({ teacherId: 't1', periods: 6, offeringsCount: 2 }); // 3+3
    expect(rows[1]).toMatchObject({ teacherId: 't2', periods: 2 });
    const sci = teacherWorkloadInArea('วิทยาศาสตร์และเทคโนโลยี', offs, subjects, teachers, 'ปี');
    expect(sci[sci.length - 1]).toMatchObject({ teacherId: null, periods: 3 });
  });

  it('ภาระรวมต่อครู รวมครูที่ยังไม่มีคาบ (0) และแถวไม่ระบุครู', () => {
    const totals = teacherWorkloadTotals(offs, subjects, teachers, 'ปี');
    expect(totals.find((r) => r.teacherId === 't1')?.periods).toBe(6);
    expect(totals.find((r) => r.teacherId === 't3')?.periods).toBe(0); // ไม่มี offering
    expect(totals.find((r) => r.teacherId === null)?.periods).toBe(3); // วิทย์ที่ไม่ระบุครู
  });
});

describe('ภาพรวมทั้งโรงเรียน', () => {
  it('คาบรวมทั้งปี = ผลรวมทุก offering', () => {
    expect(totalPeriods(offerings, subjects, 'ปี')).toBe(3 + 3 + 4);
  });
  it('ครูรวมที่ต้องใช้ปัดขึ้น', () => {
    const custom: Settings = { ...settings, teacherLoad: 20 };
    expect(totalTeachersNeeded(offerings, subjects, custom, 'ปี')).toBe(1); // ceil(10/20)
  });
});
