'use strict';
/* global RH */
const KEY = 'rabbit-hole.v1';
const $ = (sel, el = document) => el.querySelector(sel);
// Everything from Wikipedia goes in as text through here, never as HTML.
function h(tag, props, ...kids) {
  const el = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k) el.append(k);
  return el;
}

// shortcut: every title ever seen is kept in localStorage (about 25 bytes each); prune the oldest if it nears the 5MB limit.
const state = RH.fresh();
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* private window or a damaged save: start fresh */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked: keep running */ } };

// index.html?start=Philosophy,History skips the first-run card.
const preset = (new URLSearchParams(location.search).get('start') || '').split(',').filter((t) => RH.TOPICS[t]);
if (!state.started && preset.length) { state.topics = preset; state.started = true; }

const feed = $('#feed'), tail = $('#tail'), note = $('#tail-note'), retry = $('#retry');
const shown = new Set();   // titles with a card in this session's feed
const trail = [];          // cards you stopped on, in order
const depth = {};          // how deep in a chain each idea sits, this session
const offsets = {};        // how far down each idea's related list we have read
let active = null, since = Date.now(), busy = false, readTimer = 0, toastTimer = 0, picTimer = 0, deepest = 2;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function get(q) {
  const r = await fetch(RH.url(q));
  if (!r.ok) throw new Error('Wikipedia answered ' + r.status);
  return RH.pages(await r.json());
}

// ---- feel: the moving backdrop, what is next, the counters and their small rewards ----
// The hole: a plate that engraves itself, after the Copperplate Engraving style in the Lemo-Opuscar library
// (tone is made of lines, never fills; every line swells and tapers; one light, from the upper left).
// You look down it. Each card you move to drops you one ring; a like or a finished read sends a bright ring up it.
const hole = (() => {
  const cv = $('.back'), g = cv.getContext('2d'), TAU = Math.PI * 2, LIGHT = -2.2;
  const hash = (n) => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  let W = 0, H = 0, z = 0, target = 0, last = 0, pulseAt = -1e9;
  const born = still ? -1e9 : performance.now();
  // one burin stroke: fine at both ends, widest in the middle
  function lens(x0, y0, x1, y1, w) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w;
    g.moveTo(x0, y0); g.quadraticCurveTo(mx + nx, my + ny, x1, y1); g.quadraticCurveTo(mx - nx, my - ny, x0, y0);
  }
  function draw(now) {
    const root = document.documentElement, dark = root.dataset.theme !== 'light';
    const hue = parseFloat(getComputedStyle(root).getPropertyValue('--hue')) || 185;
    const R0 = 0.62 * Math.hypot(W, H), cut = (now - born) / 2600, age = (now - pulseAt) / 1300;
    g.clearRect(0, 0, W, H);
    for (let i = Math.ceil(z - 1.2); i < z + 12; i++) {
      const d = i - z, r = R0 * Math.pow(0.7, d);
      if (r < 16) break;
      const x = W / 2 + Math.sin(i * 1.7) * r * 0.07, y = H / 2 + Math.cos(i * 2.3) * r * 0.05; // the burrow bends a little
      const near = Math.min(1, r / R0), wave = age < 1 ? Math.max(0, 1 - Math.abs(r - age * R0 * 1.1) / (R0 * 0.2)) * (1 - age) : 0;
      const alpha = (dark ? 0.22 + 0.42 * near : 0.12 + 0.28 * near) * Math.min(1, (d + 1.2) * 2) + wave * 0.5;
      g.fillStyle = `oklch(${dark ? 0.82 : 0.32} ${0.08 + wave * 0.08} ${hue} / ${Math.min(1, alpha).toFixed(3)})`;
      g.beginPath();
      const n = Math.max(28, Math.min(170, Math.round(r / 6))), wide = Math.max(0.5, Math.min(2.4, r / 320));
      for (let j = 0; j < n; j++) {
        const ang = (j + hash(i * 57 + j) * 0.7) / n * TAU, tone = 0.5 - 0.5 * Math.cos(ang - LIGHT);
        if (tone < 0.14 && hash(i * 13 + j * 7) > 0.25) continue; // the lit side is left as bare plate
        const grow = Math.max(0, Math.min(1, (cut - (j / n) * 0.7 - Math.max(0, d) * 0.05) * 6)); // cut once, sweeping round each ring
        if (!grow) continue;
        const len = r * (0.04 + 0.2 * tone) * (0.7 + 0.6 * hash(i * 91 + j * 3)) * grow, c = Math.cos(ang), s = Math.sin(ang);
        lens(x + c * r, y + s * r, x + c * (r - len), y + s * (r - len), wide * (0.25 + tone));
        if (tone > 0.62 && j % 2) { // a second family crossing the first, only where the wall is in shadow
          const rr = r * (0.97 - 0.1 * hash(i + j)), t = TAU / n * 0.9;
          lens(x + Math.cos(ang - t) * rr, y + Math.sin(ang - t) * rr, x + Math.cos(ang + t) * rr, y + Math.sin(ang + t) * rr, wide * 0.5 * grow);
        }
      }
      for (let k = 0; k < 7; k++) { // the rim, cut in runs that thin where one hands over to the next
        if (cut < k / 14) continue;
        const a0 = (k + 0.06) / 7 * TAU + i, a1 = (k + 0.94) / 7 * TAU + i, am = (a0 + a1) / 2, rc = r / Math.cos((a1 - a0) / 2), w = wide * 1.6;
        g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
        g.quadraticCurveTo(x + Math.cos(am) * (rc + w), y + Math.sin(am) * (rc + w), x + Math.cos(a1) * r, y + Math.sin(a1) * r);
        g.quadraticCurveTo(x + Math.cos(am) * (rc - w), y + Math.sin(am) * (rc - w), x + Math.cos(a0) * r, y + Math.sin(a0) * r);
      }
      g.fill();
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 32) return; // about 30 frames a second is plenty for something this slow
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    target += dt * 0.02; z += (target - z) * (1 - Math.exp(-dt * 4));
    draw(now);
  }
  function resize() { W = cv.width = innerWidth; H = cv.height = innerHeight; draw(performance.now()); }
  addEventListener('resize', resize); resize();
  if (!still) requestAnimationFrame(frame);
  return {
    fall(d) { target += d; if (still) { z = target; draw(performance.now()); } },
    pulse() { pulseAt = performance.now(); },
  };
})();

