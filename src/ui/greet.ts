// Saate (ve güne) göre küçük, sıcak karşılama cümleleri. Her açılışta aynı saat diliminden rastgele biri.
import { PEOPLE, state } from './state';

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function greeting(d = new Date()): string {
  const n = PEOPLE[state.me].name;
  const h = d.getHours() + d.getMinutes() / 60;
  const wd = d.getDay(); const weekend = wd === 0 || wd === 6;
  const m = d.getMonth(), day = d.getDate();
  if (m === 0 && day === 9) return pick(['Bugün o gün, aşkım', `Sonunda 9 Ocak, ${n}`, 'Bugün gökyüzü bizim']);
  if (h < 3) return pick(['Bu saatte niye uyanıksın aşk?', `Uyuyamadın mı ${n}?`, 'Gece yarısı aklına mı düştüm?', 'Herkes uyuyor, sen buradasın']);
  if (h < 5.5) return pick(['Bu saatte uyanık mısın? Noldu aşkım?', 'Gökyüzü bile uyuyor şimdi', `${n}, biraz uyu artık`, 'Rüyanda mı gördün beni?']);
  if (h < 9) return pick(weekend
    ? ['Hafta sonu sabahı, erken kalktın aşk', 'Günaydın aşkım, uykunu aldın mı?', `Günaydın ${n}`]
    : ['Günaydın aşkım', `Günaydın ${n}, kahven hazır mı?`, 'Erkencisin bugün, günaydın', 'Günaydın, güzel bir gün olsun']);
  if (h < 12) return pick(['Günaydın aşk', `Güzel bir sabah, ${n}`, 'Sabahın en güzel hali', weekend ? 'Tembel bir sabah mı?' : 'Kolay gelsin aşkım']);
  if (h < 14) return pick(['İyi öğlenler aşkım', `Öğlen arası mı, ${n}?`, 'Bir şeyler yedin mi aşk?']);
  if (h < 18) return pick(['Tünaydın aşkım', 'Günün nasıl geçiyor aşk?', `Az kaldı ${n}, dayan`, 'Aklımdasın, bilesin']);
  if (h < 21) return pick(['İyi akşamlar aşkım', 'Akşam oldu, gökyüzü seninle güzel', `Hoş geldin eve ${n}`, 'Yorulmuşsundur, gel dinlen']);
  return pick(['Yorgun musun aşk?', `Gece bizim, ${n}`, 'Yatmadan önce bir bakayım dedin', 'İyi geceler demeden olmaz']);
}

