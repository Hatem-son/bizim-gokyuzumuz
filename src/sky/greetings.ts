import { PEOPLE } from '../lib/people';
import { STORAGE_KEYS, store } from '../lib/storage';
import type { Who } from '../types';

/** Her zaman diliminde gösterilebilecek okyanus ve yön bulma karşılamaları */
const OCEAN_GREETINGS: Record<Who, string[]> = {
  hamham: [
    `${PEOPLE.beto.name}, yıldızlardan yön buluyor, yolu sana çıkıyor`,
    `Okyanus uzak olsa da ${PEOPLE.beto.name} yakın`,
    `Pusulan ${PEOPLE.beto.name}, kaybolmazsın`,
    `Bu gece rüzgar ${PEOPLE.beto.abl} sana selam getirdi`,
    'Aranızdaki yol, yıldızlarla işaretli',
  ],
  beto: [
    `${PEOPLE.hamham.name} yıldızlara bakıp yolunu sana çeviriyor`,
    `Okyanus uzak olsa da ${PEOPLE.hamham.name} yakın`,
    `Pusulan ${PEOPLE.hamham.name}, kaybolmazsın`,
    `Bu gece rüzgar ${PEOPLE.hamham.abl} sana selam getirdi`,
    'Aranızdaki yol, yıldızlarla işaretli',
  ],
};

const GREETINGS: Record<Who, [number, string[]][]> = {
  beto: [
    [5, ['Uyuyamadın mı bebeğim?', 'Hâlâ uyanık mısın güzelim?', 'Gece kuşum benim', 'Uykun mu kaçtı prenses?', 'Yıldızlar seni bekliyordu']],
    [11, ['Günaydın prenses', 'Günaydın güzelim', 'Günaydın bebeğim', 'Günaydın aşkım', 'Sabahın güzel olsun bebiş', 'Uyandın mı güzellik?']],
    [17, ['İyi günler güzelim', 'Naber aşkım?', 'Naber güzellik?', 'Merhaba prenses', 'Nasılsın bebiş?', 'Seni düşünüyordum bebeğim', 'Hoş geldin güzelim']],
    [21, ['İyi akşamlar sevgilim', 'Naber bebeğim?', 'Akşamın güzel geçti mi aşkım?', 'İyi akşamlar prenses', 'Hoş geldin güzellik', 'Bugün nasıldı bebiş?']],
    [24.01, ['İyi geceler bebeğim', 'İyi geceler prenses', 'Tatlı rüyalar güzelim', 'Yıldızlar sana iyi geceler diyor', 'Bu gece rüyamda görüşürüz aşkım', 'İyi geceler bebiş']],
  ],
  hamham: [
    [5, ['Hâlâ uyanık mısın aşkım?', 'Uyuyamadın mı Ham ham?', 'Gece yarısı bekçisi', 'Uykun mu kaçtı aşkım?', 'Yıldızlar seni bekliyordu']],
    [11, ['Günaydın Ham ham', 'Günaydın aşkım', 'Günaydın yakışıklım', 'Sabahın güzel olsun aşkım', 'Uyandın mı Ham ham?']],
    [17, ['İyi günler sevgilim', 'Naber aşkım?', 'Naber Ham ham?', 'Merhaba aşkım', 'Nasılsın Ham ham?', 'Seni düşünüyordum aşkım', 'Hoş geldin aşkım']],
    [21, ['İyi akşamlar aşkım', 'Naber Ham ham?', 'Akşamın güzel geçti mi aşkım?', 'Hoş geldin sevgilim', 'Bugün nasıldı Ham ham?']],
    [24.01, ['İyi geceler Ham ham', 'İyi geceler aşkım', 'Tatlı rüyalar Ham ham', 'Yıldızlar sana iyi geceler diyor', 'Bu gece rüyamda görüşürüz aşkım']],
  ],
};

export function pickGreeting(who: Who, hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const last = store.get<string>(STORAGE_KEYS.greet, '');
  const bucket = GREETINGS[who].find(([limit]) => h < limit) ?? GREETINGS[who][0];
  const combined = [...bucket[1], ...OCEAN_GREETINGS[who]];
  const candidates = combined.filter((item) => item !== last);
  const pool = candidates.length > 0 ? candidates : combined;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  store.set(STORAGE_KEYS.greet, picked);
  return picked;
}

const dayFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
});

export function formatDayLine(date = new Date()): string {
  return dayFormatter.format(date).toLocaleUpperCase('tr-TR');
}

