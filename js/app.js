import { SONGS, songById } from './songs.js';
import {
  loadPack, savePack, loadBundledPack, buildPack, packIsComplete, missingTranslations, validPack,
} from './pack.js';
import { buildIndex, heardWords, match } from './matcher.js';
import { Tracker } from './tracker.js';
import { Listener, modelIsCached, MODEL_MB } from './listener.js';
import { translit } from './translit.js';

const $ = (id) => document.getElementById(id);
const nowSec = () => performance.now() / 1000;

const LEAD = 0.6; // show each line slightly before it is sung: reading takes time
const TAP_REACTION = 0.4; // people tap a little after the line has started
const GAP_MIN = 5; // seconds without singing that deserve an "instrumental" row
const PACK_KEY = 'kino.pack.v1';
const PREFS_KEY = 'kino.prefs.v1';

// ───────────── state ─────────────

let pack = loadPack();
let index = null;
let tracker = new Tracker({});
const listener = new Listener();
let rows = []; // rendered rows of the open song: { t, el, line? }
let renderedSong = null;
let currentRow = -1;
let userScrolledAt = -Infinity;
let wakeLock = null;
let modelReady = false;
let installPrompt = null;

const prefs = { ru: true, translit: false, heard: false, size: 'm', ...readJson(PREFS_KEY) };

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}

function setPack(next) {
  pack = next;
  const songs = pack?.songs || {};
  index = buildIndex(SONGS.filter((s) => songs[s.id]?.lines?.length).map((s) => ({ id: s.id, lines: songs[s.id].lines })));
  tracker.songs = songs;
  renderHome();
  if (renderedSong) renderLyrics(renderedSong);
}

// ───────────── toast ─────────────

let toastTimer;
function toast(text, ms = 3200) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ───────────── home ─────────────

function setStep(id, state, note, button) {
  const el = $(id);
  el.classList.remove('done', 'working', 'failed');
  if (state) el.classList.add(state);
  if (note != null) el.querySelector('.step-note').textContent = note;
  const btn = el.querySelector('button');
  btn.hidden = !button;
  if (button) btn.textContent = button;
  btn.disabled = state === 'working';
}

function renderLyricsStep() {
  if (packIsComplete(pack)) {
    const missing = missingTranslations(pack);
    if (missing) setStep('step-lyrics', 'failed', `Lyrics saved, but ${missing} lines still need a translation`, 'Retry');
    else setStep('step-lyrics', 'done', `${SONGS.length} songs saved on this phone`, null);
  } else {
    setStep('step-lyrics', '', `${SONGS.length} songs · tiny download`, 'Download');
  }
  $('setup').classList.toggle('done', packIsComplete(pack) && !missingTranslations(pack) && modelReady);
}

function renderModelStep(state, detail = {}) {
  const bar = $('model-bar');
  bar.hidden = state !== 'loading' || !detail.total;
  if (state === 'ready') {
    setStep('step-model', 'done', 'Ready — works without internet', null);
  } else if (state === 'loading') {
    const pct = detail.total ? Math.round((100 * detail.loaded) / detail.total) : 0;
    setStep('step-model', 'working', detail.total ? `Loading… ${pct}%` : 'Starting…', 'Download');
    bar.firstElementChild.style.width = `${pct}%`;
  } else if (state === 'error') {
    setStep('step-model', 'failed', `Couldn’t load: ${detail.message || 'check your connection'}`, 'Retry');
  } else {
    setStep('step-model', '', `Lets the app follow along by ear · ${MODEL_MB} MB, use Wi‑Fi`, 'Download');
  }
  $('setup').classList.toggle('done', packIsComplete(pack) && !missingTranslations(pack) && modelReady);
}

