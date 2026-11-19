# Kino Live Lyrics

A phone web app for following a **Кино** concert in English. It listens to the
show, works out which song is playing, and scrolls a line-by-line translation in
time with the singing — like the live lyrics in a music app, but for a concert.

Everything runs on the phone. After a one-time download it needs no connection.

## Using it

**Before the show (needs internet once, per phone)**

1. Open the app's address in the phone's browser.
   *iPhone:* tap Share → **Add to Home Screen** first, then open it from the home
   screen and continue there (the home-screen app has its own storage).
2. **Lyrics & translations** download by themselves (tiny).
3. Tap **Download** next to **Song recognition** (77 MB — use Wi-Fi).
4. Try it at home: play a Kino song on a speaker, tap **Start listening**, and
   check the right song opens and the highlighted line keeps up.

**At the show**

- Tap **Start listening** and allow the microphone. After 10–20 seconds of
  singing the song opens and the current line is highlighted. The pill in the
  corner says **In sync** when the app has recently confirmed its position by ear.
- It never has to work by ear: tap a song in the list, then **tap the line you
  hear** and the lyrics follow from there. The `« 1s` / `1s »` buttons nudge the
  timing; tapping any line re-syncs.
- **About** explains what each song is about.

## Putting it on phones

The app is a folder of static files; it needs to be served over **HTTPS**
(browsers only allow the microphone and offline mode on secure pages).

- **GitHub Pages:** repository *Settings → Pages → Deploy from a branch*, pick the
  branch and `/ (root)`. The app appears at `https://<user>.github.io/<repo>/`.
  Pages on a private repository needs a paid GitHub plan; on a free plan the
  repository must be public (it contains no lyrics — see below).
- **Any static host** (Netlify, Cloudflare Pages, …): upload the folder as is.
  There is no build step.

## Songs

Thirty of Kino's best-known songs are in the catalog (`js/songs.js`), each with
a short "about this song" note. To add another, append an entry: titles, the
note, and the lrclib.net record to use. Check that the record is in Cyrillic and
time-synced — the app rejects romanised ones. Phones fetch new songs the next
time they are online.

## Translations

Lyrics and their translations are **not stored in this repository** — the songs
are under copyright. Each phone downloads the time-synced Russian lyrics from
[lrclib.net](https://lrclib.net) plus a machine translation, and keeps them on
the device.

Machine translation of song lyrics is rough. To replace it with something better:

1. **Settings → Copy all lyrics** puts a numbered sheet of every song on the
   clipboard (or **Copy song** in a song's editor, for one at a time).
2. Have the sheet translated — by a person, or by whatever tool you trust.
   Only the text after each number changes; the `## song` headers and the
   numbers stay.
3. **Paste translation** and **Apply**. Lines still in Russian are skipped, so
   a half-finished sheet is fine. Single lines can also be fixed by hand in the
   editor (song → **About** → **Fix the translation…**).
4. To give friends the same translations: **Settings → Export**, send them the
   file, and **Import** it on their phones.

## How it works

| Part | File | What it does |
| --- | --- | --- |
| Lyrics pack | `js/pack.js` | Downloads synced lyrics + translations once, stores them on the phone |
| Listening | `js/listener.js`, `js/recorder-worklet.js` | Microphone → rolling 15-second clips at 16 kHz |
| Recognition | `js/asr-worker.js` | [Whisper](https://github.com/openai/whisper) (base) running on the phone via Transformers.js / WebAssembly, with per-word timestamps |
| Matching | `js/matcher.js` | Every recognised word that occurs in a song votes for a time offset; a cluster of agreeing votes gives the song *and* the position |
| Tracking | `js/tracker.js` | A running clock that recognition (or a tap) re-anchors, so lyrics keep moving between recognitions |
| Offline | `sw.js` | Service worker caches the app; the model is cached by Transformers.js |

Recognition does not need to be good: a handful of correct words in 15 seconds
is enough to pick one song out of the list and find the line, which is why a
small on-device model is workable at all.

## Limits (it is a prototype)

- Recognition was tested with synthetic speech (including under heavy noise),
  **not with real concert audio**. Loud, distorted sound will make it slower or
  unreliable — the tap-to-sync mode is the fallback, and it always works.
- Line timings come from the studio recordings. If the band extends a solo, the
  lyrics run ahead until singing resumes and the app re-syncs (or you tap a line).
- Continuous listening uses a lot of battery. Bring a power bank, or listen only
  to find the song and then switch listening off.
- The screen is kept awake while following a song (iOS 16.4+, recent Android).

## Development

```bash
npm start   # serves the folder at http://localhost:8000 (microphone works on localhost)
```

```bash
npm test    # unit tests for matching, tracking and lyric parsing
```

`vendor/` holds Transformers.js and the ONNX Runtime WebAssembly build
(Apache-2.0 / MIT) so the app does not depend on a CDN.
