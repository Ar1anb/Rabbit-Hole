// node engine.test.cjs          checks the taste engine
// node engine.test.cjs --live   also asks Wikipedia for what follows Karl Marx
const assert = require('assert');
const RH = require('./engine.js');

// A seeded random so the run is the same every time.
let x = 42; const rnd = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;

const s = RH.fresh();
s.topics = ['History'];
assert.strictEqual(RH.plan(s, rnd).kind, 'explore', 'with no interests yet, the feed explores your topics');

// Someone likes Marx, likes a card Marx led to, and flicks past a Jung card.
RH.signal(s, { title: 'Karl Marx' }, RH.W.like);
RH.signal(s, { title: 'Das Kapital', seed: 'Karl Marx' }, RH.W.like);
RH.signal(s, { title: 'Anima and animus', seed: 'Carl Jung' }, RH.dwell(900));
assert.strictEqual(s.w['Karl Marx'], 4.5, 'liking what Marx led to is half a vote for Marx');
assert.ok(s.w['Carl Jung'] < 0, 'a flick past counts against where it came from');
assert.strictEqual(RH.interests(s, 5)[0][0], 'Karl Marx');

// The look follows the topic with a clear lead, and not before there is one.
assert.strictEqual(RH.lead(s), null);
RH.signal(s, { title: 'Stoicism', topic: 'Philosophy' }, RH.W.like);
RH.signal(s, { title: 'Silk Road', topic: 'History' }, RH.dwell(20000));
assert.strictEqual(RH.lead(s), 'Philosophy');
delete s.w.Stoicism; delete s.w['Silk Road'];

const picks = { like: 0, explore: 0, marx: 0, jung: 0 };
for (let i = 0; i < 2000; i++) {
  const p = RH.plan(s, rnd); picks[p.kind]++;
  if (p.seed === 'Karl Marx') picks.marx++;
  if (p.seed === 'Carl Jung') picks.jung++;
}
assert.ok(picks.explore > 400 && picks.explore < 600, 'about one fetch in four explores: ' + picks.explore);
assert.ok(picks.marx > picks.like / 2, 'the strongest interest is fetched most');
assert.strictEqual(picks.jung, 0, 'a negative interest is never fetched');

RH.less(s, { title: 'Das Kapital', seed: 'Karl Marx' });
const page = { title: 'Das Kapital', extract: 'x'.repeat(300) };
assert.ok(!RH.accept(s, page) && !RH.accept(s, page, true), '"less like this" keeps a page out, even from search');
assert.ok(!RH.accept(s, { title: 'List of Marxists', extract: 'x'.repeat(300) }), 'lists are not ideas');
assert.ok(!RH.accept(s, { title: 'Marxism', extract: 'short' }), 'stubs are skipped');
s.seen.Marxism = 1;
assert.ok(!RH.accept(s, { title: 'Marxism', extract: 'x'.repeat(300) }) && RH.accept(s, { title: 'Marxism', extract: 'x'.repeat(300) }, true), 'seen pages only come back through search');

for (let i = 0; i < 200; i++) RH.decay(s);
assert.deepStrictEqual(RH.interests(s, 5), [], 'interests fade when nothing renews them');

assert.strictEqual(RH.dwell(30000), 1); assert.strictEqual(RH.dwell(4000), 0); assert.strictEqual(RH.dwell(600000), 0);
assert.strictEqual(RH.trim('Karl Marx ( ; 5 May 1818 – 14 March 1883) was a philosopher. He wrote a lot of books about it.', 70), 'Karl Marx (5 May 1818 – 14 March 1883) was a philosopher.');
const r = RH.fresh();
assert.deepStrictEqual(RH.stats(r, '2026-03-01'), { today: 0, streak: 0 });
assert.strictEqual(RH.read(r, '2026-02-28'), 1); assert.strictEqual(RH.read(r, '2026-02-28'), 2);
assert.deepStrictEqual(RH.stats(r, '2026-03-01'), { today: 0, streak: 1 }, 'yesterday keeps the streak alive across a month end');
RH.read(r, '2026-03-01');
assert.deepStrictEqual(RH.stats(r, '2026-03-01'), { today: 1, streak: 2 });
assert.deepStrictEqual(RH.stats(r, '2026-03-03'), { today: 0, streak: 0 }, 'a missed day ends the streak');
RH.read(r, '2026-03-03'); assert.strictEqual(r.streak, 1);