function renderHome() {
  renderLyricsStep();
  const list = $('song-list');
  list.replaceChildren(...SONGS.map((song, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'song';
    btn.classList.toggle('unavailable', !pack?.songs[song.id]?.lines?.length);
    btn.classList.toggle('playing', tracker.songId === song.id && tracker.running);
    btn.innerHTML = `<span class="song-n">${i + 1}</span>
      <span class="song-names"><span class="song-en"></span><span class="song-ru" lang="ru"></span></span>
      <span class="song-go" aria-hidden="true">›</span>`;
    btn.querySelector('.song-en').textContent = song.en;
    btn.querySelector('.song-ru').textContent = `${song.ru} · ${translit(song.ru)}`;
    btn.addEventListener('click', () => {
      if (!pack?.songs[song.id]?.lines?.length) return toast('Download the lyrics first (needs internet once).');
      openSong(song.id, { manual: true });
    });
    li.append(btn);
    return li;
  }));
}

async function downloadLyrics() {
  setStep('step-lyrics', 'working', 'Downloading…', 'Download');
  const { pack: built, errors } = await buildPack(pack, ({ index: i, total, song }) => {
    if (song) setStep('step-lyrics', 'working', `Downloading ${i + 1} of ${total}: ${song.en}…`, 'Download');
  });
  setPack(Object.keys(built.songs).length ? built : null);
  if (errors.length) {
    setStep('step-lyrics', 'failed', navigator.onLine ? errors[0] : 'No internet connection', 'Retry');
  }
}

async function downloadModel() {
  try {
    await listener.loadModel();
  } catch { /* the 'model' event already updated the UI */ }
}

function renderInstallHint() {
  const el = $('install-hint');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return void (el.hidden = true);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  el.hidden = false;
  if (ios) {
    el.textContent = 'On iPhone, first tap Share → “Add to Home Screen”, then open the app from your ' +
      'home screen and do these downloads there — the home-screen app keeps its own storage.';
  } else if (installPrompt) {
    el.textContent = 'Install the app so it opens full-screen and works offline. ';
    const b = document.createElement('button');
    b.className = 'link';
    b.textContent = 'Install';
    b.addEventListener('click', async () => {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      renderInstallHint();
    });
    el.append(b);
  } else {
    el.textContent = 'Tip: use your browser menu → “Add to Home screen” so the app opens full-screen and works offline.';
  }
}

// ───────────── views ─────────────

function show(view) {
  $('home').hidden = view !== 'home';
  $('live').hidden = view !== 'live';
  if (view === 'home') renderHome();
  updateWakeLock();
  window.scrollTo(0, 0);
}

function openSong(id, { manual }) {
  const now = nowSec();
  if (manual && tracker.songId !== id) tracker.setSong(id, now);
  renderLyrics(id);
  show('live');
  tick();
}

function renderLyrics(id) {
  const song = songById(id);
  const lines = pack.songs[id].lines;
  renderedSong = id;
  currentRow = -1;
  $('live-en').textContent = song.en;
  $('live-ru').textContent = song.ru;

  const box = $('lyrics');
  rows = [];
  const addGap = (t, label) => {
    const el = document.createElement('div');
    el.className = 'gap';
    el.innerHTML = '<i></i><i></i><i></i>';
    if (label) el.append(Object.assign(document.createElement('span'), { textContent: label }));
    rows.push({ t, el });
  };
  if (lines[0].t >= GAP_MIN) addGap(0, 'Intro');
  lines.forEach((line, i) => {
    const el = document.createElement('button');
    el.className = 'line';
    const en = Object.assign(document.createElement('span'), { className: 'en', textContent: line.en || translit(line.ru) });
    if (!line.en) en.classList.add('missing');
    const ru = Object.assign(document.createElement('span'), { className: 'ru', textContent: line.ru, lang: 'ru' });
    const tr = Object.assign(document.createElement('span'), { className: 'tr', textContent: translit(line.ru), lang: 'ru-Latn' });
    el.append(en, ru, tr);
    el.addEventListener('click', () => {
      if (tracker.songId !== id) tracker.setSong(id, nowSec());
      tracker.seek(line.t + TAP_REACTION, nowSec());
      userScrolledAt = -Infinity;
      tick();
    });
    rows.push({ t: line.t, el, line });
    const next = lines[i + 1];
    if (next && next.t - line.end >= GAP_MIN) addGap(line.end);
    else if (!next) addGap(line.end + 1, 'End');
  });
  box.replaceChildren(...rows.map((r) => r.el));
  box.scrollTop = 0;
}

