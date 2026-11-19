// Lyric matcher: turns noisy speech-recognition output into
// "which song, and where in it".
//
// A small on-device model mishears sung words badly: vowels drift, endings
// change, word boundaries move. What tends to survive is the run of
// consonants. So both the lyrics and whatever was heard are reduced to a
// "consonant skeleton", and the two are compared in short overlapping pieces
// of it, ignoring where the words begin and end.
//
// Every piece the two have in common votes for a time offset
// (lyric time − time it was heard). Pieces from the right place in the right
// song all vote for the same offset, so a tight cluster of votes identifies
// both the song and the position — the idea behind audio fingerprinting,
// applied to consonants. Votes are collected over the last minute or so of
// listening, so a few correct fragments every few seconds are enough.
//
// Pure functions and plain data, no DOM — runs in the browser and under
// `node --test`.

export function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Consonants that recognisers confuse with each other share a symbol; vowels,
// signs and "й" are dropped.
const SOUND = {
  б: 'p', п: 'p', в: 'f', ф: 'f', г: 'k', к: 'k', х: 'k', д: 't', т: 't',
  ж: 'x', ш: 'x', щ: 'x', з: 's', с: 's', ц: 'ts', ч: 'c',
  л: 'l', м: 'm', н: 'n', р: 'r',
};

/** Consonant skeleton of one normalised word, e.g. "облака" → "plk". */
export function skeleton(word) {
  let out = '';
  for (const ch of word) out += SOUND[ch] ?? '';
  return out;
}

const K = 4; // length of the pieces that are compared
const MAX_SPAN = 4; // seconds: a piece stretched over a longer pause is not one phrase
const WINDOW = 3.0; // seconds: votes this close together count as agreeing
const HALF_LIFE = 40; // seconds: older evidence counts for less
const RECENT = 15; // seconds: evidence this new shows what is playing right now
export const HORIZON = 90; // seconds of listening kept as evidence

/** Words with times → a stream of skeleton symbols with times. */
function toSymbols(words) {
  const sym = [];
  for (const { w, start, end, first } of words) {
    const sk = skeleton(w);
    for (let j = 0; j < sk.length; j++) {
      sym.push({ c: sk[j], t: start + ((end - start) * j) / sk.length, first: !!first });
    }
  }
  return sym;
}

function* pieces(sym) {
  for (let i = 0; i + K <= sym.length; i++) {
    if (sym[i + K - 1].t - sym[i].t > MAX_SPAN) continue;
    let key = '';
    for (let j = 0; j < K; j++) key += sym[i + j].c;
    yield [key, i];
  }
}

/**
 * Build a searchable index from the lyric pack.
 * @param {Array<{id:string, lines:Array<{t:number,end:number,ru:string}>}>} songs
 */
export function buildIndex(songs) {
  const table = new Map(); // piece -> [{ s: song index, i: position, t, first }]
  const ids = [];
  songs.forEach((song, s) => {
    ids.push(song.id);
    const words = [];
    for (const line of song.lines) {
      const ws = normalizeWords(line.ru);
      if (!ws.length) continue;
      // The lyric file only says when a line starts. Words inside the line are
      // assumed to be spread evenly over the part of it that is actually sung.
      const span = Math.min(0.85 * Math.max(line.end - line.t, 0.5), 0.55 * ws.length + 1);
      const slot = span / ws.length;
      ws.forEach((w, i) => words.push({ w, start: line.t + slot * i, end: line.t + slot * (i + 1), first: i === 0 }));
    }
    const sym = toSymbols(words);
    for (const [key, i] of pieces(sym)) {
      if (!table.has(key)) table.set(key, []);
      table.get(key).push({ s, i, t: sym[i].t, first: sym[i].first });
    }
  });
  // A piece that occurs in few songs says more about which song is playing.
  const weight = new Map();
  for (const [key, hits] of table) weight.set(key, 1 / new Set(hits.map((h) => h.s)).size);
  return { ids, table, weight };
}

/**
 * Everything heard recently, kept as skeleton symbols with wall-clock times.
 */
export class Evidence {
  constructor() {
    this.passes = [];
    this.serial = 0;
  }

