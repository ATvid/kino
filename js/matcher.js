// Lyric matcher: turns a noisy speech-recognition transcript into
// "which song, and where in it".
//
// The idea is the same as audio fingerprinting, but with words: every word the
// recogniser heard that also occurs in a song votes for a time offset
// (lyric time − heard time). Words from the right place in the right song all
// vote for the same offset, so a tight cluster of votes identifies both the
// song and the playback position. It needs only a handful of correct words,
// which is all a small on-device model can deliver at a loud show.
//
// Pure functions, no DOM — runs in the browser and under `node --test`.

export function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity between two normalised words; 0 means "not the same word". */
export function wordSimilarity(a, b) {
  if (a === b) return 1;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return 0; // short words must match exactly
  // Russian inflection and ASR errors mostly hit word endings.
  let prefix = 0;
  while (prefix < minLen && a.charCodeAt(prefix) === b.charCodeAt(prefix)) prefix++;
  if (prefix >= 5 || (prefix >= 4 && prefix >= minLen - 1)) return 0.8;
  const max = minLen >= 8 ? 2 : 1;
  if (editDistance(a, b, max) <= max) return 0.7;
  // Same stem inside a different form ("написано" / "ненаписанных").
  if (minLen >= 6 && commonSubstring(a, b) >= Math.max(5, Math.ceil(0.7 * minLen))) return 0.6;
  return 0;
}

function commonSubstring(a, b) {
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/**
 * Build a searchable index from the lyric pack.
 * @param {Array<{id:string, lines:Array<{t:number,end:number,ru:string}>}>} songs
 */
export function buildIndex(songs) {
  const songsWith = new Map(); // word -> Set(songId)
  const indexed = songs.map((song) => {
    const words = [];
    song.lines.forEach((line, lineIndex) => {
      const ws = normalizeWords(line.ru);
      if (!ws.length) return;
      // The lyric file only says when a line starts. Words inside the line are
      // assumed to be spread evenly over the part of it that is actually sung.
      const span = Math.min(0.85 * Math.max(line.end - line.t, 0.5), 0.55 * ws.length + 1);
      ws.forEach((w, i) => {
        words.push({ w, t: line.t + (span * i) / ws.length, line: lineIndex, first: i === 0 });
        if (!songsWith.has(w)) songsWith.set(w, new Set());
        songsWith.get(w).add(song.id);
      });
    });
    return { id: song.id, words };
  });
  // Weight: long words that occur in few songs are the most telling.
  const weightOf = (w) => {
    const n = songsWith.get(w)?.size ?? 1;
    const lengthFactor = Math.min(1, Math.max(0.15, (w.length - 1) / 4));
    return lengthFactor / Math.sqrt(n);
  };
  for (const s of indexed) for (const x of s.words) x.weight = weightOf(x.w);
  return { songs: indexed };
}

/**
 * Convert recogniser output into words with times (seconds from clip start).
 * @param {Array<{text:string, timestamp:[number, number|null]}>} chunks
 * @param {number} clipSeconds
 */
export function heardWords(chunks, clipSeconds) {
  const out = [];
  for (const c of chunks) {
    const ws = normalizeWords(c.text || '');
    if (!ws.length) continue;
    let [start, end] = c.timestamp || [0, null];
    if (!(start >= 0)) start = 0;
    if (!(end > start)) end = Math.min(clipSeconds, start + 0.5 * ws.length + 1);
    end = Math.min(end, Math.max(clipSeconds, start + 0.5));
    ws.forEach((w, i) => out.push({ w, t: start + ((end - start) * i) / ws.length }));
  }
  return out;
}

const WINDOW = 3.0; // seconds: votes this close together count as agreeing

/**
 * Score every song against what was heard.
 * Returns, per song, its candidate positions sorted best-first:
 *   { id, peaks: [{ offset, score, matched }] }
 * where songTime ≈ clipTime + offset.
 */
export function match(index, heard) {
  const results = [];
  for (const song of index.songs) {
    const votes = [];
    heard.forEach((h, hi) => {
      for (let k = 0; k < song.words.length; k++) {
        const lw = song.words[k];
        const sim = wordSimilarity(h.w, lw.w);
        if (sim > 0) votes.push({ d: lw.t - h.t, w: sim * lw.weight, hi, k });
      }
    });
    votes.sort((a, b) => a.d - b.d);

    const candidates = [];
    let hiEnd = 0;
    for (let lo = 0; lo < votes.length; lo++) {
      while (hiEnd < votes.length && votes[hiEnd].d <= votes[lo].d + WINDOW) hiEnd++;
      // Each heard word and each lyric word may count only once per cluster.
      const bestByHeard = new Map();
      for (let i = lo; i < hiEnd; i++) {
        const v = votes[i];
        const cur = bestByHeard.get(v.hi);
        if (!cur || v.w > cur.w) bestByHeard.set(v.hi, v);
      }
      const usedLyric = new Set();
      let score = 0;
      let matched = 0;
      const all = [];
      const exact = []; // votes from line-opening words: their lyric time is known, not estimated
      for (const v of bestByHeard.values()) {
        if (usedLyric.has(v.k)) continue;
        usedLyric.add(v.k);
        score += v.w;
        matched++;
        all.push(v.d);
        if (song.words[v.k].first) exact.push(v.d);
      }
      if (matched) {
        const ds = exact.length >= 2 ? exact : all;
        ds.sort((a, b) => a - b);
        const mid = ds.length >> 1;
        const offset = ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2;
        candidates.push({ offset, score, matched });
      }
    }
    // Keep distinct peaks only (non-maximum suppression).
    candidates.sort((a, b) => b.score - a.score);
    const peaks = [];
    for (const c of candidates) {
      if (peaks.every((p) => Math.abs(p.offset - c.offset) > WINDOW)) peaks.push(c);
      if (peaks.length >= 8) break;
    }
    results.push({ id: song.id, peaks });
  }
  results.sort((a, b) => (b.peaks[0]?.score ?? 0) - (a.peaks[0]?.score ?? 0));
  return results;
}