// The title is cut letter by letter, as an engraver letters a plate; screen readers get it whole.
function cutTitle(title) {
  let i = 0;
  const el = h('h2', { className: title.length > 28 ? 'long' : '', ariaLabel: title });
  title.split(' ').forEach((word, n) => {
    const w = h('span', { className: 'w', ariaHidden: 'true' });
    for (const ch of word) { const glyph = h('span', { className: 'g', textContent: ch }); glyph.style.setProperty('--i', i++); w.append(glyph); }
    el.append(n ? ' ' : '', w);
  });
  return el;
}

function drawNext() {
  const next = [];
  for (let n = active && active.nextElementSibling; n && n._page && next.length < 3; n = n.nextElementSibling) next.push(n);
  $('#upnext').replaceChildren(...next.map((c) => {
    const p = c._page, img = $('.pic img', c);
    const b = h('button', { type: 'button' }, img ? h('img', { src: img.src, alt: '' }) : h('span', { className: 'noimg', textContent: p.title.charAt(0) }),
      h('span', { className: 'name' }, h('b', { textContent: p.title }), p.description && h('small', { textContent: cap(p.description) })));
    b.onclick = () => c.scrollIntoView();
    return h('li', null, b);
  }));
  $('.upnext').hidden = !next.length;
}

const today = () => new Date().toLocaleDateString('sv'); // local date as YYYY-MM-DD
const READ = { 5: '5 ideas today. Warmed up.', 10: '10 ideas today. That is a lecture’s worth.', 25: '25 today. The feed knows you well by now.', 50: '50 today.' };
const DEEP = { 3: '3 deep.', 5: '5 deep. A long way from where you started.', 8: '8 deep. A proper rabbit hole.', 12: '12 deep.' };
function drawStats(pop) {
  const s = RH.stats(state, today()), d = active && active._page ? depth[active._page.title] : 0;
  $('#s-today').textContent = s.today; $('#s-streak').textContent = s.streak; $('#s-depth').textContent = d || '–';
  if (pop) { const el = $('#s-today'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}
// Eight seconds on a card is a read: the same line the feed uses to count it as interest.
function markRead(card) {
  card._read = true; card.classList.add('done'); hole.pulse(); sfx('read');
  const n = RH.read(state, today());
  drawStats(true); save();
  if (READ[n]) toast(READ[n]); else if (n === 1 && state.streak > 1) toast(state.streak + ' days in a row.');
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
// Sound: three small synthesised marks, no files. The switch is on Your interests, or press m.
const SOUNDS = { // each note: pitch in Hz, when it starts (s), how long it rings (s), how loud
  down: [[294, 0, 0.1, 0.06]], up: [[392, 0, 0.1, 0.06]],
  like: [[659, 0, 0.16, 0.05], [988, 0.09, 0.32, 0.05]],
  read: [[523, 0, 0.5, 0.03]],
};
let audio = null;
function sfx(name) {
  if (state.mute) return;
  try { audio = audio || new AudioContext(); } catch { return; } // no sound on this device: the app is the same without it
  if (audio.state !== 'running') { audio.resume(); return; } // browsers hold sound back until the first click or key press
  const t = audio.currentTime;
  for (const [pitch, at, len, vol] of SOUNDS[name]) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = pitch;
    g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(vol, t + at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
    o.connect(g).connect(audio.destination); o.start(t + at); o.stop(t + at + len + 0.02);
  }
}

// Listen: the browser's own voice reads the idea on screen, then the feed moves on by itself, like a reel.
// shortcut: one utterance per card; some Chrome voices stop after about 15 seconds, split into sentences if that shows up.
const canSpeak = 'speechSynthesis' in window;
let listening = false, saying = null;
function speak(card) {
  speechSynthesis.cancel(); saying = null;
  if (!listening || !card || !card._page) return;
  const last = say(card._say);
  last.onend = () => setTimeout(() => { if (saying === last && listening) step(1); }, 900);
}
// English voices, best first: the neural ones (Edge "Natural", Apple "Premium" / "Enhanced" / Siri) sound human, the rest robotic.
// Apple also lists joke and 1980s robot voices (Albert, Bells, Zarvox...) and they sort first by alphabet: those are left out.
const JOKE = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Fred|Good News|Jester|Junior|Kathy|Organ|Superstar|Ralph|Trinoids|Whisper|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/;
const grade = (n) => /Natural/.test(n) ? (/Ava|Andrew|Emma|Brian/.test(n) ? 7 : 6) + (/Multilingual/.test(n) ? 0.5 : 0)
  : /Premium/.test(n) ? 5 : /Enhanced|Siri/.test(n) ? 4 : /Google/.test(n) ? 2 : /Samantha|Daniel|Karen|Moira|Tessa/.test(n) ? 1 : 0;
const voices = () => speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang) && !JOKE.test(v.name))
  .map((v) => [grade(v.name) + (/^en[-_](US|GB)/i.test(v.lang) ? 0.2 : 0), v]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
// Read sentence by sentence, a little slower than the default, so there is a breath between sentences. Returns the last utterance.
function say(text) {
  const all = voices(), voice = all.find((v) => v.name === state.voice) || all[0] || null;
  let u = null;
  for (const part of text.match(/[^.!?]+[.!?]+["”)]?|[^.!?]+$/g) || [text]) {
    if (!part.trim()) continue;
    u = new SpeechSynthesisUtterance(part.trim());
    u.lang = 'en'; u.voice = voice; u.rate = 0.9;
    speechSynthesis.speak(u);
  }
  return saying = u; // kept so the browser cannot drop it before it ends
}
function listen(on) {
  listening = on && canSpeak;
  $('#listen').ariaPressed = String(listening);
  if (canSpeak) speak(active);
}
$('#listen').hidden = !canSpeak;
$('#listen').onclick = () => listen(!listening);
if (canSpeak) { // the voice list loads late: ask early, and redraw the voice picker when it arrives
  speechSynthesis.getVoices(); addEventListener('pagehide', () => speechSynthesis.cancel());
  speechSynthesis.addEventListener('voiceschanged', () => { if (document.body.dataset.view === 'interests') drawInterests(); });
}

function burst(x, y) {
  if (still) return;
  const el = h('div', { className: 'burst' });
  el.style.left = x + 'px'; el.style.top = y + 'px';
  for (let i = 0; i < 12; i++) { const dot = h('i'); dot.style.setProperty('--a', i * 30 + 'deg'); dot.style.setProperty('--d', 36 + Math.random() * 56 + 'px'); el.append(dot); }
  document.body.append(el);
  setTimeout(() => el.remove(), 800);
}

// ---- cards ----
const sig = (card) => ({ title: card._page.title, seed: card._because.seed, topic: state.of[card._page.title] });

// The look caters to the reader: dark or light as chosen, and tinted toward the topic they lean to most.
const HUES = { Philosophy: 185, History: 65, Art: 355, Psychology: 235, Science: 150, Economics: 110, Literature: 35, Politics: 255, Religion: 85, Mathematics: 210, Music: 335, Architecture: 165 };
function applyLook() {
  document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  document.documentElement.style.setProperty('--hue', HUES[RH.lead(state)] || 185);
}
applyLook();
const isSaved = (title) => state.saved.some((x) => x.title === title);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const btn = (name, label, cls, pressed) => h('button', { type: 'button', name, className: cls, textContent: label, ariaPressed: String(!!pressed) });

// A card's own buttons each carry a small engraved mark, so they are told apart at a glance. The marks are fixed
// drawings of ours (never page text); every stroke has pathLength 1 so the stylesheet can draw it in like a burin cut.
const MARK = {
  like: '<circle cx="12" cy="12" r="8.5" pathLength="1"/><path d="M12 8v8" pathLength="1"/><path d="M8 12h8" pathLength="1"/>',
  less: '<circle cx="12" cy="12" r="8.5" pathLength="1"/><path d="M8 12h8" pathLength="1"/>',
  books: '<path d="M12 6.5c-2-1.3-4.5-1.6-7-1v12c2.5-.6 5-.3 7 1 2-1.3 4.5-1.6 7-1v-12c-2.5-.6-5-.3-7 1z" pathLength="1"/><path d="M12 6.5v12" pathLength="1"/>',
  save:'<path d="M7 4h10v16l-5-4-5 4z" pathLength="1"/><path class="hatch" d="M9.5 8.5l5-2" pathLength="1"/><path class="hatch" d="M9.5 11.5l5-2" pathLength="1"/><path class="hatch" d="M9.5 14.5l5-2" pathLength="1"/>',
  more: '<path d="M5 7h14" pathLength="1"/><path d="M5 12h14" pathLength="1"/><path d="M5 17h9" pathLength="1"/>',
};
function act(name, label, pressed) {
  return h('button', { type: 'button', name, className: 'btn act ' + name, ariaPressed: String(!!pressed), title: label },
    h('span', { className: 'mark', ariaHidden: 'true', innerHTML: `<svg viewBox="0 0 24 24" width="20" height="20">${MARK[name]}</svg>` }),
    h('span', { className: 'lab', textContent: label }));
}
const relabel = (b, text) => { $('.lab', b).textContent = text; b.title = text; };

function becauseLine(b) {
  const [lead, name] = b.kind === 'like' ? ["Because you're into", b.seed]
    : b.kind === 'deeper' ? ['Deeper from', b.seed]
    : b.kind === 'search' ? ['You searched for', b.query]
    : b.kind === 'back' ? ['Back to it from', 'your map'] : ['From', b.topic];
  return h('p', { className: 'because' }, h('i'), lead + ' ', h('b', { textContent: name }), b.depth > 1 && ` · ${b.depth} deep`);
}

function makeCard(p, because) {
  const pic = p.thumbnail && p.thumbnail.width >= 400 && p.thumbnail;
  // The first sentence is the hook and is set brighter; "c. 551" and the like are not sentence ends.
  const text = RH.trim(p.extract, 560), first = /^.{40,}?[a-z\d)"]{2}\. (?=[A-Z])/.exec(text), cut = first ? first[0].length : text.length;
  const el = h('article', { className: pic ? 'card' : 'card nopic' },
    h('div', { className: 'sheet' },
      h('i', { className: 'read' }),
      pic && h('figure', { className: 'pic' }, h('img', { src: pic.source, alt: p.title })),
      h('div', { className: 'text' },
        becauseLine(because),
        cutTitle(p.title),
        p.description && h('p', { className: 'desc', textContent: cap(p.description) }),
        h('p', { className: 'extract' }, h('b', { textContent: text.slice(0, cut) }), text.slice(cut)),
        h('div', { className: 'shelf', hidden: true }),
        h('div', { className: 'under' },
          Object.assign(act('more', 'Read full text'), { hidden: true }), // sits where the text is cut; fit() shows it
          act('books', 'Book recommendations')),
        h('div', { className: 'acts' },
          act('like', 'Show more like this'),
          act('save', isSaved(p.title) ? 'Saved for later' : 'Save for later', isSaved(p.title)),
          act('less', 'Show less like this')),
        h('a', { className: 'wiki', href: RH.link(p.title), target: '_blank', rel: 'noopener', textContent: 'Wikipedia ↗', title: 'Read the whole article on Wikipedia' })),
      h('div', { className: 'deeper', hidden: true }, h('h3', { textContent: 'Go deeper' }), h('ul'))));
  el._page = p; el._because = because; el._say = p.title + '. ' + text;
  watch.observe(el);
  fitter.observe($('.extract', el));
  return el;
}

// A small screen has no room for the whole text. Show whole lines only, as many as fit, and offer "Read all" for the rest.
function fit(card) {
  const ex = card && $('.extract', card), more = card && $('button[name=more]', card);
  if (!ex || !more) return;
  const open = card.classList.contains('open'), cs = getComputedStyle(ex), line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.55;
  const whole = () => { // true when some of the text is cut
    ex.style.webkitLineClamp = '';
    if (!open) ex.style.webkitLineClamp = Math.max(1, Math.floor((ex.clientHeight + 1) / line));
    return ex.scrollHeight > ex.clientHeight + 2;
  };
  more.hidden = !open;
  if (!open && whole()) { more.hidden = false; whole(); } // the button takes room itself, so measure again with it showing
}
// Room changes when the chips, a picture or the fonts arrive, and when the window does; a frame later keeps the observer out of its own way.
const fitter = new ResizeObserver((es) => requestAnimationFrame(() => { for (const e of es) fit(e.target.closest('.card')); }));

// The words: not the article's opening paragraph but its three most striking lines (RH.recut), each marked with the
// section it came from. Fetched while the card waits in the queue; if it fails, the opening paragraph stays.
async function loadCut(card) {
  try {
    const r = await fetch(RH.fullUrl(card._page.title));
    if (!r.ok) return;
    const cut = RH.recut((RH.pages(await r.json())[0] || {}).extract, card._page.title);
    if (!cut) return;
    $('.extract', card).replaceChildren(...cut.flatMap((b, i) => [i && h('br'), h('small', { textContent: b.label }), i ? b.text : h('b', { textContent: b.text })]).filter(Boolean));
    card._say = card._page.title + '. ' + cut.map((b) => b.text).join(' ');
    fit(card);
  } catch { /* the opening paragraph stays */ }
}

// Book recommendations: Open Library's best matches for the idea, fetched the first time the button is pressed.
// An idea too narrow to have books of its own falls back to the idea that led to it.
async function loadBooks(card) {
  if (card._books) return;
  card._books = true;
  const box = $('.shelf', card), say = (text) => h('p', { textContent: text });
  box.replaceChildren(say('Finding books'));
  try {
    let found = [], about = '';
    for (const q of [card._page.title.replace(/\s*\(.*?\)/g, ''), card._because.seed]) {
      if (!q || found.length) continue;
      const r = await fetch(RH.booksUrl(q));
      if (!r.ok) throw new Error('Open Library answered ' + r.status);
      found = RH.books(await r.json()); about = q;
    }
    box.replaceChildren(...(found.length ? [say(`If you liked this, read more on ${about} here`), ...found.map((d) => h('a', { href: d.url, target: '_blank', rel: 'noopener' },
      d.cover ? h('img', { src: d.cover, alt: '', loading: 'lazy' }) : h('span', { className: 'noimg' }),
      h('span', { className: 'name' }, h('b', { textContent: d.title }), h('small', { textContent: [d.by, d.year].filter(Boolean).join(' · ') })))), say('Books from Open Library')]
      : [say('No books found for this one.')]));
  } catch { card._books = false; box.replaceChildren(say("Couldn't reach Open Library. Check your connection.")); }
}

// More pictures: the article's own, in reading order. A card that had none gets its first here; a card with several turns them over.
async function loadPics(card) {
  const p = card._page, lead = p.thumbnail && p.thumbnail.width >= 400 ? p.thumbnail.source : '';
  try {
    const r = await fetch(RH.mediaUrl(p.title));
    if (!r.ok) return;
    const list = RH.media(await r.json()), first = list.find((x) => x.lead), file = decodeURIComponent(lead);
    card._pics = (lead ? [{ src: lead, caption: first ? first.caption : '' }, ...list.filter((x) => !x.lead && !file.includes(x.name))] : list).slice(0, 8);
  } catch { return; } // the card reads fine with what it has
  if (card._pics.length) showPic(card, 0);
}
function showPic(card, i) {
  const pics = card._pics, at = (i + pics.length) % pics.length, pic = pics[at];
  const img = h('img', { alt: pic.caption || card._page.title });
  img.onload = () => { // swapped in only once it has arrived, so the card never shows a hole
    let fig = $('.pic', card);
    const isNew = !fig;
    if (isNew) { fig = h('figure', { className: 'pic' }); $('.read', card).after(fig); card.classList.remove('nopic'); }
    const old = [...fig.children], same = old.find((o) => o.src === img.src && !o._gone); // the picture the card was built with
    for (const o of old) {
      if (o.tagName !== 'IMG') o.remove();
      else if (o !== same) { o._gone = true; setTimeout(() => o.remove(), 800); } // stays under the new one while that is pressed in
    }
    if (!same) { if (old.length) img.className = 'turn'; fig.append(img); }
    card._at = at;
    fig.append(...[pic.caption && h('figcaption', null, h('span', { textContent: pic.caption })),
      pics.length > 1 && h('button', { type: 'button', name: 'pic', className: 'more', textContent: `${at + 1} / ${pics.length}`, ariaLabel: 'Next picture', title: 'Next picture (right arrow)' })].filter(Boolean));
    if (isNew) drawNext(); // Up next shows it too
    if (card === active) turn(card);
  };
  img.onerror = () => { pics.splice(at, 1); if (pics.length) showPic(card, at); }; // a picture that will not load is dropped
  img.src = pic.src;
}
// The pictures of the idea on screen turn over by themselves, slowly.
function turn(card) {
  clearTimeout(picTimer);
  if (!still && card._pics && card._pics.length > 1) picTimer = setTimeout(() => showPic(card, card._at + 1), 7000);
}

// Puts up to `max` acceptable pages into the feed: after a card, or at the end. Returns the new cards.
function add(pages, because, after, max, evenIfSeen) {
  const out = [];
  for (const p of pages) {
    if (out.length >= max) break;
    if (!RH.accept(state, p, evenIfSeen) || (!evenIfSeen && shown.has(p.title))) continue;
    shown.add(p.title);
    // How many ideas down this chain you are: following an interest or a "Go deeper" is one step further.
    depth[p.title] = because.seed ? (depth[because.seed] || 1) + 1 : 1;
    because = { ...because, depth: depth[p.title] };
    const topic = because.topic || state.of[because.seed]; // an idea inherits the topic of the idea that led to it
    if (topic) state.of[p.title] = topic;
    const el = makeCard(p, because);
    loadPics(el); loadCut(el);
    if (after) { after.after(el); after = el; } else tail.before(el);
    out.push(el);
  }
  if (out.length) drawNext();
  return out;
}

const ahead = () => feed.children.length - 2 - [...feed.children].indexOf(active || feed.children[1]); // minus the hidden h1's slot and the tail

async function refill() {
  if (busy || !state.started) return;
  busy = true; retry.hidden = true; note.textContent = 'Finding the next idea';
  let placed = false;
  try {
    for (let i = 0; i < 6 && ahead() < 4; i++) {
      const p = RH.plan(state, Math.random);
      const off = p.kind === 'like' ? offsets[p.seed] || 0 : p.offset || 0;
      const got = await get(p.titles ? { titles: p.titles } : { search: 'morelike:' + p.seed, limit: 20, offset: off });
      const fresh = add(got, p, null, p.kind === 'like' ? 2 : 3);
      if (p.kind === 'like' && fresh.length < 2) offsets[p.seed] = off + 20;
      // Scroll snapping keeps the loading card on screen when cards arrive above it, so hand over by hand, once.
      if (fresh.length && !placed && (!active || active === tail)) { placed = true; fresh[0].scrollIntoView({ behavior: 'instant' }); }
    }
  } catch {
    note.textContent = "Couldn't reach Wikipedia. Check your connection.";
    retry.hidden = false;
  }
  busy = false;
}

async function loadDeeper(card) {
  if (card._more) return;
  card._more = [];
  try {
    card._more = (await get({ search: 'morelike:' + card._page.title, limit: 12 })).filter((p) => RH.accept(state, p) && !shown.has(p.title));
  } catch { return; } // the card reads fine without it
  const picks = card._more.slice(0, 5);
  if (!picks.length) return;
  $('ul', card).append(...picks.map((p) => {
    const b = h('button', { type: 'button', name: 'hole' }, h('span', { textContent: p.title }), p.description && h('small', { textContent: cap(p.description) }));
    b._page = p;
    return h('li', null, b);
  }));
  $('.deeper', card).hidden = false;
}

function activate(card) {
  if (card === active) return;
  if (active && active._page) {
    const d = RH.dwell(Date.now() - since);
    if (d) RH.signal(state, sig(active), d);
    RH.decay(state);
  }
  const dir = active && !(active.compareDocumentPosition(card) & 4) ? -1 : 1; // back up the feed climbs out a ring
  if (active) active.classList.remove('on');
  clearTimeout(readTimer);
  active = card; since = Date.now();
  card.classList.add('on');
  hole.fall(dir);
  turn(card);
  if (listening) speak(card);
  if (card._page) {
    sfx(dir > 0 ? 'down' : 'up');
    if (!card._read) readTimer = setTimeout(() => markRead(card), 8000);
    const d = depth[card._page.title];
    if (DEEP[d] && d > deepest) { deepest = d; toast(DEEP[d]); }
    RH.see(state, card._page.title, card._because.seed);
    if (trail[trail.length - 1] !== card) trail.push(card);
    drawTrail();
    loadDeeper(card);
  }
  applyLook();
  drawNext(); drawStats();
  save();
  refill();
}
const watch = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) activate(e.target); }, { root: feed, threshold: 0.6 });
watch.observe(tail);

function drawTrail() {
  $('#trail').replaceChildren(...trail.slice(-8).map((c) => {
    const b = h('button', { type: 'button' }, h('span', { textContent: c._page.title }));
    b.onclick = () => { location.hash = '#feed'; c.scrollIntoView(); };
    return h('li', null, b);
  }));
  $('.trail').hidden = false;
}

function step(d) {
  const to = active ? (d > 0 ? active.nextElementSibling : active.previousElementSibling) : null;
  if (to && to.matches('.card')) to.scrollIntoView();
}

feed.addEventListener('click', (e) => {
  const b = e.target.closest('button[name]'), card = b && b.closest('.card');
  if (!card || !card._page) return;
  const on = b.ariaPressed !== 'true';
  if (b.name === 'like') {
    b.ariaPressed = String(on); relabel(b, on ? 'Showing more like this' : 'Show more like this');
    RH.signal(state, sig(card), on ? RH.W.like : -RH.W.like);
    if (on) { add(card._more || [], { kind: 'like', seed: card._page.title }, card, 2); const r = b.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); hole.pulse(); sfx('like'); }
  } else if (b.name === 'save') {
    b.ariaPressed = String(on); relabel(b, on ? 'Saved for later' : 'Save for later');
    const p = card._page;
    state.saved = state.saved.filter((x) => x.title !== p.title);
    if (on) state.saved.unshift({ title: p.title, description: p.description || '', thumb: p.thumbnail ? p.thumbnail.source : '' });
    RH.signal(state, sig(card), on ? RH.W.save : -RH.W.save);
  } else if (b.name === 'less') {
    RH.less(state, sig(card));
    const seeds = [card._page.title, card._because.seed];
    // Drop what was already queued from the same source, so the next card is not more of it.
    for (let n = card.nextElementSibling; n && n !== tail;) { const next = n.nextElementSibling; if (seeds.includes(n._because.seed)) n.remove(); n = next; }
    relabel(b, 'Showing less like this'); b.disabled = true;
    step(1);
  } else if (b.name === 'hole') {
    const [el] = add([b._page], { kind: 'deeper', seed: card._page.title }, card, 1);
    if (el) { RH.signal(state, sig(el), RH.W.deeper); el.scrollIntoView(); }
    b.closest('li').remove();
  } else if (b.name === 'pic') showPic(card, card._at + 1);
  else if (b.name === 'more') { card.classList.toggle('open', on); b.ariaPressed = String(on); relabel(b, on ? 'Hide full text' : 'Read full text'); fit(card); }
  else if (b.name === 'books') {
    const more = $('button[name=more]', card);
    if (on && card.classList.contains('open')) { card.classList.remove('open'); more.ariaPressed = 'false'; relabel(more, 'Read full text'); } // one or the other
    card.classList.toggle('books', on); $('.shelf', card).hidden = !on;
    b.ariaPressed = String(on); relabel(b, on ? 'Back to the text' : 'Book recommendations');
    if (on) loadBooks(card);
    fit(card);
  }
  applyLook();
  save();
});

