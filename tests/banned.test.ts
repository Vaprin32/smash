import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SIM_DIR = fileURLToPath(new URL('../src/sim', import.meta.url));

const BANNED: [string, RegExp][] = [
  ['Math.random', /\bMath\s*\.\s*random\b/],
  [
    'non-deterministic Math function',
    /\bMath\s*\.\s*(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|pow|exp|expm1|log|log2|log10|log1p|hypot|cbrt)\b/,
  ],
  ['Date', /\bDate\b/],
  ['performance', /\bperformance\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['window', /\bwindow\b/],
  ['document', /\bdocument\b/],
  ['navigator', /\bnavigator\b/],
  ['globalThis', /\bglobalThis\b/],
  ['localStorage', /\blocalStorage\b/],
  ['fetch', /\bfetch\s*\(/],
  ['console', /\bconsole\b/],
  ['crypto', /\bcrypto\b/],
  ['process', /\bprocess\b/],
  ['require', /\brequire\s*\(/],
  ['parseFloat', /\bparseFloat\b/],
];

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return listTs(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function findViolations(code: string): string[] {
  return BANNED.filter(([, re]) => re.test(code)).map(([name]) => name);
}

function importSpecifiers(code: string): string[] {
  const specs: string[] = [];
  for (const re of [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g, /^\s*import\s*['"]([^'"]+)['"]/gm]) {
    for (const m of code.matchAll(re)) specs.push(m[1]!);
  }
  return specs;
}

describe('src/sim determinism guard', () => {
  const files = listTs(SIM_DIR);

  it('finds sim source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('the scanner itself catches banned tokens', () => {
    expect(findViolations('const a = Math.random();')).toContain('Math.random');
    expect(findViolations('x = Math.sin(t)')).toContain('non-deterministic Math function');
    expect(findViolations('new Date()')).toContain('Date');
    expect(findViolations('performance.now()')).toContain('performance');
    expect(findViolations(stripComments('// Math.random is banned'))).toEqual([]);
  });

  for (const file of files) {
    const rel = relative(SIM_DIR, file);
    const code = stripComments(readFileSync(file, 'utf8'));

    it(`${rel} uses no banned tokens`, () => {
      expect(findViolations(code)).toEqual([]);
    });

    it(`${rel} imports only from inside src/sim`, () => {
      for (const spec of importSpecifiers(code)) {
        expect(spec.startsWith('.'), `bare import "${spec}"`).toBe(true);
        const target = relative(SIM_DIR, resolve(dirname(file), spec));
        expect(target.startsWith('..'), `import "${spec}" leaves src/sim`).toBe(false);
      }
    });
  }
});
