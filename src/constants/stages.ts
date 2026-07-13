import type { ConversionStage } from '@/lib/converters/types';
export const STAGE_LABELS: Record<ConversionStage, string> = {
  idle: 'Hazır', analyzing: 'Analiz ediliyor', 'loading-engine': 'Motor yükleniyor',
  preparing: 'Hazırlanıyor', converting: 'Dönüştürülüyor', finalizing: 'Sonlandırılıyor',
  completed: 'Tamamlandı', cancelled: 'İptal edildi', error: 'Hata',
};