// Double-click or double-tap anywhere on a card likes it, as on reels.
feed.addEventListener('dblclick', (e) => {
  const card = e.target.closest('.card');
  if (!card || !card._page || e.target.closest('button, a')) return;
  getSelection().removeAllRanges();
  const b = $('button[name=like]', card);
  if (b.ariaPressed !== 'true') b.click();
  burst(e.clientX, e.clientY);
});

$('#next').onclick = () => step(1);
$('#prev').onclick = () => step(-1);
retry.onclick = refill;
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
  if (document.body.dataset.view !== 'feed') return;
  const key = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key];
  if (key) { e.preventDefault(); step(key); }
  const name = { l: 'like', s: 'save', x: 'less' }[e.key];
  if (name && active && active._page) $(`button[name=${name}]`, active).click();
  const pic = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (pic && active && active._pics && active._pics.length > 1) showPic(active, active._at + pic);
  if (e.key === 'p' && canSpeak && !$('.start')) listen(!listening);
  if (e.key === 'm') { state.mute = !state.mute; save(); toast(state.mute ? 'Sound off' : 'Sound on'); }
});

// ---- search: the strongest thing you can tell the feed ----
$('#search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim(), msg = $('#search-note');
  if (!q) return;
  msg.textContent = 'Searching';
  let got;
  try { got = (await get({ search: q, limit: 8 })).filter((p) => RH.accept(state, p, true)); }
  catch { msg.textContent = "Couldn't reach Wikipedia. Check your connection."; return; }
  if (!got.length) { msg.textContent = `Nothing on Wikipedia for “${q}”.`; return; }
  msg.textContent = '';
  begin();
  const cards = add(got, { kind: 'search', query: q }, active && active._page ? active : null, 1, true); // only the best match: "Jung" also finds Jung Kook
  RH.bump(state, got[0].title, RH.W.search);
  save();
  $('#q').value = ''; $('#q').blur();
  location.hash = '#feed';
  cards[0].scrollIntoView();
});

