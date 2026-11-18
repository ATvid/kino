// Song catalog. Lyrics are NOT stored here — they are downloaded on the device
// from lrclib.net (see pack.js) and cached for offline use.
//
// To add a song: append an entry. `lrclib` is the pinned record id on lrclib.net
// (optional — `query` is used as a fallback search), `duration` is the studio
// track length in seconds and is used to pick the best search result.

export const ARTIST = 'Кино';

export const SONGS = [
  {
    id: 'gruppa-krovi',
    ru: 'Группа крови',
    en: 'Blood Type',
    year: 1988,
    album: 'Blood Type',
    lrclib: 1023396,
    query: 'Группа крови',
    duration: 284,
    about:
      'A soldier’s farewell. He carries his blood type and serial number on his sleeve, ' +
      'asks to be wished luck in battle — and yet says he would not want victory at any price. ' +
      'Released while Soviet troops were still in Afghanistan, it became Kino’s signature song ' +
      'and the track that made them the biggest band in the USSR.',
  },
  {
    id: 'zvezda',
    ru: 'Звезда по имени Солнце',
    en: 'A Star Called the Sun',
    year: 1989,
    album: 'A Star Called the Sun',
    lrclib: 1023458,
    query: 'Звезда по имени Солнце',
    duration: 226,
    about:
      'Written in Almaty during the filming of “The Needle”. A cold, ancient city lives ' +
      'under the light of an ordinary star — the Sun — while wars come and go, and fate ' +
      'favours those who live by their own rules and die young. Sung around every campfire ' +
      'in the Russian-speaking world.',
  },
  {
    id: 'pachka-sigaret',
    ru: 'Пачка сигарет',
    en: 'A Pack of Cigarettes',
    year: 1989,
    album: 'A Star Called the Sun',
    lrclib: 1023752,
    query: 'Пачка сигарет',
    duration: 266,
    about:
      'A weary, deadpan consolation: looking at a foreign sky from a foreign window, ' +
      'nothing feels like home — but as long as there is a pack of cigarettes in your pocket ' +
      'and a plane ticket out, today is not so bad. The crowd sings the chorus.',
  },
  {
    id: 'kukushka',
    ru: 'Кукушка',
    en: 'Cuckoo',
    year: 1990,
    album: 'Black Album',
    lrclib: 4018933,
    query: 'Кукушка',
    duration: 396,
    about:
      'In Russian folklore you ask a cuckoo how long you have left to live and count its calls. ' +
      'Here the singer asks how many songs are still unwritten. One of the last songs ' +
      'Viktor Tsoi recorded before his death in a car crash in August 1990; it was released ' +
      'posthumously on the “Black Album”.',
  },
  {
    id: 'peremen',
    ru: 'Перемен!',
    en: 'Changes!',
    year: 1989,
    album: 'The Last Hero',
    lrclib: 1024010,
    query: 'Хочу перемен',
    duration: 293,
    about:
      'Made famous by the final scene of the 1987 film “Assa”. The chorus — hearts, eyes ' +
      'and veins all demanding change — turned it into the anthem of perestroika and, ' +
      'ever since, of protest movements across the former USSR. Tsoi himself said it was ' +
      'about change within a person, not politics.',
  },
];

export const songById = (id) => SONGS.find((s) => s.id === id);
