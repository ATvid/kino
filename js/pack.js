// The "pack": time-synced lyrics + English translations for every song in the
// catalog, stored on the device so the app works with no connection.
//
//   lyrics        ← lrclib.net (open database of time-synced lyrics)
//   translations  ← machine translation, fetched once; editable in the app
//
// Shape: { v:1, updated:<ms>, edited:<bool>, songs: { [id]: { lrclibId, lines:[{t,end,ru,en}] } } }

import { ARTIST, SONGS } from './songs.js';

const KEY = 'kino.pack.v1';
const LRCLIB = 'https://lrclib.net/api';

// ---------- storage ----------

export function loadPack() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return validPack(p) ? p : null;
  } catch {
    return null;
  }
}

export function savePack(pack) {
  pack.updated = Date.now();
  localStorage.setItem(KEY, JSON.stringify(pack));
}

export function validPack(p) {
  return !!p && p.v === 1 && p.songs && typeof p.songs === 'object' &&
    Object.values(p.songs).every((s) => Array.isArray(s.lines) &&
      s.lines.every((l) => typeof l.t === 'number' && typeof l.ru === 'string'));
}

/** A pack.json committed next to the app (polished translations shared with everyone). */
export async function loadBundledPack() {
  try {
    const r = await fetch('pack.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    const p = await r.json();
    return validPack(p) ? p : null;
  } catch {
    return null;
  }
}

export const packIsComplete = (pack) =>
  !!pack && SONGS.every((s) => pack.songs[s.id]?.lines?.length);

export const missingTranslations = (pack) =>
  !pack ? 0 : Object.values(pack.songs).reduce((n, s) => n + s.lines.filter((l) => !l.en).length, 0);

// ---------- LRC parsing ----------

const DECORATION = /^[\s♪♫🎵🎶.…*~-]*$/u;

// Crowd-sourced lyrics sometimes contain Latin look-alike letters typed in
// place of Cyrillic ones ("пеpемен" with a Latin p). They look identical but
// break translation and matching, so put the real letters back.
const LOOKALIKES = {
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к',
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х',
};
const count = (text, re) => (text.match(re) || []).length;
const isCyrillic = (text) => count(text, /[а-яё]/gi) > 3 * count(text, /[a-z]/gi);

export function fixLookalikes(text) {
  return text.replace(/\S+/g, (word) =>
    /[а-яё]/i.test(word) ? word.replace(/[a-zA-Z]/g, (ch) => LOOKALIKES[ch] ?? ch) : word);
}

/** Parse LRC text into [{t, end, ru}] (seconds). */
export function parseLrc(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*((?:\[\d+:\d+(?:[.:]\d+)?\]\s*)+)(.*)$/);
    if (!m) continue;
    const body = fixLookalikes(m[2].trim());
    for (const tm of m[1].matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)) {
      rows.push({ t: +tm[1] * 60 + +tm[2] + (tm[3] ? +`0.${tm[3]}` : 0), text: body });
    }
  }
  rows.sort((a, b) => a.t - b.t);

  const lines = [];
  let inParens = false; // "(spoken aside / credits)" blocks are not lyrics
  for (const row of rows) {
    let blank = DECORATION.test(row.text);
    if (!blank && (inParens || row.text.startsWith('('))) {
      blank = true;
      inParens = !row.text.includes(')');
    }
    const last = lines[lines.length - 1];
    if (last && last.end == null) last.end = row.t;
    if (!blank) lines.push({ t: row.t, end: null, ru: row.text });
  }
  const last = lines[lines.length - 1];
  if (last && last.end == null) last.end = last.t + 6;
  return lines;
}

// ---------- lyrics download ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJsonOnce(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** GET JSON, pausing and retrying when the service is busy (429 / 5xx) or the request fails. */
async function getJson(url, timeoutMs = 15000) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJsonOnce(url, timeoutMs);
    } catch (err) {
      const giveUp = attempt >= 2 || !navigator.onLine || (err.status && err.status !== 429 && err.status < 500);
      if (giveUp) throw err;
      await sleep(1500 * (attempt + 1) ** 2);
    }
  }
}

async function fetchLyrics(song) {
  if (song.lrclib) {
    try {
      const rec = await getJson(`${LRCLIB}/get/${song.lrclib}`);
      if (rec?.syncedLyrics && isCyrillic(fixLookalikes(rec.syncedLyrics))) return rec;
    } catch { /* fall through to search */ }
  }
  const q = new URLSearchParams({ artist_name: ARTIST, track_name: song.query || song.ru });
  // Some records are romanised transcriptions: only accept Cyrillic text.
  const found = (await getJson(`${LRCLIB}/search?${q}`))
    .filter((r) => r.syncedLyrics && isCyrillic(fixLookalikes(r.syncedLyrics)));
  if (!found.length) throw new Error(`No synced lyrics found for “${song.ru}”`);
  found.sort((a, b) => Math.abs(a.duration - song.duration) - Math.abs(b.duration - song.duration));
  return found[0];
}

// ---------- translation ----------

