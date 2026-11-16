import type { PersonMeta, Who } from '../types';

export const PEOPLE: Record<Who, PersonMeta> = {
  hamham: {
    who: 'hamham',
    name: 'Ham ham',
    dat: "Ham ham'a",
    abl: "Ham ham'dan",
    gen: "Ham ham'ın",
    color: 'blue',
    sign: '♋︎',
    zodiacLabel: 'YENGEÇ',
  },
  beto: {
    who: 'beto',
    name: 'Beto',
    dat: "Beto'ya",
    abl: "Beto'dan",
    gen: "Beto'nun",
    color: 'pink',
    sign: '♑︎',
    zodiacLabel: 'OĞLAK',
  },
};

export function otherWho(w: Who): Who {
  return w === 'hamham' ? 'beto' : 'hamham';
}

export interface ConstellationSpec {
  id: string;
  who: Who;
  cls: 'blue' | 'pink';
  label: string;
  glyph: string;
  stars: [number, number, number][];
  lines: [number, number][];
}

export const CONSTELLATIONS: ConstellationSpec[] = [
  {
    id: 'cancer',
    who: 'hamham',
    cls: 'blue',
    label: 'YENGEÇ · HAM HAM',
    glyph: '♋︎',
    stars: [
      [52, 6, 2.2],
      [48, 36, 2],
      [52, 52, 2.6],
      [22, 88, 2.4],
      [76, 84, 3],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
  },
  {
    id: 'capricorn',
    who: 'beto',
    cls: 'pink',
    label: 'OĞLAK · BETO',
    glyph: '♑︎',
    stars: [
      [94, 8, 2.8],
      [88, 20, 3],
      [72, 64, 2.2],
      [64, 82, 2.2],
      [42, 76, 2.2],
      [6, 30, 3],
      [16, 34, 2.6],
      [32, 38, 2],
      [52, 32, 2],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 1],
    ],
  },
];

export function renderConstellationCardSvg(who: Who): string {
  const spec = CONSTELLATIONS.find((c) => c.who === who);
  if (!spec) return '';
  const map = ([x, y]: [number, number, number]): [number, number] => [10 + x * 0.8, 6 + y * 0.68];
  const lines = spec.lines
    .map(([a, b]) => {
      const [x1, y1] = map(spec.stars[a]);
      const [x2, y2] = map(spec.stars[b]);
      return `<line pathLength="1" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    })
    .join('');
  const circles = spec.stars
    .map((s) => {
      const [x, y] = map(s);
      return `<circle cx="${x}" cy="${y}" r="${(s[2] * 0.6).toFixed(2)}"/>`;
    })
    .join('');
  return lines + circles;
}