function applyPrefs() {
  document.documentElement.dataset.size = prefs.size;
  $('lyrics').classList.toggle('no-ru', !prefs.ru);
  $('lyrics').classList.toggle('no-translit', !prefs.translit);
  $('heard').hidden = !prefs.heard;
  $('opt-ru').checked = prefs.ru;
  $('opt-translit').checked = prefs.translit;
  $('opt-heard').checked = prefs.heard;
  for (const b of $('opt-size').children) b.setAttribute('aria-pressed', String(b.dataset.size === prefs.size));
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ───────────── the follower ─────────────

function tick() {
  if ($('live').hidden) return;
  const now = nowSec();
  const showing = tracker.songId === renderedSong;
  const pos = showing ? tracker.position(now) : null;

  let cur = -1;
  if (pos != null) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].t <= pos + LEAD) cur = i;
      else break;
    }
  }
  if (cur !== currentRow) {
    rows.forEach((r, i) => {
      r.el.classList.toggle('current', i === cur);
      r.el.classList.toggle('past', cur >= 0 && i < cur);
      r.el.classList.toggle('next', cur >= 0 && i === cur + 1);
    });
    currentRow = cur;
    if (cur >= 0 && now - userScrolledAt > 4) {
      rows[cur].el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  const paused = showing && tracker.pausedAt != null;
  $('pause-label').textContent = paused ? 'Resume' : 'Pause';
  $('pause-icon').innerHTML = paused ? '<path d="M8 5l11 7-11 7z"/>' : '<path d="M8 5v14M16 5v14"/>';

  let banner = '';
  if (!showing) banner = 'Another song is playing — tap a line here to switch to this one.';
  else if (paused) banner = 'Paused. Tap a line or Resume to continue.';
  else if (pos == null) {
    banner = listener.listening
      ? 'Listening… the lyrics will start by themselves. Or tap the line you hear.'
      : 'Tap a line when you hear it sung — the lyrics will follow from there.';
  } else if (tracker.finished(now)) {
    banner = listener.listening ? 'Song over — listening for the next one.' : 'Song over. Pick the next one from the list.';
  }
  if ($('banner').textContent !== banner) $('banner').textContent = banner;
  if (listener.listening) updateListenUi();
}

// Runs even when the song list is showing: once recognition has confirmed the
// position, it can check less often.
function housekeeping() {
  listener.relaxed = tracker.inSync(nowSec());
  tick();
}

function onHeard({ text, chunks, clipStart, seconds, ms }) {
  if (!index) return;
  const words = heardWords(chunks, seconds);
  const results = match(index, words);
  const action = tracker.onMatch(results, clipStart, nowSec());
  $('heard').textContent = `Heard (${(ms / 1000).toFixed(1)}s): ${text.trim() || '—'}`;
  console.debug('[kino] heard', JSON.stringify({
    chunks, clipStart: +clipStart.toFixed(2), seconds, action,
    position: tracker.position(nowSec()), top: results.slice(0, 2).map((r) => ({ id: r.id, peaks: r.peaks.slice(0, 2) })),
  }));
  if (action.type === 'identify' || action.type === 'switch') {
    const song = songById(action.songId);
    toast(`Now playing: ${song.en}`);
    openSong(action.songId, { manual: false });
  }
  updateListenUi();
  tick();
}

// ───────────── listening ─────────────

function updateListenUi() {
  const on = listener.listening;
  const loading = on && listener.modelState === 'loading';
  $('listen-home').classList.toggle('listening', on);
  $('listen-live').classList.toggle('listening', on);
  $('listen-live').setAttribute('aria-pressed', String(on));
  $('listen-home-label').textContent = on ? 'Stop listening' : 'Start listening';
  const synced = on && tracker.songId === renderedSong && tracker.inSync(nowSec());
  $('listen-live').classList.toggle('synced', synced);
  $('listen-live-label').textContent = !on ? 'Listen' : loading ? 'Loading…' : synced ? 'In sync' : 'Listening';
  let note = '';
  if (on) {
    if (loading) note = 'Getting the recognition model ready…';
    else if (listener.modelState === 'error') note = 'Recognition isn’t available — connect to the internet once to download it.';
    else if (tracker.running && !tracker.finished(nowSec())) note = `Playing: ${songById(tracker.songId).en}`;
    else note = 'Listening for a song… it can take 10–20 seconds of singing.';
  }
  $('listen-home-note').textContent = note;
}

async function toggleListening() {
  if (listener.listening) {
    listener.stop();
  } else {
    if (!packIsComplete(pack)) toast('Download the lyrics first so there is something to match against.');
    try {
      await listener.start();
    } catch (err) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      toast(denied ? 'Microphone access was blocked. Allow it in your browser settings to follow along by ear.'
        : `Couldn’t start the microphone: ${err?.message || err}`, 6000);
    }
  }
  updateListenUi();
  updateWakeLock();
  tick();
}

