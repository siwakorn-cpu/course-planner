// ============================================================
// importExcel.test.ts — ทดสอบการแปลง/ตรวจสอบข้อมูลนำเข้าจาก Excel
// ============================================================
import { describe, expect, it } from 'vitest';
import { classKey, rowsToClasses, rowsToCompleted, rowsToSubjects, rowsToTeachers } from './importExcel';
import { DEFAULT_SETTINGS, type Settings } from './types';

const settings: Settings = structuredClone(DEFAULT_SETTINGS);
const noExisting = new Set<string>();

const HEADER = ['รหัสวิชา', 'ชื่อวิชา', 'กลุ่มสาระ', 'ประเภท', 'หน่วยกิต', 'คาบ/สัปดาห์', 'ระดับ'];

describe('นำเข้ารายวิชาจากตาราง', () => {
  it('แถวถูกต้องแปลงเป็นรายวิชาได้', () => {
    const aoa = [HEADER, ['ค21101', 'คณิตศาสตร์ 1', 'คณิตศาสตร์', 'พื้นฐาน', 1.5, 3, 'ม.ต้น']];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.headerError).toBeUndefined();
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].data).toMatchObject({
      code: 'ค21101', name: 'คณิตศาสตร์ 1', area: 'คณิตศาสตร์', type: 'พื้นฐาน', credits: 1.5, periods: 3, level: 'ม.ต้น',
    });
    expect(res.addCount).toBe(1);
  });

  it('เติมคาบอัตโนมัติเมื่อเว้นว่าง (จากหน่วยกิต × 2)', () => {
    const aoa = [HEADER, ['ว31201', 'ฟิสิกส์ 1', 'วิทยาศาสตร์และเทคโนโลยี', 'เพิ่มเติม', 1.5, '', 'ม.ปลาย']];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.valid[0].data?.periods).toBe(3);
  });

  it('ตีความกลุ่มสาระ/ประเภท/ระดับแบบยืดหยุ่น', () => {
    const aoa = [HEADER, ['ส31101', 'สังคม 1', 'สังคมศึกษา', 'เพิ่ม', 1, 2, 'ปลาย']];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.valid[0].data).toMatchObject({ area: 'สังคมศึกษาฯ', type: 'เพิ่มเติม', level: 'ม.ปลาย' });
  });

  it('รองรับประเภทกิจกรรมพัฒนาผู้เรียน', () => {
    const aoa = [HEADER, ['กม9101', 'ชุมนุม', 'กิจกรรมพัฒนาผู้เรียน', 'กิจกรรมพัฒนาผู้เรียน', 0, 1, 'ม.ต้น']];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.valid[0].data?.type).toBe('กิจกรรมพัฒนาผู้เรียน');
  });

  it('จับข้อผิดพลาดรายแถว (กลุ่มสาระผิด, ไม่มีชื่อ)', () => {
    const aoa = [
      HEADER,
      ['x01', '', 'มั่ว', 'พื้นฐาน', 1, 2, 'ม.ต้น'],
    ];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.valid).toHaveLength(0);
    expect(res.invalid).toHaveLength(1);
    expect(res.invalid[0].errors.length).toBeGreaterThanOrEqual(2);
  });

  it('ตั้งค่า isUpdate เมื่อรหัสซ้ำกับคลังเดิม', () => {
    const aoa = [HEADER, ['ค21101', 'คณิต 1 (แก้)', 'คณิตศาสตร์', 'พื้นฐาน', 2, 4, 'ม.ต้น']];
    const res = rowsToSubjects(aoa, settings, new Set(['ค21101']));
    expect(res.valid[0].isUpdate).toBe(true);
    expect(res.updateCount).toBe(1);
    expect(res.addCount).toBe(0);
  });

  it('ตรวจจับรหัสซ้ำภายในไฟล์เดียวกัน', () => {
    const aoa = [
      HEADER,
      ['ค21101', 'คณิต 1', 'คณิตศาสตร์', 'พื้นฐาน', 1.5, 3, 'ม.ต้น'],
      ['ค21101', 'คณิต 1 ซ้ำ', 'คณิตศาสตร์', 'พื้นฐาน', 1.5, 3, 'ม.ต้น'],
    ];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.valid).toHaveLength(1);
    expect(res.invalid[0].errors.join()).toContain('ซ้ำ');
  });

  it('แจ้ง headerError เมื่อขาดคอลัมน์จำเป็น', () => {
    const aoa = [['รหัสวิชา', 'ชื่อวิชา'], ['ค21101', 'คณิต 1']];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.headerError).toContain('กลุ่มสาระ');
  });

  it('ข้ามแถวว่าง', () => {
    const aoa = [
      HEADER,
      ['', '', '', '', '', '', ''],
      ['อ21101', 'อังกฤษ 1', 'ภาษาต่างประเทศ', 'พื้นฐาน', 1.5, 3, 'ม.ต้น'],
    ];
    const res = rowsToSubjects(aoa, settings, noExisting);
    expect(res.rows).toHaveLength(1);
    expect(res.valid).toHaveLength(1);
  });
});

