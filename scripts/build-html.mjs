// Builds dist/smash.html: one self-contained file (JS inlined) that runs
// straight from disk via file://, no server needed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'vite';

const result = await build({
  logLevel: 'warn',
  build: {
    write: false,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife' } },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
const entry = outputs.find((o) => o.type === 'chunk' && o.isEntry);
const page = outputs.find((o) => o.type === 'asset' && o.fileName === 'index.html');
if (!entry || !page) throw new Error('build output missing entry chunk or index.html');

const code = entry.code.replace(/<\/script/gi, '<\\/script');
const html = String(page.source)
  .replace(/<script[^>]*\bsrc="[^"]*"[^>]*><\/script>\s*/g, '')
  .replace('</body>', () => `<script>\n${code}</script>\n</body>`);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/smash.html', html);
console.log(`wrote dist/smash.html (${(html.length / 1024).toFixed(1)} kB)`);