// Keep the screen on while following a song.
async function updateWakeLock() {
  const want = (listener.listening || !$('live').hidden) && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not supported or denied: nothing we can do */ }
}

// ───────────── sheets ─────────────

function openAbout() {
  const song = songById(renderedSong);
  $('about-meta').textContent = `${song.year} · ${song.album}`;
  $('about-title').textContent = song.en;
  $('about-ru').textContent = `${song.ru} · ${translit(song.ru)}`;
  $('about-text').textContent = song.about;
  $('about-sheet').showModal();
}

function openEditor() {
  $('about-sheet').close();
  const song = songById(renderedSong);
  $('edit-title').textContent = song.en;
  const seen = new Map(); // repeated lines (choruses) are edited once
  pack.songs[song.id].lines.forEach((line) => {
    if (!seen.has(line.ru)) seen.set(line.ru, line.en);
  });
  $('edit-lines').replaceChildren(...[...seen].map(([ru, en], i) => {
    const wrap = document.createElement('div');
    wrap.className = 'edit-line';
    const label = Object.assign(document.createElement('label'), { textContent: ru, htmlFor: `edit-${i}`, lang: 'ru' });
    const input = Object.assign(document.createElement('input'), { id: `edit-${i}`, value: en, autocomplete: 'off' });
    input.dataset.ru = ru;
    wrap.append(label, input);
    return wrap;
  }));
  $('edit-sheet').showModal();
}

function saveEditor() {
  const values = new Map([...$('edit-lines').querySelectorAll('input')].map((i) => [i.dataset.ru, i.value.trim()]));
  let changed = false;
  for (const line of pack.songs[renderedSong].lines) {
    const v = values.get(line.ru);
    if (v != null && v !== line.en) { line.en = v; changed = true; }
  }
  if (changed) {
    pack.edited = true;
    savePack(pack);
    const pos = tracker.position(nowSec());
    setPack(pack);
    if (pos != null) tick();
    toast('Translation saved on this phone.');
  }
  $('edit-sheet').close();
}

