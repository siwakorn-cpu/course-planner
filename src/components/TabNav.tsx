// TabNav — แถบแท็บหลักของแอป
export const TABS = [
  { id: 'dashboard', label: 'ภาพรวม', icon: '📊' },
  { id: 'subjects', label: 'คลังรายวิชา', icon: '📚' },
  { id: 'classes', label: 'ห้องเรียน', icon: '🏫' },
  { id: 'offerings', label: 'จัดรายวิชา', icon: '🗂️' },
  { id: 'coupled', label: 'จับคู่ห้องควบ', icon: '🔗' },
  { id: 'offered', label: 'แสดงรายวิชาที่เปิดสอน', icon: '📋' },
  { id: 'teachers', label: 'ครูผู้สอน', icon: '🧑‍🏫' },
  { id: 'cumulative', label: 'หน่วยกิตรวมสะสม', icon: '🎯' },
  { id: 'workload', label: 'ภาระงาน & อัตรากำลัง', icon: '👩‍🏫' },
  { id: 'settings', label: 'ตั้งค่า', icon: '⚙️' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

const MANAGEMENT_IDS = new Set<TabId>(['subjects', 'classes', 'teachers']);
const MANAGEMENT_TABS = TABS.filter((tab) => MANAGEMENT_IDS.has(tab.id));
const MAIN_TABS = TABS.filter((tab) => !MANAGEMENT_IDS.has(tab.id) && tab.id !== 'dashboard');

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
}

export function TabNav({ active, onChange }: Props) {
  const renderTab = (tab: (typeof TABS)[number], className = '') => (
    <button
      key={tab.id}
      className={`${className}${tab.id === active ? ' active' : ''}`.trim()}
      onClick={() => onChange(tab.id)}
      aria-current={tab.id === active ? 'page' : undefined}
    >
      <span aria-hidden>{tab.icon}</span> {tab.label}
    </button>
  );

  const managementActive = MANAGEMENT_IDS.has(active);

  return (
    <nav className="tab-nav" aria-label="เมนูหลัก">
      {renderTab(TABS[0])}
      <div className={`tab-menu${managementActive ? ' active' : ''}`}>
        <button className="tab-menu-trigger" type="button" aria-haspopup="true">
          <span aria-hidden>🗃️</span> จัดการข้อมูล <span className="tab-menu-caret" aria-hidden>▾</span>
        </button>
        <div className="tab-submenu" aria-label="จัดการข้อมูล">
          {MANAGEMENT_TABS.map((tab) => renderTab(tab, 'tab-submenu-item'))}
        </div>
      </div>
      {MAIN_TABS.map((tab) => renderTab(tab))}
    </nav>
  );
}
