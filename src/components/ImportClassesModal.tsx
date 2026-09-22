// ImportClassesModal — แสดงผลตรวจสอบไฟล์ Excel ห้องเรียนก่อนยืนยันนำเข้า
import type { AppDataApi } from '../hooks/useAppData';
import type { ClassParseResult } from '../importExcel';
import { Modal } from './common/Modal';

interface Props {
  result: ClassParseResult;
  fileName: string;
  api: AppDataApi;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export function ImportClassesModal({ result, fileName, api, onClose, onDone }: Props) {
  const confirm = () => {
    api.importClasses(result.valid.map((r) => r.data!));
    onDone(`นำเข้าสำเร็จ: เพิ่มใหม่ ${result.addCount} · อัปเดต ${result.updateCount} ห้อง`);
    onClose();
  };

  return (
    <Modal title={`นำเข้าห้องเรียนจาก: ${fileName}`} onClose={onClose}>
      {result.headerError ? (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {result.headerError}
          <p className="muted" style={{ marginBottom: 0 }}>
            ตรวจสอบหัวคอลัมน์ให้ครบ หรือกด “แม่แบบ Excel” เพื่อใช้รูปแบบที่ถูกต้อง
          </p>
        </div>
      ) : (
        <>
          <div className="row-gap" style={{ gap: '1.25rem', marginBottom: '0.75rem' }}>
            <div className="stat"><span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--success)' }}>{result.addCount}</span><span className="stat-label">เพิ่มใหม่</span></div>
            <div className="stat"><span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--warning)' }}>{result.updateCount}</span><span className="stat-label">อัปเดตทับ</span></div>
            <div className="stat"><span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--danger)' }}>{result.invalid.length}</span><span className="stat-label">ผิดพลาด (ข้าม)</span></div>
          </div>

          <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>แถว</th>
                  <th>ห้อง</th>
                  <th>แผน/กลุ่ม</th>
                  <th>รุ่น</th>
                  <th className="num">นร.</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => {
                  const ok = r.errors.length === 0;
                  return (
                    <tr key={r.rowNumber}>
                      <td className="num">{r.rowNumber}</td>
                      <td>{r.data ? `${r.data.grade}/${r.data.section}` : <span className="muted">{r.errors.join('; ')}</span>}</td>
                      <td>{r.data?.plan || <span className="muted">—</span>}</td>
                      <td>{r.data?.cohort || <span className="muted">—</span>}</td>
                      <td className="num">{r.data?.students ?? ''}</td>
                      <td>
                        {ok ? (
                          <span className={`badge ${r.isUpdate ? 'warn' : 'ok'}`}>{r.isUpdate ? 'อัปเดต' : 'ใหม่'}</span>
                        ) : (
                          <span className="badge over" title={r.errors.join('; ')}>ผิดพลาด</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.invalid.length > 0 && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              * แถวที่ผิดพลาดจะถูกข้าม (นำเมาส์ชี้ที่ป้าย “ผิดพลาด” เพื่อดูเหตุผล)
            </p>
          )}
        </>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        {!result.headerError && (
          <button className="btn primary" onClick={confirm} disabled={result.valid.length === 0}>
            ยืนยันนำเข้า {result.valid.length} ห้อง
          </button>
        )}
      </div>
    </Modal>
  );
}