// ---- first run ----
function topicChips(onchange) {
  const box = h('div', { className: 'topics' });
  for (const t of Object.keys(RH.TOPICS)) {
    const b = btn('topic', t, 'btn', state.topics.includes(t));
    b.onclick = () => {
      state.topics = state.topics.includes(t) ? state.topics.filter((x) => x !== t) : [...state.topics, t];
      b.ariaPressed = String(state.topics.includes(t));
      save(); onchange();
    };
    box.append(b);
  }
  return box;
}
function begin() {
  const start = $('.start');
  if (start) start.remove();
  state.started = true; tail.hidden = false;
  save();
}
function firstRun() {
  const go = h('button', { type: 'button', className: 'btn primary' });
  const sync = () => { go.disabled = !state.topics.length; go.textContent = state.topics.length ? 'Start reading' : 'Pick at least one'; };
  go.onclick = () => { begin(); refill(); };
  sync();
  tail.before(h('article', { className: 'card start' }, h('div', { className: 'sheet' }, h('div', { className: 'text' },
    h('h2', { textContent: 'What are you curious about?' }),
    h('p', { className: 'extract', textContent: 'Pick a few to start. From there the feed follows what you read, like and search for.' }),
    topicChips(sync), go))));
}

// ---- Saved and Your interests ----
function row(...kids) { return h('li', null, ...kids); }
function drawSaved() {
  const n = state.saved.length;
  $('#saved').replaceChildren(h('div', { className: 'col' },
    h('h1', { textContent: 'Saved' }),
    h('p', { className: 'sub', textContent: n ? `${n} ${n === 1 ? 'idea' : 'ideas'} kept, newest first.` : 'Ideas you keep from the feed.' }),
    n ? h('ul', { className: 'rows' }, ...state.saved.map((x) => {
      const rm = btn('remove', 'Remove', 'btn quiet');
      rm.onclick = () => { state.saved = state.saved.filter((y) => y.title !== x.title); save(); drawSaved(); };
      return row(x.thumb ? h('img', { src: x.thumb, alt: '', loading: 'lazy' }) : h('span', { className: 'noimg' }),
        h('span', { className: 'name' }, h('a', { href: RH.link(x.title), target: '_blank', rel: 'noopener', textContent: x.title }), x.description && h('small', { textContent: cap(x.description) })), rm);
    })) : h('p', { className: 'empty', textContent: 'Nothing saved yet. Press Save on an idea and it stays here.' })));
}
function drawInterests() {
  const list = RH.interests(state, 12), max = list.length ? list[0][1] : 1;
  const reset = btn('reset', 'Start over', 'btn');
  reset.onclick = () => { if (confirm('Forget everything Rabbit Hole has learned about you, including your saved ideas?')) { try { localStorage.removeItem(KEY); } catch { /* nothing stored */ } location.href = location.pathname; } };
  const look = h('div', { className: 'topics' }, ...['dark', 'light'].map((name) => {
    const b = btn('theme', cap(name), 'btn', (state.theme === 'light' ? 'light' : 'dark') === name);
    b.onclick = () => { state.theme = name; applyLook(); save(); drawInterests(); };
    return b;
  }));
  const sound = h('div', { className: 'topics' }, ...['on', 'off'].map((name) => {
    const b = btn('sound', cap(name), 'btn', !!state.mute === (name === 'off'));
    b.onclick = () => { state.mute = name === 'off'; save(); drawInterests(); sfx('like'); };
    return b;
  }));
  // The voice for Listen: every English voice this device has, best first, with a sample to judge by ear.
  const pick = h('select', { className: 'btn', ariaLabel: 'Voice for Listen' }, ...(canSpeak ? voices() : []).map((v, i) => h('option', { value: v.name, textContent: v.name.replace(/Microsoft |Online |\(Natural\) - /g, '').trim(), selected: state.voice ? v.name === state.voice : !i })));
  pick.onchange = () => { state.voice = pick.value; save(); speechSynthesis.cancel(); say('This is how I will read to you. Calm, and not in a hurry.'); };
  const sample = btn('sample', 'Play a sample', 'btn');
  sample.onclick = () => { speechSynthesis.cancel(); say('This is how I will read to you. Calm, and not in a hurry.'); };
  const leaning = RH.lead(state);
  $('#interests').replaceChildren(h('div', { className: 'col' },
    h('h1', { textContent: 'Your interests' }),
    h('p', { className: 'sub', textContent: list.length ? `The feed is following ${list[0][0]} most. Three ideas in four come from this list.` : 'What the feed has learned about you.' }),
    h('div', { className: 'panels' },
      h('div', { className: 'panel' }, h('h2', { textContent: 'Following, strongest first' }),
        list.length ? h('ul', { className: 'rows' }, ...list.map(([title, w]) => {
          const rm = btn('forget', 'Forget', 'btn quiet');
          rm.onclick = () => { delete state.w[title]; save(); drawInterests(); };
          const fill = h('i'); fill.style.width = Math.round(100 * w / max) + '%';
          return row(h('span', { className: 'name' }, h('b', { textContent: title })), h('span', { className: 'bar' }, fill), rm);
        })) : h('p', { className: 'empty', textContent: 'Nothing yet. It fills in as you like, save, search and spend time on ideas.' })),
      h('div', null,
        h('div', { className: 'panel' }, h('h2', { textContent: 'Topics the rest comes from' }), topicChips(() => {})),
        h('div', { className: 'panel danger' }, h('h2', { textContent: leaning ? `Look, tinted for ${leaning}` : 'Look' }), look),
        h('div', { className: 'panel danger' }, h('h2', { textContent: 'Sound' }), sound),
        canSpeak && pick.options.length && h('div', { className: 'panel danger' }, h('h2', { textContent: 'Voice for Listen' }), h('div', { className: 'topics' }, pick, sample)),
        h('div', { className: 'panel danger' }, h('p', { textContent: 'Wipes your interests, your saved ideas and what you have already seen.' }), reset))),
    h('p', { className: 'credit' }, 'Words and pictures from Wikipedia, CC BY-SA.'),
    h('p', { className: 'credit', textContent: 'hello there' })));
}

