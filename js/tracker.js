// Tracker: keeps the "where are we in which song" state.
//
// The position is a running clock (songTime = wallTime + offset). Speech
// recognition results and taps only ever re-anchor that clock, so the lyrics
// keep scrolling smoothly between anchors even when recognition is slow,
// wrong for a while, or switched off entirely.
//
// All times are in seconds. `now` is always passed in (testable, no timers).

const IDENTIFY_SCORE = 2.0; // evidence needed to pick a song from nothing
const IDENTIFY_WORDS = 3;
const IDENTIFY_MARGIN = 1.5; // …and how much better than the runner-up song
const SYNC_SCORE = 1.2; // evidence needed to adjust position within the current song
const SYNC_WORDS = 2;
const NEAR = 8; // seconds: a correction this small is a routine adjustment
const SWITCH_SCORE = 3.2; // evidence needed to abandon a song we are still hearing
const LOST_AFTER = 2; // passes without hearing the current song before we stop trusting it
const MANUAL_HOLD = 25; // seconds a manual choice is protected from being overridden
const END_GRACE = 15; // seconds after the last line before the song counts as over
export const IN_SYNC_FOR = 25; // seconds a confirmation stays "fresh"

export class Tracker {
  /** @param {Record<string,{lines:Array<{t:number,end:number}>}>} songs */
  constructor(songs) {
    this.songs = songs;
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
   * Feed one recognition result.
   * @param results  output of matcher.match()
   * @param clipStart wall time of the clip's first sample
   * @returns {{type:'none'|'sync'|'jump'|'identify'|'switch', songId?:string}}
   */
  onMatch(results, clipStart, now) {
    if (this.pausedAt != null) return { type: 'none' };
    const held = now < this.holdUntil;
    const top = (r) => r?.peaks[0];
    const anchor = (peak) => peak.offset - clipStart; // songTime = (wall − clipStart) + peak.offset

    // What does this clip say about the song we think is playing?
    const current = this.songId ? results.find((r) => r.id === this.songId) : null;
    const usable = (current?.peaks || []).filter((p) => p.score >= SYNC_SCORE && p.matched >= SYNC_WORDS);
    const strong = usable.filter((p) => p.score >= IDENTIFY_SCORE && p.matched >= IDENTIFY_WORDS);
    let own = null;
    if (this.offset == null) {
      // Chosen by hand, clock not started: wait for solid evidence.
      if (strong.length) own = { peak: earliest(strong, strong[0].score), type: 'jump' };
    } else if (usable.length) {
      const predicted = this.offset + clipStart; // where we expect the peak to be
      const dist = (p) => Math.abs(p.offset - predicted);
      const near = usable.filter((p) => dist(p) <= NEAR);
      if (near.length) own = { peak: near[0], type: 'sync', delta: near[0].offset - predicted };
      else if (strong.length && !held) {
        // A different part of the song (we were lost, or the band skipped a section).
        // Choruses repeat, so among equally good places prefer the one nearest to us.
        const good = strong.filter((p) => p.score >= 0.8 * strong[0].score);
        own = { peak: good.reduce((a, b) => (dist(b) < dist(a) ? b : a)), type: 'jump' };
      }
    }

    // Is a different song clearly playing instead?
    const best = results[0];
    const bestTop = top(best);
    if (bestTop && best.id !== this.songId && !held) {
      const runnerUp = Math.max(0, ...results.filter((r) => r !== best).map((r) => top(r)?.score ?? 0));
      const convincing = bestTop.score >= IDENTIFY_SCORE && bestTop.matched >= IDENTIFY_WORDS &&
        bestTop.score >= IDENTIFY_MARGIN * runnerUp;
      if (convincing) {
        const lost = !this.songId || this.offset == null || this.finished(now) || this.misses >= LOST_AFTER;
        const overwhelming = bestTop.score >= SWITCH_SCORE && (top(current)?.score ?? 0) < 0.5 * bestTop.score;
        if (lost || overwhelming || this.pendingSwitch === best.id) {
          const type = this.songId ? 'switch' : 'identify';
          this.songId = best.id;
          // A chorus alone can't tell us which repeat we are in: assume the earliest.
          this.offset = anchor(earliest(best.peaks, bestTop.score));
          this.pendingSwitch = null;
          this.misses = 0;
          this.heardAt = now;
          return { type, songId: best.id };
        }
        this.pendingSwitch = best.id; // not sure yet: switch if the next clip agrees
      } else {
        this.pendingSwitch = null;
      }
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