async function googleTranslate(text) {
  const q = new URLSearchParams({ client: 'gtx', sl: 'ru', tl: 'en', dt: 't', q: text });
  const data = await getJson(`https://translate.googleapis.com/translate_a/single?${q}`);
  return data[0].map((seg) => seg[0]).join('');
}

async function myMemoryTranslate(text) {
  const q = new URLSearchParams({ q: text, langpair: 'ru|en' });
  const data = await getJson(`https://api.mymemory.translated.net/get?${q}`);
  const out = data?.responseData?.translatedText || '';
  if (data?.responseStatus !== 200 || /MYMEMORY WARNING/i.test(out)) throw new Error('MyMemory quota');
  return out;
}

async function translateOne(text) {
  try {
    return (await googleTranslate(text)).trim();
  } catch {
    try {
      return (await myMemoryTranslate(text)).trim();
    } catch {
      return '';
    }
  }
}

/** Translate an array of lines; returns an array of the same length ('' where it failed). */
export async function translateLines(lines) {
  if (!lines.length) return [];
  // Whole song in one request first: one round-trip, and the translator sees context.
  try {
    const out = (await googleTranslate(lines.join('\n'))).split('\n').map((s) => s.trim());
    if (out.length === lines.length && out.every(Boolean)) return out;
  } catch { /* fall back to line-by-line */ }
  const cache = new Map(); // choruses repeat
  const result = [];
  for (const line of lines) {
    if (!cache.has(line)) cache.set(line, await translateOne(line));
    result.push(cache.get(line));
  }
  return result;
}

// ---------- build ----------

/**
 * Download lyrics and translations for every song that is not complete yet.
 * Keeps whatever already exists (including hand-edited translations).
 */
export async function buildPack(existing, onProgress = () => {}) {
  const pack = existing && validPack(existing) ? existing : { v: 1, updated: 0, edited: false, songs: {} };
  const errors = [];
  let done = 0;
  const one = async (song) => {
    try {
      let entry = pack.songs[song.id];
      if (!entry?.lines?.length) {
        const rec = await fetchLyrics(song);
        entry = { lrclibId: rec.id, lines: parseLrc(rec.syncedLyrics).map((l) => ({ ...l, en: '' })) };
        if (!entry.lines.length) throw new Error(`Lyrics for “${song.ru}” were empty`);
        pack.songs[song.id] = entry;
        savePack(pack);
      }
      const todo = entry.lines.filter((l) => !l.en);
      if (todo.length) {
        const en = await translateLines(todo.map((l) => l.ru));
        todo.forEach((l, k) => { l.en = en[k] || ''; });
        savePack(pack);
      }
    } catch (e) {
      errors.push(`${song.en}: ${e.message || e}`);
    }
    onProgress({ done: ++done, total: SONGS.length, song });
  };
  // A few songs at a time: quick, without hammering the free services.
  const queue = SONGS.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) await one(queue.shift());
  }));
  return { pack, errors };
}

// ---------- translation sheet ----------
//
// A plain-text way to get better translations in: every song's distinct lines,
// numbered. Someone (or something) who translates well writes an English line
// after each number, and the result is pasted back. Line numbers keep it aligned.

/** Distinct Russian lines of a song, in order of first appearance. */
const distinctLines = (entry) => [...new Set(entry.lines.map((l) => l.ru))];

export function translationSheet(pack, songIds) {
  const parts = [
    'KINO LYRICS — TRANSLATION SHEET',
    'Replace each numbered Russian line with its English translation.',
    'Keep the "##" headers and the numbers exactly as they are, one line per number.',
    'Lines starting with "//" are background notes; leave or delete them.',
  ];
  for (const song of SONGS) {
    const entry = pack.songs[song.id];
    if (!entry?.lines?.length || (songIds && !songIds.includes(song.id))) continue;
    parts.push('', `## ${song.id} | ${song.ru} (${song.en}, ${song.year})`, `// ${song.about}`);
    distinctLines(entry).forEach((ru, i) => parts.push(`${i + 1}. ${ru}`));
  }
  return parts.join('\n');
}

/**
 * Apply a filled-in translation sheet. Lines still in Russian are ignored, so
 * a partly translated sheet is fine.
 * @returns {{lines:number, songs:number}} how much changed
 */
export function applyTranslationSheet(pack, text) {
  let entry = null;
  let distinct = [];
  let lines = 0;
  const songs = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const header = raw.match(/^\s*#+\s*([a-z0-9-]+)/i);
    if (header) {
      const id = header[1].toLowerCase();
      entry = pack.songs[id] || null;
      distinct = entry ? distinctLines(entry) : [];
      continue;
    }
    const m = raw.match(/^\s*(\d+)\s*[.):]\s*(.+?)\s*$/);
    if (!m || !entry) continue;
    const ru = distinct[+m[1] - 1];
    const en = m[2];
    if (ru == null || isCyrillic(en)) continue;
    for (const line of entry.lines) {
      if (line.ru === ru && line.en !== en) {
        line.en = en;
        line.ed = true;
        lines++;
        songs.add(entry);
      }
    }
  }
  if (lines) pack.edited = true;
  return { lines, songs: songs.size };
}