  /**
   * Add one recognition result.
   * @param {Array<{text:string, timestamp:[number, number|null]}>} chunks recogniser output
   * @param {number} clipStart wall time of the clip's first sample
   * @param {number} clipSeconds
   */
  add(chunks, clipStart, clipSeconds) {
    const words = [];
    for (const c of chunks) {
      const ws = normalizeWords(c.text || '');
      if (!ws.length) continue;
      let [start, end] = c.timestamp || [0, null];
      if (!(start >= 0)) start = 0;
      if (!(end > start)) end = start + 0.4 * ws.length + 0.2;
      end = Math.min(end, Math.max(clipSeconds, start + 0.3));
      const slot = (end - start) / ws.length;
      ws.forEach((w, i) => words.push({ w, start: clipStart + start + slot * i, end: clipStart + start + slot * (i + 1) }));
    }
    const pass = { id: ++this.serial, at: clipStart + clipSeconds, sym: toSymbols(words) };
    this.passes.push(pass);
    this.passes = this.passes.filter((p) => pass.at - p.at <= HORIZON);
    return pass;
  }

  clear() {
    this.passes = [];
  }
}

/**
 * Score every song against the evidence.
 * Returns, per song, its candidate positions sorted best-first:
 *   { id, peaks: [{ offset, score, matched, stretches, recent, recentScore }] }
 * where songTime ≈ wallTime + offset. `score` pools everything in the
 * evidence (older counts for less); `recent` / `recentScore` cover only what
 * was heard in the last RECENT seconds — the proof that it is playing now.
 */
export function match(index, evidence) {
  const passes = evidence.passes;
  const latest = passes[passes.length - 1];
  const votesBySong = index.ids.map(() => []);
  if (latest) {
    for (const pass of passes) {
      for (const [key, i] of pieces(pass.sym)) {
        const hits = index.table.get(key);
        if (!hits) continue;
        const heardAt = pass.sym[i].t;
        const age = Math.max(0, latest.at - heardAt);
        const raw = index.weight.get(key);
        const w = raw * 0.5 ** (age / HALF_LIFE);
        const recent = age <= RECENT;
        const h = pass.id * 100000 + i;
        for (const hit of hits) {
          votesBySong[hit.s].push({ d: hit.t - heardAt, w, raw, h, k: hit.i, recent, exact: hit.first });
        }
      }
    }
  }

  const results = index.ids.map((id, s) => {
    const votes = votesBySong[s].sort((a, b) => a.d - b.d);
    const candidates = [];
    let hi = 0;
    for (let lo = 0; lo < votes.length; lo++) {
      while (hi < votes.length && votes[hi].d <= votes[lo].d + WINDOW) hi++;
      // Each heard piece and each place in the lyrics may count only once per
      // cluster (the same audio is often recognised twice, in overlapping clips).
      const byHeard = new Map();
      for (let i = lo; i < hi; i++) {
        const v = votes[i];
        const cur = byHeard.get(v.h);
        if (!cur || v.w > cur.w) byHeard.set(v.h, v);
      }
      const byLyric = new Map();
      for (const v of byHeard.values()) {
        const cur = byLyric.get(v.k);
        if (!cur || v.w > cur.w) byLyric.set(v.k, v);
      }
      let score = 0;
      let recent = 0;
      let recentScore = 0;
      const all = [];
      const fresh = []; // offsets from recent votes: where the song is now
      const exact = []; // …and from pieces that start in a line's first word, whose lyric time is known, not estimated
      for (const v of byLyric.values()) {
        score += v.w;
        all.push(v.d);
        if (v.recent) {
          recent++;
          recentScore += v.raw;
          fresh.push(v.d);
          if (v.exact) exact.push(v.d);
        }
      }
      const ds = (exact.length >= 2 ? exact : fresh.length >= 3 ? fresh : all).sort((a, b) => a - b);
      const mid = ds.length >> 1;
      const offset = ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2;
      // Pieces that follow one another are one stretch of matching text. A
      // single stretch can be a coincidence (one misheard phrase that happens
      // to occur in some song); separate stretches agreeing on the timing can't.
      const chain = [...byLyric.values()].sort((a, b) => a.k - b.k);
      let stretches = 0;
      chain.forEach((v, i) => {
        const prev = chain[i - 1];
        if (!prev || v.k !== prev.k + 1 || v.h !== prev.h + 1) stretches++;
      });
      candidates.push({ offset, score, matched: byLyric.size, stretches, recent, recentScore });
    }
    // Keep distinct peaks only (non-maximum suppression).
    candidates.sort((a, b) => b.score - a.score);
    const peaks = [];
    for (const c of candidates) {
      if (peaks.every((p) => Math.abs(p.offset - c.offset) > WINDOW)) peaks.push(c);
      if (peaks.length >= 8) break;
    }
    return { id, peaks };
  });
  results.sort((a, b) => (b.peaks[0]?.score ?? 0) - (a.peaks[0]?.score ?? 0));
  return results;
}
