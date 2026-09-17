// Bundles everything into one self-contained HTML file (dist/pingpang.html) that can be opened directly.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/bundle.js', logLevel: 'error' });
const js = readFileSync('dist/bundle.js', 'utf8').replace(/<\/script>/g, '<\\/script>');
const html = readFileSync('index.html', 'utf8').replace('<script type="module" src="dist/bundle.js"></script>', `<script>\n${js}\n</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/pingpang.html', html);
console.log('wrote dist/pingpang.html', (html.length / 1024).toFixed(0), 'KB');
