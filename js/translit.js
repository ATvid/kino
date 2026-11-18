// Russian → Latin transliteration tuned for English speakers singing along
// (pronunciation over scholarly accuracy).

const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '’', э: 'e', ю: 'yu', я: 'ya',
};
const VOWELS = 'аеёиоуыэюяъь';

export function translit(text) {
  let out = '';
  let prev = ' ';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    let t = MAP[lower];
    if (t === undefined) {
      out += ch;
      prev = lower;
      continue;
    }
    // "е" sounds like "ye" at the start of a word and after vowels / signs.
    if (lower === 'е' && (!/[а-яё]/.test(prev) || VOWELS.includes(prev))) t = 'ye';
    if (ch !== lower && t) t = t[0].toUpperCase() + t.slice(1);
    out += t;
    prev = lower;
  }
  return out;
}
