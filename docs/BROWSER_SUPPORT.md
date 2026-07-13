# Tarayıcı desteği

- Android Chrome/Edge/Samsung Internet: WebCodecs uygun olduğunda birincil yol.
- iPhone/iPad Safari ve iOS üzerindeki diğer tarayıcılar: gerçek codec desteği çalışma anında test edilir; destek yoksa FFmpeg fallback sunulur.
- Masaüstü Chrome/Edge/Safari: WebCodecs öncelikli.
- Firefox: WebCodecs/H.264 desteğine göre WebCodecs veya FFmpeg fallback.

Büyük dosyalarda bellek sınırı cihaza ve tarayıcıya bağlıdır.