async function exportPack() {
  if (!pack) return toast('Nothing to export yet.');
  const file = new File([JSON.stringify(pack, null, 1)], 'pack.json', { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { return await navigator.share({ files: [file], title: 'Kino lyrics pack' }); } catch { /* cancelled: fall back to download */ }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: 'pack.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importPack(file) {
  try {
    const p = JSON.parse(await file.text());
    if (!validPack(p)) throw new Error('not a lyrics pack');
    p.edited = true;
    savePack(p);
    setPack(p);
    toast('Lyrics pack imported.');
  } catch (e) {
    toast(`Couldn’t import that file (${e.message}).`, 5000);
  }
}

// ───────────── wiring ─────────────

function wire() {
  $('get-lyrics').addEventListener('click', downloadLyrics);
  $('get-model').addEventListener('click', downloadModel);
  $('listen-home').addEventListener('click', toggleListening);
  $('listen-live').addEventListener('click', toggleListening);
  $('back').addEventListener('click', () => show('home'));
  $('about').addEventListener('click', openAbout);
  $('edit-song').addEventListener('click', openEditor);
  $('edit-save').addEventListener('click', saveEditor);
  $('open-settings').addEventListener('click', () => $('settings-sheet').showModal());

  $('nudge-back').addEventListener('click', () => { tracker.nudge(-1, nowSec()); tick(); });
  $('nudge-fwd').addEventListener('click', () => { tracker.nudge(1, nowSec()); tick(); });
  $('pause').addEventListener('click', () => {
    const now = nowSec();
    if (tracker.pausedAt != null) tracker.resume(now);
    else if (tracker.running) tracker.pause(now);
    else toast('Tap a line to start the lyrics.');
    tick();
  });

  for (const type of ['touchmove', 'wheel']) {
    $('lyrics').addEventListener(type, () => { userScrolledAt = nowSec(); }, { passive: true });
  }

  $('opt-ru').addEventListener('change', (e) => { prefs.ru = e.target.checked; applyPrefs(); });
  $('opt-translit').addEventListener('change', (e) => { prefs.translit = e.target.checked; applyPrefs(); });
  $('opt-heard').addEventListener('change', (e) => { prefs.heard = e.target.checked; applyPrefs(); });
  $('opt-size').addEventListener('click', (e) => {
    if (e.target.dataset.size) { prefs.size = e.target.dataset.size; applyPrefs(); }
  });
  $('export-pack').addEventListener('click', exportPack);
  $('import-pack').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importPack(e.target.files[0]);
    e.target.value = '';
  });
  $('redo-translations').addEventListener('click', async () => {
    if (!navigator.onLine) return toast('That needs an internet connection.');
    if (!confirm('Replace the lyrics and translations on this phone with a fresh download? Your edits will be lost.')) return;
    localStorage.removeItem(PACK_KEY);
    pack = null;
    $('settings-sheet').close();
    await downloadLyrics();
  });

  // Light-dismiss for sheets: tap on the backdrop closes.
  for (const sheet of document.querySelectorAll('dialog.sheet')) {
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  }

  listener.addEventListener('heard', (e) => onHeard(e.detail));
  listener.addEventListener('state', updateListenUi);
  listener.addEventListener('model', (e) => {
    modelReady = e.detail.state === 'ready';
    renderModelStep(e.detail.state, e.detail);
    updateListenUi();
  });

  document.addEventListener('visibilitychange', updateWakeLock);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    renderInstallHint();
  });
  window.addEventListener('appinstalled', renderInstallHint);
}

async function init() {
  wire();
  applyPrefs();
  setPack(pack);
  renderModelStep('idle');
  renderInstallHint();
  $('about-app').textContent = 'Lyrics: lrclib.net · Translation: machine-made, editable · Recognition: Whisper, running on this phone.';
  setInterval(housekeeping, 120);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.storage?.persist?.().catch(() => {});

  modelIsCached().then((cached) => {
    if (cached && listener.modelState === 'idle') { modelReady = true; renderModelStep('ready'); }
  });

  // A pack.json published with the app (hand-corrected translations) wins over
  // a machine-made local copy, but never over edits made on this phone.
  const bundled = await loadBundledPack();
  if (bundled && (!pack || (!pack.edited && (bundled.updated || 0) > (pack.updated || 0)))) {
    localStorage.setItem(PACK_KEY, JSON.stringify(bundled));
    setPack(bundled);
  }
  if ((!packIsComplete(pack) || missingTranslations(pack)) && navigator.onLine) downloadLyrics();
}

init();
