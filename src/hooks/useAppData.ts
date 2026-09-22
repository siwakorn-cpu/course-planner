// ============================================================
// useAppData — สถานะข้อมูลกลางของแอป + บันทึกลง localStorage อัตโนมัติ
// ทุกหน้าจอเรียกใช้ผ่าน hook นี้ เพื่อให้ข้อมูลชุดเดียวกันทั้งแอป
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, ClassRoom, CompletedCourse, Level, Offering, Settings, Subject, Teacher } from '../types';
import { gradeToLevel } from '../types';
import { emptyData, loadData, saveData } from '../storage';
import { promoteAllData } from '../promote';
import { seedData } from '../seedData';

/** id สุ่มแบบสั้น สำหรับข้อมูลที่ผู้ใช้เพิ่มเอง */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface AppDataApi {
  data: AppData;
  loading: boolean; // กำลังโหลดข้อมูลครั้งแรก
  error: string | null; // ข้อผิดพลาดตอนโหลด (เช่น ต่อเซิร์ฟเวอร์ไม่ได้)
  // รายวิชา
  addSubject: (s: Omit<Subject, 'id'>) => void;
  updateSubject: (s: Subject) => void;
  removeSubject: (id: string) => void;
  /** นำเข้าหลายวิชาแบบ upsert ตามรหัสวิชา (ซ้ำ = อัปเดตของเดิม คง id) */
  importSubjects: (incoming: Omit<Subject, 'id'>[]) => void;
  // ห้องเรียน
  addClass: (c: Omit<ClassRoom, 'id'>) => void;
  updateClass: (c: ClassRoom) => void;
  removeClass: (id: string) => void;
  /** ลบหลายห้องพร้อมกัน (ลบการจัดสอน + หน่วยกิตเดิมของห้องเหล่านั้นด้วย) */
  removeClasses: (ids: string[]) => void;
  /** นำเข้าห้องหลายห้องแบบ upsert ตาม ระดับชั้น+ห้อง+รุ่น (พร้อมเพิ่มแผน/กลุ่มใหม่เข้ารายการ) */
  importClasses: (incoming: Omit<ClassRoom, 'id'>[]) => void;
  // หน่วยกิตเดิม (วิชาที่เรียนจบแล้ว) รายห้อง
  addCompleted: (c: Omit<CompletedCourse, 'id'>) => void;
  removeCompleted: (id: string) => void;
  /** นำเข้าหน่วยกิตเดิมหลายรายการแบบ upsert ตาม ห้อง+รหัสวิชา */
  importCompleted: (incoming: Omit<CompletedCourse, 'id'>[]) => void;
  /** เลื่อนชั้นทุกห้อง (ขึ้นปีการศึกษาใหม่) — คืนจำนวนที่เลื่อน/จบ */
  promoteAll: () => { promotedCount: number; graduatedCount: number };
  // การจัดสอน
  addOffering: (o: Omit<Offering, 'id'>) => void;
  updateOffering: (o: Offering) => void;
  removeOffering: (id: string) => void;
  // ครูผู้สอน
  addTeacher: (t: Omit<Teacher, 'id'>) => void;
  updateTeacher: (t: Teacher) => void;
  removeTeacher: (id: string) => void;
  /** นำเข้าครูหลายคนแบบ upsert ตามชื่อ (ซ้ำ = อัปเดต คง id) */
  importTeachers: (incoming: Omit<Teacher, 'id'>[]) => void;
  // แผนการเรียน (ม.ปลาย) / กลุ่มการเรียน (ม.ต้น)
  addTrack: (level: Level, name: string) => void;
  removeTrack: (level: Level, name: string) => void;
  // ตั้งค่า
  updateSettings: (s: Settings) => void;
  // ทั้งก้อน
  replaceAll: (d: AppData) => void;
  resetAll: () => void;
  loadSampleData: () => void;
}

