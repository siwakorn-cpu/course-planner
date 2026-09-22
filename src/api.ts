// ============================================================
// api.ts — ตัวเชื่อม Backend API (ฐานข้อมูลกลาง)
// ถ้าตั้งค่า VITE_API_URL = ใช้ฐานข้อมูลกลาง; ถ้าไม่ตั้ง = ใช้ localStorage (โหมดในเครื่อง)
// ============================================================
import type { AppData } from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined;

/** ใช้ฐานข้อมูลกลางหรือไม่ (มีการตั้งค่า VITE_API_URL) */
export const useRemote = !!BASE;

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) h['Authorization'] = `Bearer ${TOKEN}`;
  return h;
}

/** ดึงข้อมูลทั้งหมดจากเซิร์ฟเวอร์ (คืน null ถ้ายังไม่มีข้อมูล) */
export async function apiGetData(): Promise<Partial<AppData> | null> {
  const r = await fetch(`${BASE}/api/data`, { headers: headers() });
  if (!r.ok) throw new Error(`โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ (${r.status})`);
  const j = (await r.json()) as { data: Partial<AppData> | null };
  return j.data ?? null;
}

/** บันทึกข้อมูลทั้งหมดขึ้นเซิร์ฟเวอร์ */
export async function apiPutData(data: AppData): Promise<void> {
  const r = await fetch(`${BASE}/api/data`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ data }),
  });
  if (!r.ok) throw new Error(`บันทึกข้อมูลไปเซิร์ฟเวอร์ไม่สำเร็จ (${r.status})`);
}
