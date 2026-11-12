// Rabbit Hole's taste engine: plain functions over one state object, shared by app.js and engine.test.cjs.
(function (root) {
  // Where a new reader starts. After that the feed follows weights, not this list.
  const TOPICS = {
    Philosophy: ['Stoicism', 'Plato', 'Friedrich Nietzsche', 'Existentialism', 'Karl Marx', 'Immanuel Kant', 'Confucius', 'Simone de Beauvoir'],
    History: ['Roman Empire', 'French Revolution', 'Byzantine Empire', 'Mongol Empire', 'Silk Road', 'Meiji Restoration', 'Black Death', 'Ottoman Empire'],
    Art: ['Impressionism', 'Leonardo da Vinci', 'Ukiyo-e', 'Bauhaus', 'Frida Kahlo', 'Baroque', 'Surrealism', 'Vincent van Gogh'],
    Psychology: ['Carl Jung', 'Cognitive dissonance', 'Sigmund Freud', 'Attachment theory', 'Flow (psychology)', 'Stanford prison experiment', 'Collective unconscious', 'Daniel Kahneman'],
    Science: ['General relativity', 'Evolution', 'Quantum mechanics', 'Plate tectonics', 'Marie Curie', 'CRISPR', 'Black hole', 'Periodic table'],
    Economics: ['Adam Smith', 'Keynesian economics', 'Game theory', 'Great Depression', 'Tulip mania', 'Inflation', 'Das Kapital', 'Bretton Woods system'],
    Literature: ['Homer', 'Fyodor Dostoevsky', 'Magic realism', 'William Shakespeare', 'Epic of Gilgamesh', 'Franz Kafka', 'Virginia Woolf', 'Dante Alighieri'],
    Politics: ['Social contract', 'Niccolò Machiavelli', 'Anarchism', 'Liberalism', 'Cold War', 'Hannah Arendt', 'The Federalist Papers', 'Realpolitik'],
    Religion: ['Buddhism', 'Gnosticism', 'Zoroastrianism', 'Sufism', 'Reformation', 'Bhagavad Gita', 'Taoism', 'Dead Sea Scrolls'],
    Mathematics: ["Gödel's incompleteness theorems", 'Euclid', 'Fibonacci sequence', 'Prime number', 'Srinivasa Ramanujan', 'Chaos theory', 'Infinity', 'Alan Turing'],
    Music: ['Johann Sebastian Bach', 'Jazz', 'Ludwig van Beethoven', 'Blues', 'Sonata form', 'Igor Stravinsky', 'Funk', 'Raga'],
    Architecture: ['Gothic architecture', 'Brutalist architecture', 'Le Corbusier', 'Hagia Sophia', 'Frank Lloyd Wright', 'Parthenon', 'Art Deco', 'Angkor Wat'],
  };

  // What each thing you do is worth. Dwell is in dwell() below.
  const W = { like: 3, save: 2, deeper: 2, search: 3 };

  // w: weight per idea. t: weight per topic, which only tunes the look. of: the topic each idea was reached from.
  // from: the idea each idea was reached from, which draws the map. mute: sound off.
  const fresh = () => ({ started: false, topics: [], w: {}, t: {}, of: {}, from: {}, seen: {}, blocked: {}, saved: [], theme: 'dark', mute: false, day: '', today: 0, streak: 0 });

  function bump(s, title, d) {
    if (title) s.w[title] = Math.max(-6, Math.min(12, (s.w[title] || 0) + d));
  }
  // A signal on a card also counts, at half strength, for the idea that led to it:
  // liking what Marx brought you is also a vote for Marx.
  function signal(s, card, d) {
    bump(s, card.title, d);
    if (card.seed && card.seed !== card.title) bump(s, card.seed, d / 2);
    if (card.topic) s.t[card.topic] = (s.t[card.topic] || 0) + d;
  }
  // The topic the reader leans to most, once there is a clear vote; the look follows it.
  const lead = (s) => (Object.entries(s.t).filter((e) => e[1] >= 2).sort((a, b) => b[1] - a[1])[0] || [null])[0];
  function less(s, card) {
    s.blocked[card.title] = 1;
    if (card.topic) s.t[card.topic] = (s.t[card.topic] || 0) - 2;
    bump(s, card.title, -6);
    if (card.seed && card.seed !== card.title) bump(s, card.seed, -1.5);
  }
  // Flicked past in under 1.5s is a small no; 8s to 2min of reading is a small yes; longer is a tab left open.
  const dwell = (ms) => (ms < 1500 ? -0.5 : ms > 8000 && ms < 120000 ? 1 : 0);
  // Reading counts. A day is the local date as 'YYYY-MM-DD'. The streak is days in a row with at least one idea read.
  const dayBefore = (day) => { const d = new Date(day + 'T12:00'); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv'); };
  function read(s, day) {
    if (s.day !== day) { s.streak = s.day === dayBefore(day) ? (s.streak || 0) + 1 : 1; s.day = day; s.today = 0; }
    return ++s.today;
  }
  // What to show before today's first read: nothing yet today, and a streak only if yesterday kept it alive.
  const stats = (s, day) => (s.day === day ? { today: s.today, streak: s.streak } : { today: 0, streak: s.day === dayBefore(day) ? s.streak : 0 });
  // Old interests fade so the feed can move on with you.
  function decay(s) {
    for (const k in s.w) { s.w[k] *= 0.97; if (Math.abs(s.w[k]) < 0.1) delete s.w[k]; }
    for (const k in s.t) s.t[k] *= 0.98;
  }
  const interests = (s, n) => Object.entries(s.w).filter((e) => e[1] > 0.5).sort((a, b) => b[1] - a[1]).slice(0, n);

  // What to fetch next: three in four from what you're into (stronger interests more often), one in four from your topics.
  function plan(s, rnd) {
    const top = interests(s, 10);
    if (top.length && rnd() >= 0.25) {
      let r = rnd() * top.reduce((a, e) => a + e[1], 0);
      for (const [seed, w] of top) if ((r -= w) <= 0) return { kind: 'like', seed };
      return { kind: 'like', seed: top[0][0] };
    }
    const names = s.topics.length ? s.topics : Object.keys(TOPICS);
    const topic = names[Math.floor(rnd() * names.length)];
    const unseen = TOPICS[topic].filter((t) => !s.seen[t]);
    if (unseen.length) return { kind: 'explore', topic, titles: unseen.sort(() => rnd() - 0.5).slice(0, 3) };
    return { kind: 'explore', topic, seed: TOPICS[topic][Math.floor(rnd() * TOPICS[topic].length)], offset: Math.floor(rnd() * 30) };
  }

  const DULL = /^(Lists?|Timeline|Outline|Index|Bibliography|Biographies|Glossary) of |^\d{3,4}s? in |\(disambiguation\)/;
  function accept(s, p, evenIfSeen) {
    return !s.blocked[p.title] && (evenIfSeen || !s.seen[p.title]) && !DULL.test(p.title) &&
      !(p.pageprops && 'disambiguation' in p.pageprops) && (p.extract || '').length >= 200;
  }

  // Wikipedia's plain text leaves "( ; born 1818)" where the pronunciation was; tidy it, then cut at a sentence.
  function trim(t, max) {
    t = t.replace(/\s*\(\s*[;,]?\s*\)/g, '').replace(/\(\s*[;,]\s*/g, '(').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max), i = cut.lastIndexOf('. ');
    return i > max * 0.4 ? cut.slice(0, i + 1) : cut.replace(/\s\S*$/, '') + '…';
  }

  const API = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1' +
    '&prop=extracts|pageimages|description|pageprops&ppprop=disambiguation|wikibase_item&exintro=1&explaintext=1&exlimit=20' +
    '&piprop=thumbnail&pithumbsize=960&pilimit=20';
  // q is { titles: [...] } or { search: 'text', limit, offset }; "morelike:Title" as the search text finds related articles.
  const url = (q) => API + (q.titles
    ? '&titles=' + encodeURIComponent(q.titles.join('|'))
    : '&generator=search&gsrnamespace=0&gsrlimit=' + (q.limit || 20) + '&gsroffset=' + (q.offset || 0) + '&gsrsearch=' + encodeURIComponent(q.search));
  const pages = (json) => Object.values((json.query || {}).pages || {}).filter((p) => !('missing' in p)).sort((a, b) => (a.index || 0) - (b.index || 0));
  const link = (title) => 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));

  // The first time you stop on an idea, remember the idea that led to it, if you had stopped on that one too.
  // A parent is always seen before its child, so the map can never loop.
  function see(s, title, seed) {
    if (!s.seen[title] && s.seen[seed]) s.from[title] = seed;
    s.seen[title] = 1;
  }
  // Your burrow: one entrance per topic, each idea hung under the idea that led to it (or under its topic).
  function tree(s) {
    const ideas = {}, roots = {};
    const idea = (title) => ideas[title] || (ideas[title] = { title, kids: [] });
    for (const t of Object.keys(s.seen)) {
      if (s.blocked[t]) continue;
      const up = s.from[t], top = s.of[t] || 'Elsewhere';
      const parent = up && s.seen[up] && !s.blocked[up] ? idea(up) : roots[top] || (roots[top] = { title: top, kids: [] });
      parent.kids.push(idea(t));
    }
    return Object.values(roots);
  }

  // The article's own pictures, in reading order, from Wikipedia's media list: the ones large enough to fill a card.
  // Drawings stored as .svg are mostly icons, flags and signatures, so they are left out.
  const mediaUrl = (title) => 'https://en.wikipedia.org/api/rest_v1/page/media-list/' + encodeURIComponent(title.replace(/ /g, '_'));
  function media(json) {
    const out = [];
    for (const x of json.items || []) {
      const best = (x.srcset || []).slice(-1)[0];
      if (x.type !== 'image' || !x.showInGallery || !best || /\.svg$/i.test(x.title) || !(+(/\/(\d+)px-/.exec(best.src) || [])[1] >= 500)) continue;
      out.push({ src: best.src.replace(/^\/\//, 'https://'), name: x.title.replace(/^File:/, ''), caption: ((x.caption && x.caption.text) || '').replace(/\[\d+\]/g, '').trim(), lead: !!x.leadImage });
    }
    return out;
  }

  // Paintings of the idea, from Wikimedia Commons: files recorded there as reproductions of an artwork (P6243) that
  // depicts (P180) this very article's subject. Asking by the subject's Wikidata number, not by its name, keeps them on topic.
  const artUrl = (qid) => 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=12' +
    '&prop=imageinfo&iiprop=url|size|extmetadata&iiextmetadatafilter=ObjectName|Artist|DateTimeOriginal&iiurlwidth=1920' +
    '&gsrsearch=' + encodeURIComponent('haswbstatement:P180=' + qid + ' haswbstatement:P6243 filetype:bitmap');
  function art(json) {
    const plain = (v) => String((v && v.value) || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const out = [], seen = new Set();
    for (const p of Object.values((json.query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0))) {
      const i = (p.imageinfo || [])[0], name = (p.title || '').replace(/^File:/, '');
      if (!i || !i.thumburl || !(i.width >= 1000)) continue;
      const m = i.extmetadata || {}, title = plain(m.ObjectName).replace(/\s*(title|label) QS:.*$/, '').replace(/^[A-Z][a-z]+: /, '') || name.replace(/\.\w+$/, ''); // Commons adds machine tails and a language prefix
      const key = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16); // museums upload the same painting several times
      if (seen.has(key)) continue;
      seen.add(key);
      // the "artist" of a recent upload is its photographer, so a name is given only with a year old enough to be the work's
      const year = +(/\b(1\d{3}|[5-9]\d{2})\b/.exec(plain(m.DateTimeOriginal)) || [])[1], by = plain(m.Artist);
      out.push({ src: i.thumburl, name, caption: year < 1960 ? [title, !/unknown|anonym|unidentified/i.test(by) && by.length < 60 && by, year].filter(Boolean).join(', ') : title });
      if (out.length === 4) break;
    }
    return out;
  }

  // The recut: instead of the article's opening paragraph, its three most striking sentences, one from each of
  // three different sections, in reading order. No AI: a sentence scores for words that mark a turn, a first, a
  // conflict or a verdict, and for carrying a number. The opening definition is always left out.
  const fullUrl = (title) => 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=extracts&explaintext=1&titles=' + encodeURIComponent(title);
  const HOOK = /\b(first|only|never|famous|infamous|best known|known for|despite|although|secret|killed|executed|murdered|assassinat|banned|tortured|exiled|arrested|imprison|invented|discovered|founded|revolution|controvers|scandal|myth|legend|largest|greatest|oldest|most \w+|considered|regarded|called|nicknamed|so-called|refused|rejected|collapse|destroyed|survived|died|death|war|rebel|forbidden|heresy|influen|changed|transformed|origin|unknown|mystery|paradox|ironically|surprising|contrary|in fact|turning point)/gi;
  const END = /^(See also|References|Notes|Further reading|External links|Bibliography|Sources|Citations|Footnotes|Gallery|Works|Selected works|Publications|Writings|Filmography|Discography|Explanatory notes|Works cited|In popular culture)$/i;
  const LOOSE = /^(In this|In that|In these|As such|This|These|Those|Such|However|Moreover|Furthermore|Thus|Therefore|Hence|For example|For instance|In addition|Additionally|Another|Others?|Also|Similarly|Likewise|Nevertheless|Nonetheless|Instead|Later|Then|There|Here|Both|Some|Many|The latter|The former|As a result|In contrast|On the other hand|According)\b/;
  // A sentence lifted from deep in an article must stand alone: it has to name the subject and not lean on the line before it.
  const LEANS = /^(He|She|It|They|His|Her|Its|Their|Only|Because|After|Before|During|When|While|By|At|But|And|Yet|So)\b/;
  function recut(text, title) {
    const best = []; // the strongest sentence of each section; each paragraph of the opening counts as a section
    const names = String(title || '').replace(/\(.*?\)/g, '').split(/[\s,]+/).filter((w) => w.length > 3);
    const named = (s) => names.some((w) => s.includes(w));
    let label = '', n = 0, done = false, first = true;
    for (const block of String(text || '').split(/\n+/)) {
      const head = /^(=+)\s*(.+?)\s*=+$/.exec(block);
      if (head) { if (head[1].length === 2) { label = head[2]; done = END.test(label); n++; } continue; }
      if (done || !block.trim()) continue;
      if (!label) n++;
      const sentences = block.match(/\S.*?[a-z\d)"”]{2}[.!?]["”]?(?=\s+[A-Z“"(]|\s*$)/g) || [];
      sentences.forEach((raw) => {
        const s = raw.replace(/\s*\(\s*[;,]?\s*\)/g, '').replace(/\s+/g, ' ').trim();
        if (first) { first = false; return; } // the opening definition
        if (s.length < 70 || s.length > 190 || LOOSE.test(s) || /[{}=\\|<>—]|ISBN|\bpp?\.|e\.g\.|:$/.test(s) || (s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length) return;
        if (label && (LEANS.test(s) || !named(s))) return;
        const score = (s.match(HOOK) || []).length * 2 + (/\d/.test(s) ? 1 : 0) + (label ? 0 : 2);
        const slot = best.find((b) => b.n === n);
        if (!slot) best.push({ n, label, text: s, score }); else if (score > slot.score) Object.assign(slot, { text: s, score });
      });
    }
    // two lines from the opening at most, so one comes from further in when the article has a good one
    const ranked = best.filter((b) => b.score >= 2).sort((a, b) => b.score - a.score), deep = ranked.find((b) => b.label);
    const top = (deep ? [...ranked.filter((b) => !b.label).slice(0, 2), deep, ...ranked.filter((b) => b.label && b !== deep)] : ranked).slice(0, 3).sort((a, b) => a.n - b.n);
    return top.length === 3 ? top.map((b) => ({ label: b.label, text: b.text })) : null; // too little to choose from: keep the opening
  }

  // Book recommendations: Open Library's best matches for the idea's name (keyless). An idea too narrow to have
  // books of its own (under 40 matches is mostly noise) returns nothing, and the caller tries the idea that led to it.
  const booksUrl = (q) => 'https://openlibrary.org/search.json?limit=12&language=eng&fields=title,author_name,first_publish_year,cover_i,key&q=' + encodeURIComponent(q);
  function books(json) {
    if (!(json.numFound >= 40)) return [];
    const seen = {}, out = [];
    for (const d of json.docs || []) {
      const id = String(d.title || '').toLowerCase().replace(/^(the|a|an) /, '').replace(/[^a-z0-9]+/g, ' ').trim();
      if (!id || seen[id] || !d.key) continue; // one edition of each book
      seen[id] = 1;
      out.push({ title: d.title, by: (d.author_name || []).slice(0, 2).join(', '), year: d.first_publish_year || '', cover: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-M.jpg' : '', url: 'https://openlibrary.org' + d.key });
    }
    return out.sort((a, b) => !a.cover - !b.cover).slice(0, 4); // books with a cover first, otherwise Open Library's order
  }

  const RH = { booksUrl, books, fullUrl, recut, TOPICS, W, fresh, bump, signal, lead, less, dwell, read, stats, decay, interests, plan, accept, trim, url, pages, link, see, tree, mediaUrl, media, artUrl, art };
  if (typeof module !== 'undefined') module.exports = RH; else root.RH = RH;
})(this);
