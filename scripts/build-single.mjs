// Bundles everything into one self-contained HTML file (dist/pingpang.html) that can be opened directly.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/bundle.js', logLevel: 'error' });
const js = readFileSync('dist/bundle.js', 'utf8').replace(/<\/script>/g, '<\\/script>');
// Pass a replacer FUNCTION, never a replacement string: a string replacement expands $& / $` / $' / $1, and the
// minified bundle legitimately contains sequences like `$&&g(...)`. As a string this spliced the matched
// <script ...></script> tag into the middle of the bundle, closing the inline script early and breaking the page.
const tag = '<script type="module" src="dist/bundle.js"></script>';
const src = readFileSync('index.html', 'utf8');
if (!src.includes(tag)) throw new Error(`build-single: could not find the bundle script tag in index.html`);
const html = src.replace(tag, () => `<script>\n${js}\n</script>`);
if (html.split('</script>').length - 1 !== src.split('</script>').length - 1) {
  throw new Error('build-single: inlined bundle changed the number of </script> tags — the script would close early');
}
mkdirSync('dist', { recursive: true });
writeFileSync('dist/pingpang.html', html);
console.log('wrote dist/pingpang.html', (html.length / 1024).toFixed(0), 'KB');
