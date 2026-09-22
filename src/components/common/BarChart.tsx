// BarChart — กราฟแท่งแนวนอนแบบเบา ไม่พึ่งไลบรารีภายนอก
// คลิกแต่ละแถวได้ถ้าส่ง onSelect เข้ามา (ใช้กางดูรายละเอียด)
export interface BarDatum {
  label: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  unit?: string;
  onSelect?: (label: string) => void;
  activeLabel?: string | null;
}

export function BarChart({ data, unit = '', onSelect, activeLabel }: Props) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const clickable = !!onSelect;
  return (
    <div className="bar-chart">
      {data.map((d) => {
        const active = activeLabel === d.label;
        const rowStyle = clickable
          ? { cursor: 'pointer', borderRadius: 6, background: active ? 'var(--surface-2)' : 'transparent' }
          : undefined;
        return (
          <div
            className="bar-row"
            key={d.label}
            style={rowStyle}
            onClick={onSelect ? () => onSelect(d.label) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={
              onSelect
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(d.label);
                    }
                  }
                : undefined
            }
          >
            <span className="bar-label" title={d.label}>
              {clickable && <span aria-hidden style={{ marginRight: 4 }}>{active ? '▾' : '▸'}</span>}
              {d.label}
            </span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }} aria-hidden />
            </div>
            <span className="bar-value">
              {d.value}
              {unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}
