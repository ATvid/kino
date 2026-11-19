// A short, stable fingerprint of a lyric line. It lets the app attach notes to
// specific lines without the lyrics themselves being stored anywhere in the code.

import { normalizeWords } from './matcher.js';

export function lineKey(text) {
  const s = normalizeWords(text).join(' ');
  let h = 0x811c9dc5; // FNV-1a, 32 bit
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
