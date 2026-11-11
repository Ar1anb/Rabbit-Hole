// node build-phone.mjs   packs the app into one file for an HTML viewer on a phone. Run it again after any change.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const file = (name) => readFileSync(new URL(name, here), 'utf8');
const logo = 'data:image/svg+xml;base64,' + Buffer.from(file('logo.svg')).toString('base64');
const html = file('index.html')
  .replace(/\?v=\d+/g, '') // the hosted page numbers its files so phones fetch new ones; bump ?v= in index.html with every push
  .replace(/<link rel="apple-touch-icon"[^>]*>\r?\n/, '') // the home-screen icon only matters for the hosted app
  .replace('<link rel="stylesheet" href="app.css">', () => `<style>\n${file('app.css')}</style>`)
  .replace(/<script src="(.+?)"><\/script>/g, (_, name) => `<script>\n${file(name)}</script>`)
  .replaceAll('logo.svg', logo);
if (/(href|src)="(?!https?:|data:|#)/.test(html)) throw new Error('something still points at a local file');
writeFileSync(new URL('Rabbit Hole iPhone.html', here), html);
console.log('Rabbit Hole iPhone.html', Math.round(html.length / 1024) + ' KB');