describe('นำเข้ารายชื่อครูจากตาราง', () => {
  const T_HEADER = ['ชื่อ-สกุล', 'กลุ่มสาระ'];

  it('แปลงครูที่ถูกต้อง + กลุ่มสาระเว้นว่างได้', () => {
    const aoa = [T_HEADER, ['นายสมชาย ใจดี', 'คณิตศาสตร์'], ['นายเอก ไร้สังกัด', '']];
    const res = rowsToTeachers(aoa, new Set());
    expect(res.headerError).toBeUndefined();
    expect(res.valid).toHaveLength(2);
    expect(res.valid[0].data).toMatchObject({ name: 'นายสมชาย ใจดี', area: 'คณิตศาสตร์' });
    expect(res.valid[1].data?.area).toBeUndefined();
    expect(res.addCount).toBe(2);
  });

  it('ตีความกลุ่มสาระแบบยืดหยุ่น + ชื่อซ้ำกับของเดิม = อัปเดต', () => {
    const aoa = [T_HEADER, ['นางวิภา วิทยาศาสตร์', 'วิทยาศาสตร์']];
    const res = rowsToTeachers(aoa, new Set(['นางวิภา วิทยาศาสตร์']));
    expect(res.valid[0].data?.area).toBe('วิทยาศาสตร์และเทคโนโลยี');
    expect(res.valid[0].isUpdate).toBe(true);
    expect(res.updateCount).toBe(1);
  });

  it('จับข้อผิดพลาด: ไม่มีชื่อ, กลุ่มสาระผิด, ชื่อซ้ำในไฟล์', () => {
    const aoa = [
      T_HEADER,
      ['', 'คณิตศาสตร์'],
      ['ครู ก', 'มั่ว'],
      ['ครู ข', 'ภาษาไทย'],
      ['ครู ข', 'ภาษาไทย'],
    ];
    const res = rowsToTeachers(aoa, new Set());
    expect(res.invalid).toHaveLength(3); // ไม่มีชื่อ + กลุ่มสาระผิด + ซ้ำในไฟล์
    expect(res.valid).toHaveLength(1);
  });

  it('แจ้ง headerError เมื่อไม่มีคอลัมน์ชื่อ', () => {
    const res = rowsToTeachers([['กลุ่มสาระ'], ['คณิตศาสตร์']], new Set());
    expect(res.headerError).toContain('ชื่อ-สกุล');
  });
});

