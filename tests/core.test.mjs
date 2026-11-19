// Run with:  npm test
// These tests use made-up Russian sentences, not real song lyrics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, heardWords, match, normalizeWords, wordSimilarity } from '../js/matcher.js';
import { Tracker } from '../js/tracker.js';
import { applyTranslationSheet, fixLookalikes, parseLrc, translationSheet } from '../js/pack.js';
import { SONGS as CATALOG } from '../js/songs.js';
import { translit } from '../js/translit.js';

const line = (t, ru) => ({ t, end: t + 4, ru });
const SONGS = {
  river: {
    lines: [
      line(10, 'Старый паром уходит на рассвете'),
      line(14, 'Чайки кричат над серой водой'),
      line(18, 'Капитан молчит и курит трубку'),
      line(22, 'Берег остался далеко за кормой'),
      line(40, 'Плыви, плыви, мой корабль'), // chorus
      line(44, 'Сквозь туманы и дожди'),
      line(60, 'Маяк погас, но звёзды светят'),
      line(64, 'Команда спит под шум волны'),
      line(80, 'Плыви, плыви, мой корабль'), // chorus again
      line(84, 'Сквозь туманы и дожди'),
    ],
  },
  city: {
    lines: [
      line(8, 'Трамвай звенит на пустой улице'),
      line(12, 'Фонари горят жёлтым огнём'),
      line(16, 'Дворник метёт осенние листья'),
      line(20, 'Город засыпает под дождём'),
    ],
  },
};
const index = buildIndex(Object.entries(SONGS).map(([id, s]) => ({ id, ...s })));

/** Simulate the recogniser hearing some lines, starting `clipSongStart` seconds into the song. */
function hear(songId, clipSongStart, clipSeconds, mangle = (w) => w) {
  const chunks = [];
  for (const l of SONGS[songId].lines) {
    const ws = l.ru.split(/\s+/);
    ws.forEach((w, i) => {
      const t = l.t + (i * 3) / ws.length - clipSongStart;
      if (t >= 0 && t < clipSeconds) chunks.push({ text: ` ${mangle(w)}`, timestamp: [t, t + 0.4] });
    });
  }
  return heardWords(chunks, clipSeconds);
}

test('normalizeWords strips punctuation and folds ё', () => {
  assert.deepEqual(normalizeWords('Звёзды — светят, да!'), ['звезды', 'светят', 'да']);
});

test('wordSimilarity tolerates endings and small errors, not different words', () => {
  assert.equal(wordSimilarity('корабль', 'корабль'), 1);
  assert.ok(wordSimilarity('корабля', 'корабль') > 0); // inflection
  assert.ok(wordSimilarity('туманы', 'туманны') > 0); // recogniser slip
  assert.ok(wordSimilarity('написано', 'ненаписанных') > 0); // same stem
  assert.equal(wordSimilarity('паром', 'город'), 0);
  assert.equal(wordSimilarity('на', 'но'), 0); // short words must be exact
});

test('identifies the right song and position from a clean clip', () => {
  const results = match(index, hear('river', 12, 15));
  assert.equal(results[0].id, 'river');
  assert.ok(Math.abs(results[0].peaks[0].offset - 12) < 1.5, `offset ${results[0].peaks[0].offset}`);
});

test('still works when half the words are garbled', () => {
  let n = 0;
  const results = match(index, hear('city', 6, 15, (w) => (n++ % 2 ? 'бубубу' : w)));
  assert.equal(results[0].id, 'city');
  assert.ok(Math.abs(results[0].peaks[0].offset - 6) < 1.5);
});

test('unrelated speech matches nothing convincingly', () => {
  const heard = heardWords([{ text: 'Спасибо большое всем кто пришёл сегодня вечером', timestamp: [0, 5] }], 15);
  const results = match(index, heard);
  assert.ok((results[0].peaks[0]?.score ?? 0) < 2);
});

test('tracker: identifies, follows, and resolves a repeated chorus by position', () => {
  const tr = new Tracker(SONGS);
  // Listening from song time 12; wall clock == clip clock here, clip starts at wall 100.
  let a = tr.onMatch(match(index, hear('river', 12, 15)), 100, 115);
  assert.equal(a.type, 'identify');
  assert.equal(tr.songId, 'river');
  assert.ok(Math.abs(tr.position(115) - 27) < 1.5, `pos ${tr.position(115)}`);

  // 55 s later the second chorus (song time 80) is playing. Its words also match
  // the first chorus at 40; the tracker must pick the one that agrees with its clock.
  a = tr.onMatch(match(index, hear('river', 78, 12)), 166, 178);
  assert.equal(a.type, 'sync');
  assert.ok(Math.abs(tr.position(178) - 90) < 2, `pos ${tr.position(178)}`);
});

