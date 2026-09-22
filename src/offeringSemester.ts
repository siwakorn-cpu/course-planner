import type { Offering, Semester } from './types';

export interface OfferingMovePlan {
  targetSemester: Semester;
  requestedIds: string[];
  movableIds: string[];
  conflictIds: string[];
  unchangedIds: string[];
}

/** กลุ่มว่างถือเป็นทั้งห้อง และตัดช่องว่างเพื่อกันรายการซ้ำที่สะกดต่างกันเล็กน้อย */
function normalizedGroup(group?: string): string {
  return group?.trim().toLocaleLowerCase('th') ?? '';
}

export function offeringSlotKey(offering: Pick<Offering, 'classId' | 'subjectId' | 'group'>): string {
  return `${offering.classId}\u0000${offering.subjectId}\u0000${normalizedGroup(offering.group)}`;
}

export function findOfferingConflict(
  offerings: Offering[],
  candidate: Pick<Offering, 'id' | 'classId' | 'subjectId' | 'semester' | 'group'>,
): Offering | undefined {
  const key = offeringSlotKey(candidate);
  return offerings.find(
    (offering) =>
      offering.id !== candidate.id &&
      offering.semester === candidate.semester &&
      offeringSlotKey(offering) === key,
  );
}

/** วางแผนย้ายก่อนแก้ข้อมูลจริง พร้อมแยกรายการซ้ำในภาคเรียนปลายทาง */
export function planOfferingSemesterMove(
  offerings: Offering[],
  ids: Iterable<string>,
  targetSemester: Semester,
): OfferingMovePlan {
  const requestedIds = [...new Set(ids)];
  const requestedSet = new Set(requestedIds);
  const byId = new Map(offerings.map((offering) => [offering.id, offering]));
  const occupied = new Set(
    offerings
      .filter((offering) => offering.semester === targetSemester && !requestedSet.has(offering.id))
      .map(offeringSlotKey),
  );
  const movableIds: string[] = [];
  const conflictIds: string[] = [];
  const unchangedIds: string[] = [];

  for (const id of requestedIds) {
    const offering = byId.get(id);
    if (!offering) continue;
    if (offering.semester === targetSemester) {
      unchangedIds.push(id);
      occupied.add(offeringSlotKey(offering));
      continue;
    }
    const key = offeringSlotKey(offering);
    if (occupied.has(key)) {
      conflictIds.push(id);
      continue;
    }
    movableIds.push(id);
    occupied.add(key);
  }

  return { targetSemester, requestedIds, movableIds, conflictIds, unchangedIds };
}

export function applyOfferingSemesterMove(
  offerings: Offering[],
  plan: OfferingMovePlan,
): Offering[] {
  const movable = new Set(plan.movableIds);
  return offerings.map((offering) =>
    movable.has(offering.id) ? { ...offering, semester: plan.targetSemester } : offering,
  );
}

/** คืนชุดการเพิ่มล่าสุด เฉพาะข้อมูลใหม่ที่มี batchId/createdAt */
export function latestOfferingBatch(offerings: Offering[]): Offering[] {
  let latest: Offering | undefined;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const offering of offerings) {
    if (!offering.batchId || !offering.createdAt) continue;
    const time = Date.parse(offering.createdAt);
    if (!Number.isFinite(time) || time < latestTime) continue;
    latest = offering;
    latestTime = time;
  }
  if (!latest?.batchId) return [];
  return offerings.filter((offering) => offering.batchId === latest?.batchId);
}
