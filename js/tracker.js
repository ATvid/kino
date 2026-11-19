// Tracker: keeps the "where are we in which song" state.
//
// The position is a running clock (songTime = wallTime + offset). Speech
// recognition results and taps only ever re-anchor that clock, so the lyrics
// keep scrolling smoothly between anchors even when recognition is slow,
// wrong for a while, or switched off entirely.
//
// All times are in seconds. `now` is always passed in (testable, no timers).

// "Pieces" are the short consonant fragments the matcher compares (matcher.js).
// A song can be recognised two ways: quickly, from what was heard in the last
// few seconds alone, or slowly, from weak evidence pooled over a minute and a
// half — as long as some of it is recent, so a song that has ended can't win.
export const TUNING = {
  fastScore: 3.0, // recent evidence that is enough on its own
  fastPieces: 4,
  identifyScore: 3.0, // pooled evidence needed to pick a song
  identifyPieces: 6,
  identifyRecent: 2, // …of which this many pieces must be recent
  margin: 1.6, // how much better than the runner-up song, either way
  stretches: 2, // separate stretches of matching text that must agree (one short one could be chance)
  loneStretch: 10, // …unless a single stretch is this many pieces long, which chance does not produce
  syncScore: 2.0, // recent evidence needed to adjust position within the current song
  syncPieces: 3,
  near: 8, // seconds: a correction this small is a routine adjustment
  switchScore: 6.0, // recent evidence needed to abandon a song we are still hearing
  lostAfter: 2, // passes without hearing the current song before we stop trusting it
};
const MANUAL_HOLD = 25; // seconds a manual choice is protected from being overridden
const END_GRACE = 15; // seconds after the last line before the song counts as over
export const IN_SYNC_FOR = 25; // seconds a confirmation stays "fresh"

export class Tracker {
  /** @param {Record<string,{lines:Array<{t:number,end:number}>}>} songs */
  constructor(songs, tuning = {}) {
    this.songs = songs;
    this.tuning = { ...TUNING, ...tuning };
    this.songId = null;
    this.offset = null; // null → song chosen but clock not started
    this.pausedAt = null;
    this.holdUntil = 0;
    this.pendingSwitch = null;
    this.misses = 0;
    this.heardAt = -Infinity; // when recognition last confirmed the position
  }

  // ---- reading ----

  /** Current song time, or null when the clock is not running. */
  position(now) {
    if (!this.songId) return null;
    if (this.pausedAt != null) return this.pausedAt;
    return this.offset == null ? null : now + this.offset;
  }

  get running() {
    return !!this.songId && this.offset != null && this.pausedAt == null;
  }

  finished(now) {
    const lines = this.songs[this.songId]?.lines;
    const pos = this.position(now);
    return !!lines?.length && pos != null && pos > lines[lines.length - 1].end + END_GRACE;
  }

  /** Has recognition confirmed where we are recently? */
  inSync(now) {
    return this.running && now - this.heardAt < IN_SYNC_FOR;
  }

  // ---- manual control ----

  setSong(id, now) {
    this.songId = id;
    this.offset = null;
    this.pausedAt = null;
    this.pendingSwitch = null;
    this.misses = 0;
    this.heardAt = -Infinity;
    this.holdUntil = now + MANUAL_HOLD;
  }

  /** "This moment in the song is happening now." */
  seek(songTime, now) {
    if (!this.songId) return;
    this.offset = songTime - now;
    this.pausedAt = null;
    this.misses = 0;
    this.holdUntil = now + MANUAL_HOLD;
  }

  nudge(delta, now) {
    const pos = this.position(now);
    if (pos == null) return;
    if (this.pausedAt != null) this.pausedAt = Math.max(0, pos + delta);
    else this.offset += delta;
    this.holdUntil = now + MANUAL_HOLD;
  }

  pause(now) {
    if (this.running) this.pausedAt = this.position(now);
  }

  resume(now) {
    if (this.pausedAt == null) return;
    this.offset = this.pausedAt - now;
    this.pausedAt = null;
    this.misses = 0;
  }

  // ---- recognition ----