// ---- Map: the burrow you have dug, every idea under the one that led to it ----
function drawMap() {
  let count = 0, deep = 0, end = '', best = [];
  const chain = [];
  const branch = (n) => {
    const b = h('button', { type: 'button', textContent: n.title }), li = h('li', null, b);
    li.style.setProperty('--i', count++);
    b.onclick = () => revisit(n.title);
    chain.push(li);
    if (chain.length > deep) { deep = chain.length; end = n.title; best = chain.slice(); }
    if (n.kids.length) li.append(h('ul', null, ...n.kids.map(branch)));
    chain.pop();
    return li;
  };
  const holes = RH.tree(state).map((r) => h('section', null, h('h2', { textContent: r.title }), h('ul', null, ...r.kids.map(branch))));
  if (deep > 1) for (const li of best) li.classList.add('deep');
  $('#map').replaceChildren(h('div', { className: 'col' },
    h('h1', { textContent: 'Your burrow' }),
    h('p', { className: 'sub', textContent: count ? `${count} ${count === 1 ? 'idea' : 'ideas'} dug so far. ${deep > 1 ? `The deepest tunnel runs ${deep} down and ends at ${end}. ` : ''}Pick any idea to go back to it.` : 'Every idea you stop on is dug in here, under the idea that led you to it.' }),
    count ? h('div', { className: 'burrow' }, ...holes) : h('p', { className: 'empty', textContent: 'Nothing dug yet. Read a few ideas in the feed and the tunnels appear.' })));
}
async function revisit(title) {
  let card = [...feed.children].find((c) => c._page && c._page.title === title); // still in the feed from this sitting
  if (!card) {
    try { [card] = add(await get({ titles: [title] }), { kind: 'back' }, active && active._page ? active : null, 1, true); }
    catch { toast("Couldn't reach Wikipedia. Check your connection."); return; }
  }
  if (!card) { toast('Wikipedia no longer has that one.'); return; }
  location.hash = '#feed'; route();
  card.scrollIntoView({ behavior: 'instant' }); // gliding there would count every card on the way as flicked past
}

