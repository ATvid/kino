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
  {
    id: "spokoynaya-noch",
    ru: "Спокойная ночь",
    en: "Good Night",
    year: 1988,
    album: "Blood Type",
    lrclib: 4367381,
    query: "Спокойная ночь",
    duration: 368,
    about:
      "The title is the ordinary Russian “good night”, literally “a calm night”. Night settles over the rooftops; those going to bed are wished a calm one, while those who cannot sleep saddle up and ride out. A slow, hypnotic lullaby with a threat underneath — after Tsoi’s death many fans heard it as a farewell.",
  },
  {
    id: "vosmiklassnitsa",
    ru: "Восьмиклассница",
    en: "Eighth-Grader",
    year: 1982,
    album: "45",
    lrclib: 3821304,
    query: "Восьмиклассница",
    duration: 165,
    about:
      "From Kino’s first album, recorded when Tsoi was twenty. An evening walk with a schoolgirl who chatters about her marks and her dolls while he, a little older, plays along — tender, slightly ironic, and one of the songs that made his name in the Leningrad underground.",
  },
  {
    id: "konchitsya-leto",
    ru: "Кончится лето",
    en: "Summer Will End",
    year: 1990,
    album: "Black Album",
    lrclib: 30145491,
    query: "Кончится лето",
    duration: 355,
    about:
      "Restless and worn out: the days repeat themselves, the answers do not come, and summer is nearly over. Recorded as a demo weeks before Tsoi died in August 1990 and finished by the band afterwards, which is why the title sounds like a premonition.",
  },
  {
    id: "kogda-tvoya-devushka-bolna",
    ru: "Когда твоя девушка больна",
    en: "When Your Girlfriend Is Ill",
    year: 1990,
    album: "Black Album",
    lrclib: 2751869,
    query: "Когда твоя девушка больна",
    duration: 260,
    about:
      "A bright, bouncy tune for a grey mood: the sun is out and everything ought to be fine, but she is ill and he wanders the day alone. Tsoi’s dry humour at its lightest.",
  },
  {
    id: "posledniy-geroy",
    ru: "Последний герой",
    en: "The Last Hero",
    year: 1984,
    album: "Head of Kamchatka",
    lrclib: 1023798,
    query: "Последний герой",
    duration: 187,
    about:
      "A loner’s anthem: night is short, the goal is far, and there is nowhere he particularly wants to go — the chorus greets him with “good morning, last hero”. The phrase stuck to Tsoi himself, who is still called the last hero of Russian rock.",
  },
  {
    id: "mama-my-vse-bolny",
    ru: "Мама, мы все тяжело больны",
    en: "Mama, We’re All Seriously Ill",
    year: 1988,
    album: "Blood Type",
    lrclib: 3821346,
    query: "Мама, мы все тяжело больны",
    duration: 236,
    about:
      "A diagnosis delivered to a mother on behalf of a whole generation: we are all seriously ill, we have all gone mad. Angular and urgent, it captured the nervous energy of the late 1980s.",
  },
  {
    id: "v-nashikh-glazakh",
    ru: "В наших глазах",
    en: "In Our Eyes",
    year: 1988,
    album: "Blood Type",
    lrclib: 33205937,
    query: "В наших глазах",
    duration: 217,
    about:
      "A catalogue of contradictions that a generation carries in its eyes — hope and loss, advance and retreat — ending in a blunt challenge to the listener: what do you want? Choose.",
  },
  {
    id: "zakroy-za-mnoy-dver",
    ru: "Закрой за мной дверь, я ухожу",
    en: "Close the Door Behind Me, I’m Leaving",
    year: 1988,
    album: "Blood Type",
    lrclib: 19812371,
    query: "Закрой за мной дверь",
    duration: 248,
    about:
      "Addressed to those who stay where it is warm, with a home and dinner waiting. He chooses the rain and the road instead, and asks only that the door be shut behind him.",
  },
  {
    id: "voyna",
    ru: "Война",
    en: "War",
    year: 1988,
    album: "Blood Type",
    lrclib: 3821302,
    query: "Война",
    duration: 245,
    about:
      "Not about one particular war: the refrain places a war between earth and sky that goes on wherever you are and whatever you do. A march-tempo meditation on struggle as a permanent condition.",
  },
  {
    id: "trolleybus",
    ru: "Троллейбус",
    en: "Trolleybus",
    year: 1984,
    album: "Head of Kamchatka",
    lrclib: 30307992,
    query: "Троллейбус",
    duration: 174,
    about:
      "Strangers ride a trolleybus heading east; nobody knows where it is going, the engine is rusty, there is no driver — and still it moves. Widely heard as a picture of late-Soviet life drifting along together.",
  },
  {
    id: "alyuminievye-ogurtsy",
    ru: "Алюминиевые огурцы",
    en: "Aluminium Cucumbers",
    year: 1982,
    album: "45",
    lrclib: 3821282,
    query: "Алюминиевые огурцы",
    duration: 177,
    about:
      "Cheerful nonsense: the singer plants aluminium cucumbers in a tarpaulin field. Said to have been written after a student stint of compulsory farm work, it is the most playful song in the catalogue.",
  },
  {
    id: "videli-noch",
    ru: "Видели ночь",
    en: "We Saw the Night",
    year: 1986,
    album: "Night",
    lrclib: 33042799,
    query: "Видели ночь",
    duration: 189,
    about:
      "Pure youthful high spirits — two people leave home and walk the whole night until morning. One of Kino’s few plainly happy songs, and a favourite for covers.",
  },
  {
    id: "eto-ne-lyubov",
    ru: "Это не любовь",
    en: "This Is Not Love",
    year: 1985,
    album: "This Is Not Love",
    lrclib: 3821417,
    query: "Это не любовь",
    duration: 208,
    about:
      "He cannot stop thinking about her, waits for her calls, loses sleep — and keeps insisting that this is not love. A wry pop song from Kino’s lighter mid-80s period.",
  },
  {
    id: "pechal",
    ru: "Печаль",
    en: "Sorrow",
    year: 1989,
    album: "A Star Called the Sun",
    lrclib: 31819162,
    query: "Печаль",
    duration: 315,
    about:
      "A cold, bright, well-ordered city where everything seems to be in its place — so where does this sadness come from? One of Tsoi’s most quietly desolate songs.",
  },
  {
    id: "stuk",
    ru: "Стук",
    en: "Knocking",
    year: 1989,
    album: "A Star Called the Sun",
    lrclib: 4367391,
    query: "Стук",
    duration: 231,
    about:
      "A strange knocking calls him to the road — perhaps his heart, perhaps someone at the door. Time to go; on the threshold he leaves a single word for those who stay: believe.",
  },
  {
    id: "krasno-zheltye-dni",
    ru: "Красно-жёлтые дни",
    en: "Red-and-Yellow Days",
    year: 1990,
    album: "Black Album",
    lrclib: 31287903,
    query: "Красно-жёлтые дни",
    duration: 350,
    about:
      "Autumn as the season of leaving. The red-and-yellow days pass, winter comes and goes, and someone far from home asks to be waited for. From the posthumous Black Album.",
  },
  {
    id: "aprel",
    ru: "Апрель",
    en: "April",
    year: 1989,
    album: "A Star Called the Sun",
    lrclib: 32363005,
    query: "Апрель",
    duration: 275,
    about:
      "April arrives as a person — worn and wounded from the journey, yet bringing the thaw and light with him. A slow, hymn-like song of hope after a long winter.",
  },
  {
    id: "legenda",
    ru: "Легенда",
    en: "Legend",
    year: 1988,
    album: "Blood Type",
    lrclib: 3821340,
    query: "Легенда",
    duration: 248,
    about:
      "The morning after a battle, told like an old ballad: those who fell, those who rode away, and the thought that death is worth living for and love is worth waiting for. It closes the Blood Type album.",
  },
  {
    id: "dalshe-deystvovat-budem-my",
    ru: "Дальше действовать будем мы",
    en: "From Here On, We Act",
    year: 1988,
    album: "Blood Type",
    lrclib: 4367386,
    query: "Дальше действовать будем мы",
    duration: 237,
    about:
      "A generation announcing itself: we want to see further than the windows of the house across the street, we have come to claim our rights — from here on, it is our turn.",
  },
  {
    id: "poprobuy-spet",
    ru: "Попробуй спеть вместе со мной",
    en: "Try to Sing Along with Me",
    year: 1988,
    album: "Blood Type",
    lrclib: 30215144,
    query: "Попробуй спеть вместе со мной",
    duration: 278,
    about:
      "An invitation rather than a statement: get up, stand next to me, try to sing along. At concerts the audience takes him at his word.",
  },
  {
    id: "mesto-dlya-shaga-vpered",
    ru: "Место для шага вперёд",
    en: "Room for a Step Forward",
    year: 1989,
    album: "A Star Called the Sun",
    lrclib: 1023593,
    query: "Место для шага вперёд",
    duration: 220,
    about:
      "He has a home, music, words, friends — everything except room to take a step forward. A tight, funky complaint about standing still.",
  },
  {
    id: "muraveynik",
    ru: "Муравейник",
    en: "The Anthill",
    year: 1990,
    album: "Black Album",
    lrclib: 4725052,
    query: "Муравейник",
    duration: 316,
    about:
      "The city at rush hour seen as an anthill: everyone hurrying, each sure of being right, and life carrying on regardless of who is. Calm, detached, almost documentary.",
  },
  {
    id: "sledi-za-soboy",
    ru: "Следи за собой",
    en: "Watch Yourself",
    year: 1990,
    album: "Black Album",
    lrclib: 909600,
    query: "Следи за собой",
    duration: 298,
    about:
      "A long list of the random disasters that could strike anyone tomorrow, each verse landing on the same advice: watch yourself, be careful. Written in the 1980s, released on the Black Album.",
  },
  {
    id: "nam-s-toboy",
    ru: "Нам с тобой",
    en: "For You and Me",
    year: 1990,
    album: "Black Album",
    lrclib: 909542,
    query: "Нам с тобой",
    duration: 290,
    about:
      "Bleak and tender at once: a cold landscape of night, snow and empty sky, all of it declared to be for the two of us. One of the last songs Tsoi wrote.",
  },
  {
    id: "pesnya-bez-slov",
    ru: "Песня без слов",
    en: "Song Without Words",
    year: 1989,
    album: "A Star Called the Sun",
    lrclib: 3821372,
    query: "Песня без слов",
    duration: 305,
    about:
      "Opens A Star Called the Sun. Everything has its counterpart and its season — and then the question that matters: when the time comes, who will stand up and follow?",
  },
];

export const songById = (id) => SONGS.find((s) => s.id === id);
