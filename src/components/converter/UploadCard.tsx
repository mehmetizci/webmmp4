'use client';

import { FileVideo2, UploadCloud, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { formatBytes } from '@/lib/utils/format';

interface Props {
  file: File | null;
  disabled: boolean;
  onSelect: (file: File | null) => void;
  onClear: () => void;
}

export function UploadCard({ file, disabled, onSelect, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <section className="card upload-card">
      {!file ? (
        <button
          type="button"
          className={`dropzone ${dragging ? 'is-dragging' : ''}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onSelect(event.dataTransfer.files[0] ?? null);
          }}
        >
          <UploadCloud size={42} />
          <strong>WebM dosyanızı buraya bırakın</strong>
          <span>veya dosya seçmek için dokunun</span>
          <small>Yalnızca .webm dosyaları desteklenir</small>
        </button>
      ) : (
        <div className="file-row">
          <div className="file-icon"><FileVideo2 size={28} /></div>
          <div className="file-copy">
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)}</span>
          </div>
          <button type="button" className="icon-button" onClick={onClear} disabled={disabled} aria-label="Dosyayı kaldır"><X size={20} /></button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="video/webm,.webm" hidden onChange={(event) => onSelect(event.target.files?.[0] ?? null)} />
    </section>
  );
}