test('tracker: switches when another song takes over', () => {
  const tr = new Tracker(SONGS);
  tr.onMatch(match(index, hear('river', 12, 15)), 100, 115);
  const other = match(index, hear('city', 6, 15));
  // First clip of the new song: overwhelming evidence switches at once.
  const a = tr.onMatch(other, 200, 215);
  assert.equal(a.type, 'switch');
  assert.equal(tr.songId, 'city');
  assert.ok(Math.abs(tr.position(215) - 21) < 1.5);
});

test('tracker: a manual choice is not overridden straight away', () => {
  const tr = new Tracker(SONGS);
  tr.setSong('city', 100);
  tr.seek(8, 100);
  const a = tr.onMatch(match(index, hear('river', 12, 15)), 101, 116);
  assert.equal(a.type, 'none');
  assert.equal(tr.songId, 'city');
  // …but once the hold has passed and the evidence repeats, it gives way.
  const b = tr.onMatch(match(index, hear('river', 40, 15)), 140, 155);
  assert.equal(b.type, 'switch');
});

test('tracker: tap-to-seek, nudge, pause and resume', () => {
  const tr = new Tracker(SONGS);
  tr.setSong('city', 0);
  assert.equal(tr.position(0), null);
  tr.seek(12, 5);
  assert.equal(tr.position(7), 14);
  tr.nudge(-1, 7);
  assert.equal(tr.position(7), 13);
  tr.pause(8);
  assert.equal(tr.position(50), 14);
  tr.resume(50);
  assert.equal(tr.position(51), 15);
  assert.equal(tr.finished(51), false);
  assert.equal(tr.finished(51 + 30), true);
});

test('parseLrc: timestamps, blank lines end the previous line, asides are skipped', () => {
  const lines = parseLrc([
    '[00:10.50] Первая строка',
    '[00:14.00] Вторая строка',
    '[00:18.00]',
    '[00:30.25] Третья строка',
    '[00:40.00] (Спасибо',
    '[00:41.00] всем)',
    '[00:42.00] ♪',
  ].join('\n'));
  assert.deepEqual(lines.map((l) => [l.t, l.end, l.ru]), [
    [10.5, 14, 'Первая строка'],
    [14, 18, 'Вторая строка'],
    [30.25, 40, 'Третья строка'],
  ]);
});

test('fixLookalikes repairs Latin letters typed inside Russian words only', () => {
  assert.equal(fixLookalikes('Пеpемен тpебyют'), 'Перемен требуют'); // Latin p, y
  assert.equal(fixLookalikes('rock and roll'), 'rock and roll');
});

test('translit is readable for English speakers', () => {
  assert.equal(translit('Звезда по имени Солнце'), 'Zvezda po imeni Solntse');
  assert.equal(translit('Ёлка и её друзья'), 'Yolka i yeyo druz’ya');
});

test('catalog: ids and lyric records are unique, every song has a note', () => {
  assert.equal(new Set(CATALOG.map((s) => s.id)).size, CATALOG.length);
  assert.equal(new Set(CATALOG.map((s) => s.lrclib)).size, CATALOG.length);
  for (const s of CATALOG) assert.ok(s.ru && s.en && s.about.length > 40 && s.duration > 60, s.id);
});

test('translation sheet: copy out, translate, paste back', () => {
  const [a, b] = CATALOG;
  const mk = (rus) => ({ lines: rus.map((ru, i) => ({ t: i * 4, end: i * 4 + 4, ru, en: `machine ${i}` })) });
  const pack = { v: 1, edited: false, songs: {
    [a.id]: mk(['Первая строка', 'Припев раз', 'Вторая строка', 'Припев раз']),
    [b.id]: mk(['Другая песня']),
  } };

  const sheet = translationSheet(pack);
  assert.match(sheet, new RegExp(`## ${a.id} \\|`));
  assert.match(sheet, /\n1\. Первая строка\n2\. Припев раз\n3\. Вторая строка\n/); // chorus listed once
  assert.equal(translationSheet(pack, [b.id]).includes(a.id), false);

  // Translator filled in song A fully and left song B in Russian.
  const filled = sheet
    .replace('1. Первая строка', '1. First line')
    .replace('2. Припев раз', '2) Chorus, once')
    .replace('3. Вторая строка', '3. Second line');
  const result = applyTranslationSheet(pack, filled);
  assert.deepEqual(result, { lines: 4, songs: 1 });
  assert.deepEqual(pack.songs[a.id].lines.map((l) => l.en), ['First line', 'Chorus, once', 'Second line', 'Chorus, once']);
  assert.ok(pack.songs[a.id].lines.every((l) => l.ed));
  assert.equal(pack.songs[b.id].lines[0].en, 'machine 0'); // untouched
  assert.equal(pack.edited, true);

  // Junk, unknown songs and out-of-range numbers are ignored.
  assert.deepEqual(applyTranslationSheet(pack, '## nope\n1. x\nhello\n## ' + a.id + '\n99. y'), { lines: 0, songs: 0 });
});