describe('นำเข้าห้องเรียนจากตาราง', () => {
  const C_HEADER = ['ระดับชั้น', 'ห้อง', 'แผนการเรียน/กลุ่มการเรียน', 'รุ่น', 'จำนวนนักเรียน'];

  it('แปลงห้องที่ถูกต้อง + รับระดับชั้นเป็นเลขได้', () => {
    const aoa = [C_HEADER, ['ม.1', '1', 'ทั่วไป', '69', 40], ['4', '2', 'ศิลป์-ภาษา', '66', '']];
    const res = rowsToClasses(aoa, new Set());
    expect(res.headerError).toBeUndefined();
    expect(res.valid).toHaveLength(2);
    expect(res.valid[0].data).toMatchObject({ grade: 'ม.1', section: '1', plan: 'ทั่วไป', cohort: '69', students: 40 });
    expect(res.valid[1].data).toMatchObject({ grade: 'ม.4', students: 0 }); // เลข 4 -> ม.4, จำนวนว่าง -> 0
  });

  it('รหัสห้องซ้ำกับของเดิม (ระดับ+ห้อง+รุ่น) = อัปเดต', () => {
    const aoa = [C_HEADER, ['ม.1', '1', 'ทั่วไป', '69', 42]];
    const res = rowsToClasses(aoa, new Set([classKey('ม.1', '1', '69')]));
    expect(res.valid[0].isUpdate).toBe(true);
    expect(res.updateCount).toBe(1);
  });

  it('ห้องเดียวกันแต่คนละรุ่น = คนละห้อง (ไม่ซ้ำ)', () => {
    const aoa = [C_HEADER, ['ม.1', '1', 'ทั่วไป', '69', 40], ['ม.1', '1', 'ทั่วไป', '70', 38]];
    const res = rowsToClasses(aoa, new Set());
    expect(res.valid).toHaveLength(2);
  });

  it('จับข้อผิดพลาด: ระดับชั้นผิด, ไม่มีห้อง, ห้อง+รุ่นซ้ำในไฟล์', () => {
    const aoa = [
      C_HEADER,
      ['ม.9', '1', '', '', 30],
      ['ม.2', '', '', '', 30],
      ['ม.2', '3', '', '69', 30],
      ['ม.2', '3', '', '69', 31],
    ];
    const res = rowsToClasses(aoa, new Set());
    expect(res.invalid).toHaveLength(3);
    expect(res.valid).toHaveLength(1);
  });

  it('แจ้ง headerError เมื่อไม่มีคอลัมน์ห้อง', () => {
    const res = rowsToClasses([['ระดับชั้น'], ['ม.1']], new Set());
    expect(res.headerError).toContain('ห้อง');
  });
});

describe('นำเข้าหน่วยกิตเดิม (จับคู่ห้อง)', () => {
  const CO_HEADER = ['ระดับชั้น', 'ห้อง', 'รุ่น', 'รหัสวิชา', 'ชื่อวิชา', 'หน่วยกิต', 'ประเภท', 'กลุ่มเลือก', 'หมายเหตุ'];
  const classes = [
    { id: 'c1', grade: 'ม.5', section: '1', cohort: '66' },
    { id: 'c2', grade: 'ม.5', section: '1', cohort: '67' }, // ห้องชื่อซ้ำ คนละรุ่น
    { id: 'c3', grade: 'ม.2', section: '3', cohort: '69' },
  ];

  it('จับคู่ห้องด้วยรุ่น + แปลงถูกต้อง', () => {
    const aoa = [CO_HEADER, ['ม.5', '1', '66', 'ว31201', 'ฟิสิกส์ 1', 1.5, 'เพิ่มเติม', 'วิทย์-คณิต', 'ม.4']];
    const res = rowsToCompleted(aoa, classes, new Set());
    expect(res.headerError).toBeUndefined();
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].data).toMatchObject({ classId: 'c1', code: 'ว31201', credits: 1.5, type: 'เพิ่มเติม', group: 'วิทย์-คณิต' });
  });

  it('ห้องชื่อซ้ำหลายรุ่นแต่ไม่ระบุรุ่น = ผิดพลาด', () => {
    const aoa = [CO_HEADER, ['ม.5', '1', '', 'ค31101', 'คณิต', 1, 'พื้นฐาน', '', '']];
    const res = rowsToCompleted(aoa, classes, new Set());
    expect(res.invalid).toHaveLength(1);
    expect(res.invalid[0].errors.join()).toContain('หลายรุ่น');
  });

  it('ไม่พบห้องในระบบ = ผิดพลาด', () => {
    const aoa = [CO_HEADER, ['ม.6', '9', '', 'x', 'x', 1, 'พื้นฐาน', '', '']];
    const res = rowsToCompleted(aoa, classes, new Set());
    expect(res.invalid[0].errors.join()).toContain('ไม่พบห้อง');
  });

  it('รหัสซ้ำในห้องเดิม = อัปเดต', () => {
    const aoa = [CO_HEADER, ['ม.2', '3', '69', 'ท20101', 'ไทย', 1, 'พื้นฐาน', '', '']];
    const res = rowsToCompleted(aoa, classes, new Set(['c3::ท20101']));
    expect(res.valid[0].isUpdate).toBe(true);
    expect(res.updateCount).toBe(1);
  });

  it('แจ้ง headerError เมื่อขาดคอลัมน์จำเป็น', () => {
    const res = rowsToCompleted([['ระดับชั้น', 'ห้อง']], classes, new Set());
    expect(res.headerError).toContain('รหัสวิชา');
  });
});
