import { useState } from 'react';
import { useAppData } from './hooks/useAppData';
import { useTheme } from './hooks/useTheme';
import { TabNav, type TabId } from './components/TabNav';
import { Dashboard } from './components/Dashboard';
import { Subjects } from './components/Subjects';
import { Classes } from './components/Classes';
import { CoupledClasses } from './components/CoupledClasses';
import { Offerings } from './components/Offerings';
import { OfferedCourses } from './components/OfferedCourses';
import { Teachers } from './components/Teachers';
import { CumulativeCredits } from './components/CumulativeCredits';
import { Workload } from './components/Workload';
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  const api = useAppData();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<TabId>('dashboard');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">
            <span className="logo" aria-hidden>🎓</span> ระบบจัดรายวิชานักเรียน
          </h1>
          <span className="header-spacer" />
          <button className="theme-toggle" onClick={toggle} aria-label="สลับโหมดสว่าง/มืด">
            {theme === 'dark' ? '☀️ สว่าง' : '🌙 มืด'}
          </button>
        </div>
        {!api.loading && !api.error && <TabNav active={tab} onChange={setTab} />}
      </header>

      {api.loading ? (
        <main className="app-main">
          <div className="empty">⏳ กำลังโหลดข้อมูล…</div>
        </main>
      ) : api.error ? (
        <main className="app-main">
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--danger)' }}>เชื่อมต่อฐานข้อมูลไม่สำเร็จ</h3>
            <p className="muted">{api.error}</p>
            <p className="muted" style={{ marginBottom: 0 }}>ตรวจสอบว่าเซิร์ฟเวอร์ (Backend) ทำงานอยู่ และตั้งค่า VITE_API_URL ถูกต้อง แล้วลองรีเฟรชหน้าอีกครั้ง</p>
          </div>
        </main>
      ) : (
      <main className="app-main">
        {tab === 'dashboard' && <Dashboard api={api} goto={setTab} />}
        {tab === 'subjects' && <Subjects api={api} />}
        {tab === 'classes' && <Classes api={api} />}
        {tab === 'coupled' && <CoupledClasses api={api} />}
        {tab === 'offerings' && <Offerings api={api} />}
        {tab === 'offered' && <OfferedCourses api={api} />}
        {tab === 'teachers' && <Teachers api={api} />}
        {tab === 'cumulative' && <CumulativeCredits api={api} />}
        {tab === 'workload' && <Workload api={api} />}
        {tab === 'settings' && <SettingsPanel api={api} />}
      </main>
      )}
    </div>
  );
}
