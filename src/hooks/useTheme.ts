// ============================================================
// useTheme — สลับโหมดสว่าง/มืด และจำค่าไว้ใน localStorage
// ============================================================
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'course-planner:theme';

function getInitial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* เพิกเฉยถ้าอ่าน localStorage ไม่ได้ */
  }
  // ตามค่าระบบเป็นค่าเริ่มต้น
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* เพิกเฉย */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  return { theme, toggle };
}
