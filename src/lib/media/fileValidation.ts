export function validateWebMFile(file: File): string | null {
  const validName = file.name.toLowerCase().endsWith('.webm');
  const validType = !file.type || file.type === 'video/webm';
  if (!validName && !validType) return 'Lütfen WebM formatında bir video seçin.';
  if (file.size <= 0) return 'Seçilen dosya boş.';
  return null;
}
