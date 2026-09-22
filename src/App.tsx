import { useState } from 'react';
import { useAppData } from './hooks/useAppData';
import { useTheme } from './hooks/useTheme';
import { TabNav, type TabId } from './components/TabNav';
import { Dashboard } from './components/Dashboard';
import { Subjects } from './components/Subjects';
import { Classes } from './components/Classes';
import { Offerings } from './components/Offerings';
import { Teachers } from './components/Teachers';
import { CreditSummary } from './components/CreditSummary';
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
        <TabNav active={tab} onChange={setTab} />
      </header>

      <main className="app-main">
        {tab === 'dashboard' && <Dashboard api={api} goto={setTab} />}
        {tab === 'subjects' && <Subjects api={api} />}
        {tab === 'classes' && <Classes api={api} />}
        {tab === 'offerings' && <Offerings api={api} />}
        {tab === 'teachers' && <Teachers api={api} />}
        {tab === 'credits' && <CreditSummary api={api} />}
        {tab === 'cumulative' && <CumulativeCredits api={api} />}
        {tab === 'workload' && <Workload api={api} />}
        {tab === 'settings' && <SettingsPanel api={api} />}
      </main>
    </div>
  );
}
