// Run with:  npm test
// These tests use made-up Russian sentences, not real song lyrics.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndex, Evidence, match, normalizeWords, skeleton } from '../js/matcher.js';
import { Tracker } from '../js/tracker.js';
import { applyTranslationSheet, fixLookalikes, parseLrc, translationSheet } from '../js/pack.js';
import { SONGS as CATALOG } from '../js/songs.js';
import { translit } from '../js/translit.js';
import { lineKey } from '../js/linekey.js';
import { NOTES } from '../js/notes.js';

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

/**
 * What a recogniser might return for a clip that starts `songStart` seconds
 * into the song: one chunk per word, with times relative to the clip.
 * `keep` picks which words were heard at all; `mangle` garbles them.
 */
function clip(songId, songStart, seconds, { keep = () => true, mangle = (w) => w } = {}) {
  const chunks = [];
  let n = 0;
  for (const l of SONGS[songId].lines) {
    const ws = l.ru.split(/\s+/);
    ws.forEach((w, i) => {
      const t = l.t + (i * 3) / ws.length - songStart;
      if (t >= 0 && t < seconds && keep(n++, l)) chunks.push({ text: ` ${mangle(w)}`, timestamp: [t, t + 0.4] });
    });
  }
  return chunks;
}

/** Evidence from a single clip heard at wall time `wall`. */
function heard(songId, songStart, seconds, wall, opts) {
  const ev = new Evidence();
  ev.add(clip(songId, songStart, seconds, opts), wall, seconds);
  return ev;
}

test('normalizeWords strips punctuation and folds ё', () => {
  assert.deepEqual(normalizeWords('Звёзды — светят, да!'), ['звезды', 'светят', 'да']);
});

test('skeleton keeps consonants and merges ones that get confused', () => {
  assert.equal(skeleton('корабль'), 'krpl');
  assert.equal(skeleton('гараж'), skeleton('караш')); // voiced / unvoiced
  // misheard vowels and a moved word boundary leave the skeleton untouched
  assert.equal(skeleton('туманы') + skeleton('дожди'), skeleton('томан') + skeleton('и') + skeleton('дажди'));
});

test('identifies the right song and position from a clean clip', () => {
  const results = match(index, heard('river', 12, 15, 100));
  assert.equal(results[0].id, 'river');
  // song time 12 at wall time 100 → offset −88
  assert.ok(Math.abs(results[0].peaks[0].offset - -88) < 1.5, `offset ${results[0].peaks[0].offset}`);
  assert.ok(results[0].peaks[0].recent > 0);
});

test('still works when vowels are wrong and words run together', () => {
  const mangle = (w) => w.toLowerCase().replace(/[аеёиоуыэюя]/g, 'а');
  const chunks = clip('city', 6, 15, { mangle });
  // glue pairs of words together, as recognisers do
  const glued = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const a = chunks[i];
    const b = chunks[i + 1];
    glued.push(b ? { text: a.text + b.text.trim(), timestamp: [a.timestamp[0], b.timestamp[1]] } : a);
  }
  const ev = new Evidence();
  ev.add(glued, 50, 15);
  const results = match(index, ev);
  assert.equal(results[0].id, 'city');
  assert.ok(Math.abs(results[0].peaks[0].offset - -44) < 2, `offset ${results[0].peaks[0].offset}`);
});

test('unrelated speech matches nothing convincingly', () => {
  const ev = new Evidence();
  ev.add([{ text: 'Спасибо большое всем кто пришёл сегодня вечером', timestamp: [0, 5] }], 0, 15);
  const results = match(index, ev);
  assert.ok((results[0].peaks[0]?.score ?? 0) < 3, `score ${results[0].peaks[0]?.score}`);
});

test('evidence adds up across passes when each one caught very little', () => {
  // Each pass catches just the first two words of one line.
  const ev = new Evidence();
  const tracker = new Tracker(SONGS);
  let identified = null;
  [[10, 0], [14, 1], [18, 2], [22, 3]].forEach(([songStart, lineNo], pass) => {
    const wall = 100 + (songStart - 10); // the song keeps playing in real time
    const only = SONGS.river.lines[lineNo];
    let taken = 0;
    ev.add(clip('river', songStart, 4, { keep: (n, l) => l === only && taken++ < 2 }), wall, 4);
    const a = tracker.onMatch(match(index, ev), wall + 5);
    if (a.type === 'identify' && identified == null) identified = pass;
  });
  assert.ok(identified != null, 'identified from accumulated evidence');
  assert.ok(identified >= 1, 'not from the first fragment alone');
  assert.equal(tracker.songId, 'river');
  assert.ok(Math.abs(tracker.position(130) - 40) < 2, `pos ${tracker.position(130)}`);
});

