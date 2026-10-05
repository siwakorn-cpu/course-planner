// ============================================================
// storage.test.ts — ทดสอบการแปลง/ซ่อมข้อมูลกลุ่มห้องควบตอนโหลด
// ============================================================
import { describe, expect, it } from 'vitest';
import { normalizeCoupledGroups, pruneCoupledGroups } from './storage';
import type { Offering } from './types';

const offs: Offering[] = [
  { id: 'a', classId: 'c7', subjectId: 'thai', semester: 1 },
  { id: 'b', classId: 'c8', subjectId: 'thai', semester: 1 },
  { id: 'c', classId: 'c9', subjectId: 'thai', semester: 1 },
  { id: 'd', classId: 'c7', subjectId: 'math', semester: 1 },
];

describe('กลุ่มห้องควบ (ระบุห้องรายวิชา)', () => {
  it('แปลงข้อมูลเก่า jointSubjectIds เป็น joints เฉพาะห้องที่มีวิชานั้นจริง', () => {
    const [g] = normalizeCoupledGroups(
      [{ id: 'g', name: 'ควบ', classIds: ['c7', 'c8', 'c9', 'c10'], jointSubjectIds: ['thai', 'math'] }],
      offs,
    );
    // thai: ห้องที่มีวิชา (c7,c8,c9) — c10 ไม่มีวิชา จึงไม่ใส่; math: มีห้องเดียว → ใช้ทั้งกลุ่มตามพฤติกรรมเดิม
    expect(g.joints).toEqual([
      { subjectId: 'thai', classIds: ['c7', 'c8', 'c9'] },
      { subjectId: 'math', classIds: ['c7', 'c8', 'c9', 'c10'] },
    ]);
    expect(g).not.toHaveProperty('jointSubjectIds');
  });

  it('ห้อง+วิชาเดียวกันควบได้ชุดเดียว และชุดที่เหลือไม่ถึง 2 ห้องถูกตัด', () => {
    const groups = normalizeCoupledGroups([
      { id: 'g1', name: 'A', classIds: ['c7', 'c8'], joints: [{ subjectId: 'thai', classIds: ['c7', 'c8'] }] },
      { id: 'g2', name: 'B', classIds: ['c8', 'c9'], joints: [{ subjectId: 'thai', classIds: ['c8', 'c9', 'cX'] }] },
    ], offs);
    expect(groups[0].joints).toHaveLength(1);
    expect(groups[1].joints).toEqual([]);
  });

  it('ลบห้อง/วิชาแล้วตัดออกจากชุดควบ', () => {
    const groups = [{ id: 'g', name: 'A', classIds: ['c7', 'c8', 'c9'], joints: [
      { subjectId: 'thai', classIds: ['c7', 'c8'] },
      { subjectId: 'math', classIds: ['c7', 'c9'] },
    ] }];
    expect(pruneCoupledGroups(groups, { classIds: ['c8'] })[0].joints).toEqual([{ subjectId: 'math', classIds: ['c7', 'c9'] }]);
    expect(pruneCoupledGroups(groups, { subjectId: 'math' })[0].joints).toEqual([{ subjectId: 'thai', classIds: ['c7', 'c8'] }]);
  });
});