// The map: an idea hangs under the idea that led to it, a blocked idea drops out, and a topic's own article cannot loop.
const m = RH.fresh();
m.of = { Stoicism: 'Philosophy', Seneca: 'Philosophy', Philosophy: 'Philosophy', Nero: 'Philosophy' };
RH.see(m, 'Stoicism', 'Zeno');      // Zeno was never read, so Stoicism hangs under its topic
RH.see(m, 'Seneca', 'Stoicism');
RH.see(m, 'Nero', 'Seneca');
RH.see(m, 'Philosophy', 'Seneca');
RH.see(m, 'Stoicism', 'Nero');      // seeing it again does not move it
RH.see(m, '1984', undefined);       // number-like titles sort first in an object; no topic either
assert.deepStrictEqual(RH.tree(m), [
  { title: 'Elsewhere', kids: [{ title: '1984', kids: [] }] },
  { title: 'Philosophy', kids: [{ title: 'Stoicism', kids: [{ title: 'Seneca', kids: [{ title: 'Nero', kids: [] }, { title: 'Philosophy', kids: [] }] }] }] },
]);
m.blocked.Seneca = 1;
assert.deepStrictEqual(RH.tree(m)[1].kids.map((k) => k.title), ['Stoicism', 'Nero', 'Philosophy'], 'what a blocked idea led to moves up to the topic');

// Pictures: big photographs in reading order; icons, small ones and non-pictures are left out.
const pics = RH.media({ items: [
  { title: 'File:Icon.svg', type: 'image', showInGallery: true, srcset: [{ src: '//x.org/thumb/a/500px-Icon.svg.png', scale: '1x' }] },
  { title: 'File:Small.jpg', type: 'image', showInGallery: true, srcset: [{ src: '//x.org/thumb/a/120px-Small.jpg', scale: '1x' }, { src: '//x.org/thumb/a/250px-Small.jpg', scale: '2x' }] },
  { title: 'File:Talk.ogg', type: 'audio', showInGallery: true },
  { title: 'File:Marx_1875.jpg', type: 'image', leadImage: true, showInGallery: true, caption: { text: ' Marx in 1875[26] ' }, srcset: [{ src: '//x.org/thumb/a/500px-Marx_1875.jpg', scale: '1x' }, { src: '//x.org/thumb/a/1280px-Marx_1875.jpg', scale: '2x' }] },
] });
assert.deepStrictEqual(pics, [{ src: 'https://x.org/thumb/a/1280px-Marx_1875.jpg', name: 'Marx_1875.jpg', caption: 'Marx in 1875', lead: true }]);
assert.deepStrictEqual(RH.media({}), []);

// The recut: never the opening definition, at most two lines from the opening, a deeper line must name the subject, nothing after "See also".
const art = ['Zeno of Elea was a Greek philosopher of the fifth century before the common era and a member of the Eleatic school.',
  'He is best known for his paradoxes, which Aristotle called the first examples of a method known as dialectic.',
  'Plato wrote that Zeno was famous in Athens and that the young Socrates once heard him read from his only book.',
  'Almost nothing he wrote survived, and his arguments are known only through the reports of his critics and rivals.',
  '== Life ==', 'He was arrested after the plot failed and it is said that he was tortured and killed by the tyrant of the city.',
  'Ancient writers claimed that Zeno was tortured and killed after a failed plot against the tyrant of Elea in about 430.',
  '== See also ==', 'Zeno is famous and was the first and only and greatest philosopher to be executed in the year 430 of them all.'].join('\n');
