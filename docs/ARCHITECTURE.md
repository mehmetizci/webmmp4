# Mimari

Uygulama tamamen istemci tarafında çalışır. `useConverter` orkestrasyonu yönetir; motorlar `Converter` arayüzünü uygular. WebCodecs yolu Mediabunny yüksek seviyeli `Conversion` API'sini, uyumluluk yolu FFmpeg WebAssembly'yi kullanır. UI, hook, medya yardımcıları, hata yönetimi, progress ve debug katmanları ayrıdır.
