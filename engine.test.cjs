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
console.log('engine ok', picks);

if (process.argv.includes('--live')) {
  fetch(RH.url({ search: 'morelike:Karl Marx', limit: 20 }), { headers: { 'user-agent': 'RabbitHoleSelfCheck/1.0' } })
    .then((r) => r.json()).then((j) => {
      const got = RH.pages(j).filter((p) => RH.accept(RH.fresh(), p)).map((p) => p.title);
      assert.ok(got.length >= 5, 'Wikipedia returned too little');
      console.log('after Karl Marx:', got.join(', '));
    });
}