const cut = RH.recut(art, 'Zeno of Elea');
assert.strictEqual(cut.length, 3);
assert.ok(!cut.some((b) => /was a Greek philosopher|He was arrested|greatest philosopher/.test(b.text)), 'no definition, no line that leans on the one before, nothing from See also');
assert.deepStrictEqual(cut.map((b) => b.label), ['', '', 'Life']);
assert.strictEqual(RH.recut('Short stub. Nothing more to say here.', 'Stub'), null, 'too little to choose from keeps the opening');

// Books: one of each title, covers first, and nothing at all when the search is mostly noise.
const shelf = RH.books({ numFound: 900, docs: [
  { title: 'The Prince', key: '/works/1', author_name: ['Niccolò Machiavelli'], first_publish_year: 1515 },
  { title: 'Prince', key: '/works/2', cover_i: 7 },
  { title: 'Art of War', key: '/works/3', cover_i: 9, author_name: ['A', 'B', 'C'] }] });
assert.deepStrictEqual(shelf.map((b) => b.title), ['Art of War', 'The Prince']);
assert.deepStrictEqual(shelf[0], { title: 'Art of War', by: 'A, B', year: '', cover: 'https://covers.openlibrary.org/b/id/9-M.jpg', url: 'https://openlibrary.org/works/3' });
assert.deepStrictEqual(RH.books({ numFound: 15, docs: [{ title: 'Noise', key: '/works/4' }] }), []);
const paintings = RH.art({ query: { pages: {
  2: { index: 2, title: 'File:The Death of Socrates MET LC.jpg', imageinfo: [{ width: 4000, thumburl: 'https://u/b.jpg', extmetadata: { ObjectName: { value: 'The Death of Socrates' } } }] },
  1: { index: 1, title: 'File:The Death of Socrates MET DP.jpg', imageinfo: [{ width: 4000, thumburl: 'https://u/a.jpg', extmetadata: { ObjectName: { value: 'English: The Death of Socrates title QS:P1476,en:"The Death of Socrates"' }, Artist: { value: '<a href="x">Jacques-Louis David</a>' }, DateTimeOriginal: { value: '1787date QS:P571,+1787' } } }] },
  3: { index: 3, title: 'File:Small.jpg', imageinfo: [{ width: 400, thumburl: 'https://u/c.jpg' }] },
  4: { index: 4, title: 'File:Fresco in a church.jpg', imageinfo: [{ width: 3000, thumburl: 'https://u/d.jpg', extmetadata: { Artist: { value: 'A Photographer' }, DateTimeOriginal: { value: '2016-06-21 13:42:19' } } }] },
} } });
assert.deepStrictEqual(paintings, [
  { src: 'https://u/a.jpg', name: 'The Death of Socrates MET DP.jpg', caption: 'The Death of Socrates, Jacques-Louis David, 1787' },
  { src: 'https://u/d.jpg', name: 'Fresco in a church.jpg', caption: 'Fresco in a church' },
]);
assert.deepStrictEqual(RH.art({}), []);
assert.ok(RH.artUrl('Q913').includes('P180%3DQ913'));
const para = (w) => (w + ' is a sentence long enough to count as a real paragraph of the article, not a label. ').repeat(2).trim();
const long = RH.longread([para('Opening'), 'Short label', '== Life ==', para('Life'), '=== Early years ===', para('Early'), '== See also ==', para('Links'), '== Thought ==', para('Thought')].join('\n\n'));
assert.deepStrictEqual(long.map((s) => [s.label, s.paras.length]), [['', 1], ['Life', 2], ['Thought', 1]]);
assert.strictEqual(RH.longread(para('One') + '\n\n== Two ==\n\n' + para('Two'), 50).length, 1, 'stops once it has enough');
assert.deepStrictEqual(RH.longread(''), []);
console.log('engine ok', picks);

if (process.argv.includes('--live')) {
  fetch(RH.url({ search: 'morelike:Karl Marx', limit: 20 }), { headers: { 'user-agent': 'RabbitHoleSelfCheck/1.0' } })
    .then((r) => r.json()).then((j) => {
      const got = RH.pages(j).filter((p) => RH.accept(RH.fresh(), p)).map((p) => p.title);
      assert.ok(got.length >= 5, 'Wikipedia returned too little');
      console.log('after Karl Marx:', got.join(', '));
    });
}