test('tracker: identifies, follows, and resolves a repeated chorus by position', () => {
  const tr = new Tracker(SONGS);
  const ev = new Evidence();
  // Song time 12 at wall time 100.
  ev.add(clip('river', 12, 15), 100, 15);
  let a = tr.onMatch(match(index, ev), 115);
  assert.equal(a.type, 'identify');
  assert.equal(tr.songId, 'river');
  assert.ok(Math.abs(tr.position(115) - 27) < 1.5, `pos ${tr.position(115)}`);

  // Later the second chorus (song time 80) is playing. Its words also match
  // the first chorus at 40; the tracker must pick the one that agrees with its clock.
  ev.add(clip('river', 78, 12), 166, 12);
  a = tr.onMatch(match(index, ev), 178);
  assert.equal(a.type, 'sync');
  assert.ok(Math.abs(tr.position(178) - 90) < 2, `pos ${tr.position(178)}`);
});

test('tracker: switches when another song takes over', () => {
  const tr = new Tracker(SONGS);
  const ev = new Evidence();
  ev.add(clip('river', 12, 15), 100, 15);
  tr.onMatch(match(index, ev), 115);
  // The other song starts; within a couple of passes the tracker follows.
  let switched = false;
  for (const [songStart, wall] of [[6, 130], [10, 134], [14, 138]]) {
    ev.add(clip('city', songStart, 8), wall, 8);
    if (tr.onMatch(match(index, ev), wall + 9).type === 'switch') switched = true;
  }
  assert.ok(switched);
  assert.equal(tr.songId, 'city');
  assert.ok(Math.abs(tr.position(150) - 26) < 1.5, `pos ${tr.position(150)}`);
});

test('tracker: a manual choice is not overridden straight away', () => {
  const tr = new Tracker(SONGS);
  tr.setSong('city', 100);
  tr.seek(8, 100);
  const ev = new Evidence();
  ev.add(clip('river', 12, 15), 101, 15);
  const a = tr.onMatch(match(index, ev), 116);
  assert.equal(a.type, 'none');
  assert.equal(tr.songId, 'city');
  // …but once the hold has passed and the evidence keeps coming, it gives way.
  let switched = false;
  for (const [songStart, wall] of [[40, 129], [44, 133], [48, 137]]) {
    ev.add(clip('river', songStart, 8), wall, 8);
    if (tr.onMatch(match(index, ev), wall + 9).type === 'switch') switched = true;
  }
  assert.ok(switched);
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

test('lineKey ignores case, punctuation and ё/е, and is stable', () => {
  assert.equal(lineKey('Звёзды — светят, да!'), lineKey('звезды светят да'));
  assert.notEqual(lineKey('звезды светят да'), lineKey('звезды светят нет'));
  assert.match(lineKey('что угодно'), /^[0-9a-f]{8}$/);
});

test('meaning notes: cover every song in the catalog and contain no lyrics', () => {
  for (const song of CATALOG) {
    const n = NOTES[song.id];
    assert.ok(n && Object.keys(n.g).length >= 2, `${song.id} has captions`);
    for (const [key, text] of Object.entries(n.g)) {
      assert.match(key, /^[0-9a-f]{8}$/);
      assert.ok(text.length > 15 && !/[а-яё]/i.test(text), `${song.id} caption`);
    }
    for (const [key, [en, note]] of Object.entries(n.f)) {
      assert.match(key, /^[0-9a-f]{8}$/);
      assert.ok(en || note, `${song.id} line note has content`);
      assert.ok(!/[а-яё]/i.test(`${en || ''}${note || ''}`), `${song.id} line note`);
    }
  }
});

test('service worker: every app file is part of the offline set', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = new Set([...sw.matchAll(/'((?:js|vendor|icons)\/[^']+|[a-z.]+\.(?:html|css|json|webmanifest))'/g)].map((m) => m[1]));
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url))) {
    assert.ok(listed.has(`js/${f}`), `js/${f} is missing from SHELL in sw.js`);
  }
  for (const f of ['index.html', 'styles.css', 'manifest.webmanifest', 'pack.json']) assert.ok(listed.has(f), f);
  assert.match(sw, /const VERSION = \d+;/);
});