export function useAppData(): AppDataApi {
  const [data, setData] = useState<AppData>(() => emptyData()); // placeholder ระหว่างโหลด
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // อ้างอิงข้อมูลล่าสุด (ใช้ในการทำงานที่ต้องอ่านค่าปัจจุบันแล้วคืนผลทันที เช่น เลื่อนชั้น)
  const dataRef = useRef(data);
  dataRef.current = data;

  // โหลดข้อมูลครั้งแรก (localStorage หรือฐานข้อมูลกลาง)
  useEffect(() => {
    let alive = true;
    loadData()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // บันทึกเมื่อข้อมูลเปลี่ยน (หน่วงเล็กน้อยกันบันทึกถี่เกินไป โดยเฉพาะโหมดฐานข้อมูลกลาง)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (loading) return; // ยังไม่โหลดเสร็จ อย่าเพิ่งบันทึกทับ
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveData(data).catch((e) => console.error('บันทึกข้อมูลไม่สำเร็จ', e));
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, loading]);

  const addSubject = useCallback((s: Omit<Subject, 'id'>) => {
    setData((d) => ({ ...d, subjects: [...d.subjects, { ...s, id: newId('subj') }] }));
  }, []);

  const updateSubject = useCallback((s: Subject) => {
    setData((d) => ({ ...d, subjects: d.subjects.map((x) => (x.id === s.id ? s : x)) }));
  }, []);

  const removeSubject = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      subjects: d.subjects.filter((x) => x.id !== id),
      // ลบการจัดสอนที่อ้างถึงวิชานี้ด้วย เพื่อไม่ให้ข้อมูลค้าง
      offerings: d.offerings.filter((o) => o.subjectId !== id),
    }));
  }, []);

  const importSubjects = useCallback((incoming: Omit<Subject, 'id'>[]) => {
    setData((d) => {
      const byCode = new Map(d.subjects.map((s) => [s.code.trim().toLowerCase(), s]));
      const result = [...d.subjects];
      for (const inc of incoming) {
        const key = inc.code.trim().toLowerCase();
        const existing = byCode.get(key);
        if (existing) {
          // อัปเดตทับ คง id เดิมไว้ เพื่อไม่ให้การจัดสอนที่อ้างวิชานี้หลุด
          const merged: Subject = { ...existing, ...inc, id: existing.id };
          const idx = result.findIndex((s) => s.id === existing.id);
          result[idx] = merged;
        } else {
          const created: Subject = { ...inc, id: newId('subj') };
          result.push(created);
          byCode.set(key, created);
        }
      }
      return { ...d, subjects: result };
    });
  }, []);

  const addClass = useCallback((c: Omit<ClassRoom, 'id'>) => {
    setData((d) => ({ ...d, classes: [...d.classes, { ...c, id: newId('cls') }] }));
  }, []);

  const updateClass = useCallback((c: ClassRoom) => {
    setData((d) => ({ ...d, classes: d.classes.map((x) => (x.id === c.id ? c : x)) }));
  }, []);

  const removeClass = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      classes: d.classes.filter((x) => x.id !== id),
      offerings: d.offerings.filter((o) => o.classId !== id),
      completed: d.completed.filter((c) => c.classId !== id),
    }));
  }, []);

  const addCompleted = useCallback((c: Omit<CompletedCourse, 'id'>) => {
    setData((d) => ({ ...d, completed: [...d.completed, { ...c, id: newId('done') }] }));
  }, []);

  const removeCompleted = useCallback((id: string) => {
    setData((d) => ({ ...d, completed: d.completed.filter((c) => c.id !== id) }));
  }, []);

  const importCompleted = useCallback((incoming: Omit<CompletedCourse, 'id'>[]) => {
    const keyOf = (classId: string, code: string) => `${classId}::${code.trim().toLowerCase()}`;
    setData((d) => {
      const byKey = new Map(d.completed.map((c) => [keyOf(c.classId, c.code), c]));
      const result = [...d.completed];
      for (const inc of incoming) {
        const k = keyOf(inc.classId, inc.code);
        const existing = byKey.get(k);
        if (existing) {
          const merged: CompletedCourse = { ...existing, ...inc, id: existing.id };
          result[result.findIndex((x) => x.id === existing.id)] = merged;
        } else {
          const created: CompletedCourse = { ...inc, id: newId('done') };
          result.push(created);
          byKey.set(k, created);
        }
      }
      return { ...d, completed: result };
    });
  }, []);

  const promoteAll = useCallback(() => {
    const result = promoteAllData(dataRef.current);
    setData(result.data);
    return { promotedCount: result.promotedCount, graduatedCount: result.graduatedCount };
  }, []);

  const removeClasses = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setData((d) => ({
      ...d,
      classes: d.classes.filter((c) => !set.has(c.id)),
      offerings: d.offerings.filter((o) => !set.has(o.classId)),
      completed: d.completed.filter((c) => !set.has(c.classId)),
    }));
  }, []);

  const importClasses = useCallback((incoming: Omit<ClassRoom, 'id'>[]) => {
    const keyOf = (grade: string, section: string, cohort: string) =>
      `${grade.trim()}/${section.trim().toLowerCase()}#${(cohort ?? '').trim()}`;
    setData((d) => {
      const byKey = new Map(d.classes.map((c) => [keyOf(c.grade, c.section, c.cohort), c]));
      const classes = [...d.classes];
      const plans = new Set(d.plans);
      const groups = new Set(d.groups);
      for (const inc of incoming) {
        // เพิ่มแผน/กลุ่มใหม่เข้ารายการให้เลือกอัตโนมัติ
        const track = inc.plan?.trim();
        if (track) (gradeToLevel(inc.grade) === 'ม.ปลาย' ? plans : groups).add(track);

        const k = keyOf(inc.grade, inc.section, inc.cohort);
        const existing = byKey.get(k);
        if (existing) {
          const merged: ClassRoom = { ...existing, ...inc, id: existing.id };
          const idx = classes.findIndex((c) => c.id === existing.id);
          classes[idx] = merged;
        } else {
          const created: ClassRoom = { ...inc, id: newId('cls') };
          classes.push(created);
          byKey.set(k, created);
        }
      }
      return { ...d, classes, plans: [...plans], groups: [...groups] };
    });
  }, []);

  const addOffering = useCallback((o: Omit<Offering, 'id'>) => {
    setData((d) => ({ ...d, offerings: [...d.offerings, { ...o, id: newId('off') }] }));
  }, []);

  const updateOffering = useCallback((o: Offering) => {
    setData((d) => ({ ...d, offerings: d.offerings.map((x) => (x.id === o.id ? o : x)) }));
  }, []);

  const removeOffering = useCallback((id: string) => {
    setData((d) => ({ ...d, offerings: d.offerings.filter((x) => x.id !== id) }));
  }, []);

  const addTeacher = useCallback((t: Omit<Teacher, 'id'>) => {
    setData((d) => ({ ...d, teachers: [...d.teachers, { ...t, id: newId('tch') }] }));
  }, []);

  const updateTeacher = useCallback((t: Teacher) => {
    setData((d) => ({ ...d, teachers: d.teachers.map((x) => (x.id === t.id ? t : x)) }));
  }, []);

  const removeTeacher = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      teachers: d.teachers.filter((x) => x.id !== id),
      // ปลดครูออกจากการจัดสอนที่อ้างถึง (ไม่ลบการจัดสอน)
      offerings: d.offerings.map((o) => (o.teacherId === id ? { ...o, teacherId: undefined } : o)),
    }));
  }, []);

  const importTeachers = useCallback((incoming: Omit<Teacher, 'id'>[]) => {
    setData((d) => {
      const byName = new Map(d.teachers.map((t) => [t.name.trim().toLowerCase(), t]));
      const result = [...d.teachers];
      for (const inc of incoming) {
        const key = inc.name.trim().toLowerCase();
        const existing = byName.get(key);
        if (existing) {
          const merged: Teacher = { ...existing, ...inc, id: existing.id };
          const idx = result.findIndex((t) => t.id === existing.id);
          result[idx] = merged;
        } else {
          const created: Teacher = { ...inc, id: newId('tch') };
          result.push(created);
          byName.set(key, created);
        }
      }
      return { ...d, teachers: result };
    });
  }, []);

  const addTrack = useCallback((level: Level, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setData((d) => {
      const key = level === 'ม.ปลาย' ? 'plans' : 'groups';
      if (d[key].some((x) => x === clean)) return d; // กันซ้ำ
      return { ...d, [key]: [...d[key], clean] };
    });
  }, []);

  const removeTrack = useCallback((level: Level, name: string) => {
    setData((d) => {
      const key = level === 'ม.ปลาย' ? 'plans' : 'groups';
      return { ...d, [key]: d[key].filter((x) => x !== name) };
    });
  }, []);

  const updateSettings = useCallback((s: Settings) => {
    setData((d) => ({ ...d, settings: s }));
  }, []);

  const replaceAll = useCallback((d: AppData) => setData(d), []);

  const resetAll = useCallback(() => setData(emptyData()), []);
  const loadSampleData = useCallback(() => setData(seedData()), []);

  return {
    data,
    loading,
    error,
    addSubject,
    updateSubject,
    removeSubject,
    importSubjects,
    addClass,
    updateClass,
    removeClass,
    removeClasses,
    importClasses,
    addCompleted,
    removeCompleted,
    importCompleted,
    promoteAll,
    addOffering,
    updateOffering,
    removeOffering,
    addTeacher,
    updateTeacher,
    removeTeacher,
    importTeachers,
    addTrack,
    removeTrack,
    updateSettings,
    replaceAll,
    resetAll,
    loadSampleData,
  };
}