  /**
   * Feed the current evidence, after each recognition pass.
   * @param results  output of matcher.match(): peaks say songTime ≈ wallTime + offset
   * @returns {{type:'none'|'sync'|'jump'|'identify'|'switch', songId?:string}}
   */
  onMatch(results, now) {
    if (this.pausedAt != null) return { type: 'none' };
    const c = this.tuning;
    const solid = (p) => p.stretches >= c.stretches || p.matched >= c.loneStretch;
    const held = now < this.holdUntil;
    // Only positions with recent support count: evidence is pooled over a
    // minute and a half, and a song that has ended must not keep winning.
    results = results.map((r) => ({ id: r.id, peaks: r.peaks.filter((p) => p.recent >= c.identifyRecent) }))
      .sort((a, b) => (b.peaks[0]?.score ?? 0) - (a.peaks[0]?.score ?? 0));
    const top = (r) => r?.peaks[0];
    const anchor = (peak) => peak.offset;

    // What does the evidence say about the song we think is playing?
    const current = this.songId ? results.find((r) => r.id === this.songId) : null;
    const usable = (current?.peaks || []).filter((p) => p.recentScore >= c.syncScore && p.recent >= c.syncPieces);
    const strong = (current?.peaks || []).filter((p) => p.score >= c.identifyScore && p.matched >= c.identifyPieces && solid(p));
    let own = null;
    if (this.offset == null) {
      // Chosen by hand, clock not started: wait for solid evidence.
      if (strong.length) own = { peak: earliest(strong, strong[0].score), type: 'jump' };
    } else {
      const predicted = this.offset; // where we expect the peak to be
      const dist = (p) => Math.abs(p.offset - predicted);
      const near = usable.filter((p) => dist(p) <= c.near).sort((a, b) => b.recentScore - a.recentScore);
      if (near.length) own = { peak: near[0], type: 'sync', delta: near[0].offset - predicted };
      else if (strong.length && !held) {
        // A different part of the song (we were lost, or the band skipped a section).
        // Choruses repeat, so among equally good places prefer the one nearest to us.
        const good = strong.filter((p) => p.score >= 0.8 * strong[0].score);
        own = { peak: good.reduce((a, b) => (dist(b) < dist(a) ? b : a)), type: 'jump' };
      }
    }

    // Is a different song clearly playing instead?
    const others = results.filter((r) => r.id !== this.songId && r.peaks.length);
    // A chorus alone can't tell us which repeat we are in: among equally
    // supported places, assume the earliest.
    const byRecent = (r) => {
      const best = Math.max(...r.peaks.map((p) => p.recentScore));
      return r.peaks.filter((p) => p.recentScore >= 0.9 * best).reduce((a, p) => (p.offset < a.offset ? p : a));
    };
    const ownRecent = Math.max(0, ...(current?.peaks || []).map((p) => p.recentScore));
    let rival = null; // { id, peak }
    if (others.length && !held) {
      // Fast: recent evidence alone, clearly ahead of every other song (ours included).
      const ranked = others.map((r) => ({ id: r.id, peaks: r.peaks, peak: byRecent(r) }))
        .sort((a, b) => b.peak.recentScore - a.peak.recentScore);
      const x = ranked[0];
      const nextRecent = Math.max(ownRecent, ranked[1]?.peak.recentScore ?? 0);
      if (x.peak.recentScore >= c.fastScore && x.peak.recent >= c.fastPieces && solid(x.peak) &&
          x.peak.recentScore >= c.margin * nextRecent) {
        rival = x;
      } else {
        // Slow: pooled evidence, clearly ahead of every other song still being heard.
        const y = others[0]; // results are sorted by pooled score
        const nextPooled = Math.max(top(current)?.score ?? 0, top(others[1])?.score ?? 0);
        if (top(y).score >= c.identifyScore && top(y).matched >= c.identifyPieces && solid(top(y)) &&
            top(y).score >= c.margin * nextPooled) {
          rival = { id: y.id, peaks: y.peaks, peak: earliest(y.peaks, top(y).score) };
        }
      }
    }
    if (rival) {
      const lost = !this.songId || this.offset == null || this.finished(now) || this.misses >= c.lostAfter;
      const overwhelming = rival.peak.recentScore >= c.switchScore && ownRecent < 0.5 * rival.peak.recentScore;
      if (lost || overwhelming || this.pendingSwitch === rival.id) {
        const type = this.songId ? 'switch' : 'identify';
        this.songId = rival.id;
        this.offset = anchor(rival.peak);
        this.pendingSwitch = null;
        this.misses = 0;
        this.heardAt = now;
        return { type, songId: rival.id };
      }
      this.pendingSwitch = rival.id; // not sure yet: switch if the next pass agrees
    } else {
      this.pendingSwitch = null;
    }

    if (!own) {
      if (this.running) this.misses++;
      return { type: 'none' };
    }
    if (own.type === 'sync') {
      // Small disagreements are mostly timing noise: move part of the way.
      this.offset += Math.abs(own.delta) < 2 ? own.delta * 0.5 : own.delta;
    } else {
      this.offset = anchor(own.peak);
    }
    this.misses = 0;
    this.heardAt = now;
    return { type: own.type, songId: this.songId };
  }
}

function earliest(peaks, topScore) {
  return peaks.filter((p) => p.score >= 0.9 * topScore).reduce((a, b) => (b.offset < a.offset ? b : a));
}
