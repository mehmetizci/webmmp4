import { CheckCircle2, LockKeyhole } from 'lucide-react';

export function PrivacyCard() {
  return <section className="card privacy-card"><div className="privacy-icon"><LockKeyhole size={25} /></div><div><h3>Videonuz güvende</h3><p>Seçtiğiniz video herhangi bir sunucuya yüklenmez. Dönüşüm cihazınızın tarayıcısında gerçekleşir.</p><ul><li><CheckCircle2 size={17} /> Sunucuya yükleme yok</li><li><CheckCircle2 size={17} /> Video saklanmaz</li><li><CheckCircle2 size={17} /> Üyelik gerekmez</li></ul></div></section>;
}