function route() {
  const view = ['map', 'saved', 'interests'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'feed';
  if (view !== 'feed' && listening) listen(false);
  document.body.dataset.view = view;
  for (const v of document.querySelectorAll('.view')) v.inert = v.id !== view;
  for (const a of document.querySelectorAll('nav a')) a.ariaCurrent = a.hash === '#' + view ? 'page' : null;
  since = view === 'feed' ? Date.now() : 0; // time on another screen is not reading time
  if (view === 'map') drawMap();
  if (view === 'saved') drawSaved();
  if (view === 'interests') drawInterests();
}
addEventListener('hashchange', route);
route();

if (state.started) { tail.hidden = false; refill(); } else firstRun();
drawStats();

// ---- updates: an iPhone home-screen app has no refresh button and keeps showing its saved copy of the page ----
// So the hosted app looks for itself: it fetches the page fresh (which also replaces the saved copy), and if that
// page links to a newer app.js?v=N than the one running, it reloads once. Nothing stored on the device is touched.
const RUNNING = +(/[?&]v=(\d+)/.exec(document.currentScript ? document.currentScript.src : '') || [])[1] || 0;
async function update() {
  if (!RUNNING || !/^https?:/.test(location.protocol)) return; // the one-file phone build and the desktop files are always current
  try {
    const page = await (await fetch(location.pathname, { cache: 'reload' })).text();
    const latest = +(/app\.js\?v=(\d+)/.exec(page) || [])[1] || 0;
    if (latest > RUNNING && sessionStorage.getItem('rabbit-hole.tried') !== String(latest)) {
      sessionStorage.setItem('rabbit-hole.tried', latest); // one try per version, so a stubborn cache cannot loop
      save(); location.reload();
    }
  } catch { /* offline: carry on with what is here */ }
}
update();
document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); }); // coming back to the app checks again
