export type Direction = 'rtl' | 'ltr';

export function getDirection(lang: string): Direction {
  const rtlLanguages = ['ar', 'fa', 'he', 'ur'];
  const langCode = (lang.split('-')[0] ?? lang).toLowerCase();
  return rtlLanguages.includes(langCode) ? 'rtl' : 'ltr';
}

export function flipDirection(side: 'start' | 'end' | 'left' | 'right', dir: Direction) {
  if (dir === 'ltr') return side;
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return side;
}
