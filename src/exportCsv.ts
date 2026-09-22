// exportCsv — ช่วยสร้างและดาวน์โหลดไฟล์ CSV (เปิดใน Excel ได้)
// ใส่ BOM เพื่อให้ Excel อ่านภาษาไทย (UTF-8) ถูกต้อง

function escapeCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(','));
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
