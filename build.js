// Bundler: wraps each src module in a scoped IIFE (so module-private names never
// collide) and inlines everything into one <script type="module"> in dist/index.html.
// External imports (three.js CDN) are hoisted to the top of the script.
const fs = require('fs');
const path = require('path');
const ORDER = ['util', 'textures', 'assets', 'style', 'foliage', 'planet', 'system', 'defs', 'models', 'effects', 'audio', 'sim', 'ai', 'camera', 'ui', 'main'];
const imports = new Set();
let body = '';
for (const name of ORDER) {
  const file = path.join(__dirname, 'src', name + '.js');
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, 'utf8');
  // relative imports -> destructure from the module object
  src = src.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\/(\w+)\.js['"];?[ \t]*$/gm, (m, names, mod) => `const {${names}} = __mod_${mod};`);
  // external imports -> hoist
  src = src.replace(/^(import\s+[^;]+?from\s+['"][^.'"][^'"]*['"];?)[ \t]*$/gm, (m, s) => { imports.add(s); return ''; });
  if (/^import\s/m.test(src)) throw new Error('unhandled import in ' + name);
  const exported = [];
  src = src.replace(/^export\s+((?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*))/gm, (m, decl, id) => { exported.push(id); return decl; });
  if (/^export\s/m.test(src)) throw new Error('unhandled export in ' + name);
  body += `\n// ===== ${name}.js =====\nconst __mod_${name} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}
// embed the reduced texture sets so standalone / artifact builds get real materials too
let texData = null;
const embedDir = path.join(__dirname, 'assets', 'tex-embed');
if (fs.existsSync(embedDir)) {
  texData = {};
  for (const kind of fs.readdirSync(embedDir)) {
    const kd = path.join(embedDir, kind); if (!fs.statSync(kd).isDirectory()) continue; texData[kind] = {};
    for (const f of fs.readdirSync(kd)) if (f.endsWith('.jpg')) texData[kind][f.replace('.jpg', '')] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(kd, f)).toString('base64');
  }
}
let html = fs.readFileSync(path.join(__dirname, 'dev.html'), 'utf8');
if (texData) html = html.replace('<script type="importmap">', `<script>window.__TEXDATA = ${JSON.stringify(texData)};</script>\n<script type="importmap">`);
html = html.replace(/<script type="module" src="src\/main\.js"><\/script>/, () => `<script type="module">\n${[...imports].join('\n')}\n${body}\n</script>`);
html = html.replace(/<!doctype html>\s*/i, '').replace(/<\/?html[^>]*>\s*/gi, '').replace(/<\/?head>\s*/gi, '').replace(/<\/?body[^>]*>\s*/gi, '').replace(/<meta name="viewport"[^>]*>\s*/gi, '');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
// standalone full document for local double-click play
const standalone = '<!doctype html>\n<html lang="en">\n<head>\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' + html + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'dist', 'titan-annihilation.html'), standalone);
// GitHub Pages serves the root: ship the single-file bundle there so a deploy can never mix cached old modules with a new page
fs.writeFileSync(path.join(__dirname, 'index.html'), standalone);
const vm = fs.readFileSync(path.join(__dirname, 'src', 'util.js'), 'utf8').match(/VERSION = '([^']+)'/);
if (vm) {
  fs.mkdirSync(path.join(__dirname, 'versions'), { recursive: true });
  const vp = path.join(__dirname, 'versions', `titan-annihilation-v${vm[1]}.html`);
  // versions/ is the release archive the changelog points at, so a routine build must not rewrite an
  // already-shipped file with whatever happens to be in the tree. Pass --release to cut a new one.
  if (fs.existsSync(vp) && !process.argv.includes('--release')) console.log('versions/titan-annihilation-v' + vm[1] + '.html exists, not overwritten (use --release)');
  else { fs.writeFileSync(vp, standalone); console.log('versions/titan-annihilation-v' + vm[1] + '.html'); }
}
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB;', 'dist/titan-annihilation.html', (standalone.length / 1024).toFixed(0) + ' KB');
