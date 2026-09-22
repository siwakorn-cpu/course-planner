// SettingsPanel — ตั้งค่า: ค่าการคำนวณ, เกณฑ์หน่วยกิต, สำรอง/นำเข้าข้อมูล
import { useRef, useState } from 'react';
import type { AppDataApi } from '../hooks/useAppData';
import type { Level, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { downloadBackup, importFromJson } from '../storage';
import { ConfirmDialog, type ConfirmState } from './common/ConfirmDialog';

interface Props {
  api: AppDataApi;
}

const LEVELS: Level[] = ['ม.ต้น', 'ม.ปลาย'];

export function SettingsPanel({ api }: Props) {
  const { data } = api;
  // แก้ไขบนสำเนา แล้วกดบันทึกทีเดียว
  const [draft, setDraft] = useState<Settings>(() => structuredClone(data.settings));
  const [msg, setMsg] = useState<string>('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [newPlan, setNewPlan] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const num = (v: string) => (v === '' ? 0 : Number(v));

  const setReq = (level: Level, key: keyof Settings['requirements'][Level], value: number) => {
    setDraft((d) => ({
      ...d,
      requirements: { ...d.requirements, [level]: { ...d.requirements[level], [key]: value } },
    }));
  };

  const saveSettings = () => {
    api.updateSettings(draft);
    setMsg('บันทึกการตั้งค่าแล้ว ✓');
    setTimeout(() => setMsg(''), 2500);
  };

  const resetSettings = () => {
    const fresh = structuredClone(DEFAULT_SETTINGS);
    setDraft(fresh);
    api.updateSettings(fresh);
    setMsg('คืนค่าตั้งต้นแล้ว ✓');
    setTimeout(() => setMsg(''), 2500);
  };

  const onImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      let imported;
      try {
        imported = importFromJson(String(reader.result));
      } catch (err) {
        setMsg('นำเข้าไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ไฟล์ไม่ถูกต้อง'));
        setTimeout(() => setMsg(''), 4000);
        return;
      }
      setConfirmState({
        title: 'นำเข้าข้อมูล',
        message: 'การนำเข้าจะเขียนทับข้อมูลปัจจุบันทั้งหมด (รายวิชา ห้องเรียน การจัดสอน และการตั้งค่า)\nดำเนินการต่อหรือไม่?',
        confirmLabel: 'นำเข้า (เขียนทับ)',
        danger: true,
        onConfirm: () => {
          api.replaceAll(imported!);
          setDraft(structuredClone(imported!.settings));
          setMsg('นำเข้าข้อมูลสำเร็จ ✓');
          setTimeout(() => setMsg(''), 2500);
        },
      });
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div className="page-head">
        <h2>⚙️ ตั้งค่า</h2>
        <p>ปรับค่าการคำนวณ เกณฑ์การจบ และสำรอง/กู้คืนข้อมูล</p>
      </div>

      {msg && <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--success)', color: 'var(--success)' }}>{msg}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>ค่าการคำนวณ</h3>
        <div className="form-row">
          <div className="field">
            <label>1 หน่วยกิต = กี่คาบ/สัปดาห์</label>
            <input type="number" min={0.5} step={0.5} value={draft.periodsPerCredit} onChange={(e) => setDraft({ ...draft, periodsPerCredit: num(e.target.value) })} />
          </div>
          <div className="field">
            <label>ภาระงานสอนมาตรฐาน (คาบ/คน/สัปดาห์)</label>
            <input type="number" min={1} step={1} value={draft.teacherLoad} onChange={(e) => setDraft({ ...draft, teacherLoad: num(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>เกณฑ์หน่วยกิตการจบ</h3>
        <p className="muted" style={{ marginTop: 0 }}>ใส่ 0 = ไม่ใช้เกณฑ์นั้น (เช่น ม.ต้นไม่บังคับหน่วยกิตเพิ่มเติม)</p>
        {LEVELS.map((level) => {
          const r = draft.requirements[level];
          return (
            <div key={level} style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.4rem' }}>{level}</h4>
              <div className="form-row">
                <div className="field"><label>พื้นฐาน ≥ (นก.)</label><input type="number" min={0} value={r.basic} onChange={(e) => setReq(level, 'basic', num(e.target.value))} /></div>
                <div className="field"><label>เพิ่มเติม ≥ (นก.)</label><input type="number" min={0} value={r.additionalMin} onChange={(e) => setReq(level, 'additionalMin', num(e.target.value))} /></div>
                <div className="field"><label>รวมขั้นต่ำ ≥ (นก.)</label><input type="number" min={0} value={r.totalMin} onChange={(e) => setReq(level, 'totalMin', num(e.target.value))} /></div>
                <div className="field"><label>รวมไม่เกิน ≤ (นก.)</label><input type="number" min={0} value={r.totalMax} onChange={(e) => setReq(level, 'totalMax', num(e.target.value))} /></div>
                <div className="field"><label>กิจกรรมพัฒนาผู้เรียน (ชม.)</label><input type="number" min={0} value={r.activityHours} onChange={(e) => setReq(level, 'activityHours', num(e.target.value))} /></div>
              </div>
            </div>
          );
        })}
        <div className="row-gap">
          <button className="btn primary" onClick={saveSettings}>บันทึกการตั้งค่า</button>
          <button className="btn" onClick={resetSettings}>คืนค่าตั้งต้น (หลักสูตร 2551)</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>แผนการเรียน & กลุ่มการเรียน</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          รายการนี้จะให้เลือกในฟอร์มห้องเรียน — ม.ปลายเลือก “แผนการเรียน”, ม.ต้นเลือก “กลุ่มการเรียน”
        </p>
        <div className="form-row">
          <div>
            <h4 style={{ margin: '0 0 0.5rem' }}>แผนการเรียน (ม.ปลาย)</h4>
            <div className="row-gap" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
              {data.plans.length === 0 && <span className="muted">ยังไม่มีรายการ</span>}
              {data.plans.map((p) => (
                <div key={p} className="row-gap" style={{ justifyContent: 'space-between', background: 'var(--surface-2)', borderRadius: 8, padding: '0.3rem 0.6rem' }}>
                  <span>{p}</span>
                  <button className="btn small ghost" title="ลบ" onClick={() => api.removeTrack('ม.ปลาย', p)}>✕</button>
                </div>
              ))}
            </div>
            <div className="row-gap" style={{ marginTop: '0.5rem' }}>
              <input value={newPlan} onChange={(e) => setNewPlan(e.target.value)} placeholder="เพิ่มแผนการเรียน" style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') { api.addTrack('ม.ปลาย', newPlan); setNewPlan(''); } }} />
              <button className="btn small primary" onClick={() => { api.addTrack('ม.ปลาย', newPlan); setNewPlan(''); }}>เพิ่ม</button>
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.5rem' }}>กลุ่มการเรียน (ม.ต้น)</h4>
            <div className="row-gap" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
              {data.groups.length === 0 && <span className="muted">ยังไม่มีรายการ</span>}
              {data.groups.map((g) => (
                <div key={g} className="row-gap" style={{ justifyContent: 'space-between', background: 'var(--surface-2)', borderRadius: 8, padding: '0.3rem 0.6rem' }}>
                  <span>{g}</span>
                  <button className="btn small ghost" title="ลบ" onClick={() => api.removeTrack('ม.ต้น', g)}>✕</button>
                </div>
              ))}
            </div>
            <div className="row-gap" style={{ marginTop: '0.5rem' }}>
              <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="เพิ่มกลุ่มการเรียน" style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') { api.addTrack('ม.ต้น', newGroup); setNewGroup(''); } }} />
              <button className="btn small primary" onClick={() => { api.addTrack('ม.ต้น', newGroup); setNewGroup(''); }}>เพิ่ม</button>
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
          หมายเหตุ: การลบออกจากรายการไม่กระทบห้องที่ใช้ค่านั้นอยู่แล้ว (ยังแสดงชื่อเดิม) เพียงแต่จะไม่ขึ้นให้เลือกใหม่
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>สำรอง / กู้คืนข้อมูล</h3>
        <p className="muted" style={{ marginTop: 0 }}>ส่งออกข้อมูลทั้งหมด (รายวิชา ห้องเรียน การจัดสอน และการตั้งค่า) เป็นไฟล์ JSON เพื่อสำรอง หรือย้ายเครื่อง</p>
        <div className="row-gap">
          <button className="btn" onClick={() => downloadBackup(data)}>⬇️ Export ข้อมูลทั้งหมด (JSON)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ Import จากไฟล์ JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="card" style={{ borderColor: 'var(--danger)' }}>
        <h3 className="section-title" style={{ marginTop: 0, color: 'var(--danger)' }}>ล้างข้อมูล & เริ่มใหม่</h3>
        <p className="muted" style={{ marginTop: 0 }}>ลบข้อมูลทั้งหมดในเครื่องนี้ แล้วโหลดชุดข้อมูลตัวอย่างกลับมา (แนะนำให้ Export สำรองไว้ก่อน)</p>
        <button
          className="btn danger"
          onClick={() =>
            setConfirmState({
              title: 'ล้างข้อมูลทั้งหมด',
              message: 'ยืนยันล้างข้อมูลทั้งหมดในเครื่องนี้ แล้วโหลดชุดข้อมูลตัวอย่างกลับมา ?\n(ควร Export สำรองไว้ก่อน)',
              confirmLabel: 'ล้างข้อมูล',
              danger: true,
              onConfirm: () => {
                api.resetAll();
                setDraft(structuredClone(DEFAULT_SETTINGS));
                setMsg('ล้างข้อมูลและโหลดตัวอย่างใหม่แล้ว ✓');
                setTimeout(() => setMsg(''), 2500);
              },
            })
          }
        >
          🗑️ ล้างข้อมูลทั้งหมด & โหลดตัวอย่าง
        </button>
      </div>

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}
    </div>
  );
}
