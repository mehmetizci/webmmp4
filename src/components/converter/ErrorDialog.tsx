'use client';

import { AlertTriangle, RotateCcw, X } from 'lucide-react';

export function ErrorDialog({ message, canFallback, onClose, onFallback }: { message: string; canFallback: boolean; onClose: () => void; onFallback: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="error-title">
        <div className="warning-icon"><AlertTriangle size={34} /></div>
        <h2 id="error-title">Dönüşüm tamamlanamadı</h2>
        <p>{canFallback ? 'WebCodecs yöntemi bu videoyu işleyemedi. FFmpeg WebAssembly ile yeniden deneyebilirsiniz.' : 'Dönüşüm sırasında bir hata oluştu.'}</p>
        <pre>{message}</pre>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={onClose}><X size={18} /> Kapat</button>
          {canFallback && <button type="button" className="button primary" onClick={onFallback}><RotateCcw size={18} /> FFmpeg ile Tekrar Dene</button>}
        </div>
      </section>
    </div>
  );
}
