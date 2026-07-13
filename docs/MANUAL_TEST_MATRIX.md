# Manuel test matrisi

Her sürümde şu senaryolar doğrulanır:

1. VP8 WebM, sessiz → H.264 MP4.
2. VP9 WebM, Opus sesli → H.264 + AAC MP4.
3. WebCodecs desteklenmeyen config → FFmpeg modalı.
4. İptal → worker, wake lock ve geçici dosyalar temizlenir.
5. Android Chrome, iPhone Safari, masaüstü Chrome/Edge/Firefox.
6. Düşük/standart/yüksek kalitede gerçek bitrate sonucu kaydedilir.
