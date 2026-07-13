export function SupportNotice({ reason }: { reason?: string }) { if (!reason) return null; return <p className="support-notice">WebCodecs kullanılamıyor: {reason} FFmpeg WebAssembly seçildi.</p>; }
