// TabNav — แถบแท็บหลักของแอป
export const TABS = [
  { id: 'dashboard', label: 'ภาพรวม', icon: '📊' },
  { id: 'subjects', label: 'คลังรายวิชา', icon: '📚' },
  { id: 'classes', label: 'ห้องเรียน', icon: '🏫' },
  { id: 'offerings', label: 'จัดรายวิชา', icon: '🗂️' },
  { id: 'teachers', label: 'ครูผู้สอน', icon: '🧑‍🏫' },
  { id: 'credits', label: 'สรุปหน่วยกิต', icon: '✅' },
  { id: 'cumulative', label: 'หน่วยกิตรวมสะสม', icon: '🎯' },
  { id: 'workload', label: 'ภาระงาน & อัตรากำลัง', icon: '👩‍🏫' },
  { id: 'settings', label: 'ตั้งค่า', icon: '⚙️' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
}

export function TabNav({ active, onChange }: Props) {
  return (
    <nav className="tab-nav" aria-label="เมนูหลัก">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={t.id === active ? 'active' : ''}
          onClick={() => onChange(t.id)}
          aria-current={t.id === active ? 'page' : undefined}
        >
          <span aria-hidden>{t.icon}</span> {t.label}
        </button>
      ))}
    </nav>
  );
}
