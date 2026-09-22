import { describe, expect, it } from 'vitest';
import type { Offering } from './types';
import {
  applyOfferingSemesterMove,
  findOfferingConflict,
  latestOfferingBatch,
  planOfferingSemesterMove,
} from './offeringSemester';

const offerings: Offering[] = [
  { id: 'a', classId: 'c1', subjectId: 's1', semester: 1, batchId: 'b1', createdAt: '2026-09-23T01:00:00.000Z' },
  { id: 'b', classId: 'c2', subjectId: 's1', semester: 1, batchId: 'b2', createdAt: '2026-09-23T02:00:00.000Z' },
  { id: 'c', classId: 'c1', subjectId: 's1', semester: 2 },
];

describe('ย้ายภาคเรียนของการจัดสอน', () => {
  it('ข้ามรายการที่ซ้ำในภาคเรียนปลายทาง', () => {
    const plan = planOfferingSemesterMove(offerings, ['a', 'b'], 2);
    expect(plan.movableIds).toEqual(['b']);
    expect(plan.conflictIds).toEqual(['a']);
    expect(applyOfferingSemesterMove(offerings, plan).find((o) => o.id === 'b')?.semester).toBe(2);
  });

  it('ตรวจรายการซ้ำโดยแยกกลุ่มเลือก', () => {
    expect(findOfferingConflict(offerings, { ...offerings[0], semester: 2 })).toBe(offerings[2]);
    expect(findOfferingConflict(offerings, { ...offerings[0], semester: 2, group: 'ภาษาจีน' })).toBeUndefined();
  });

  it('หาชุดที่สร้างล่าสุด', () => {
    expect(latestOfferingBatch(offerings).map((o) => o.id)).toEqual(['b']);
  });
});
