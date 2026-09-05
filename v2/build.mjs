import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const order=['util','textures','assets','style','foliage','planet','system','defs','models','effects','audio','sim','ai','camera','ui','portraits','tactical','main'];
const named=new Map(),bare=new Set();let body='';
for(const name of order){
  let src=fs.readFileSync(path.join(root,'src',name+'.js'),'utf8');
  src=src.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\/(\w+)\.js['"];?[ \t]*$/gm,(_,names,mod)=>`const {${names}} = __mod_${mod};`);
  src=src.replace(/^(import\s+[^;]+?from\s+['"][^.'"][^'"]*['"];?)[ \t]*$/gm,(_,stmt)=>{
    const m=stmt.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if(m){if(!named.has(m[2]))named.set(m[2],new Set());for(const n of m[1].split(','))named.get(m[2]).add(n.trim());}else bare.add(stmt);return '';
  });
  if(/^import\s/m.test(src))throw Error('Unhandled import in '+name);
  const exports=[];
  src=src.replace(/^export\s+((?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*))/gm,(_,decl,id)=>{exports.push(id);return decl;});
  if(/^export\s/m.test(src))throw Error('Unhandled export in '+name);
  body+=`\nconst __mod_${name} = (() => {\n${src}\nreturn {${exports.join(',')}};\n})();\n`;
}
const imports=[...bare,...[...named].map(([spec,names])=>`import {${[...names].join(',')}} from '${spec}';`)];
const script=imports.join('\n')+'\n'+body;
const probe=path.join(root,'tests','.bundle-check.mjs');
try{fs.writeFileSync(probe,script);execFileSync(process.execPath,['--check',probe],{stdio:'pipe'});}finally{if(fs.existsSync(probe))fs.unlinkSync(probe);}
let html=fs.readFileSync(path.join(root,'dev.html'),'utf8').replace('<link rel="stylesheet" href="theme.css">',()=>'<style>\n'+fs.readFileSync(path.join(root,'theme.css'),'utf8')+'\n</style>');
html=html.replace('<script type="module" src="src/main.js"></script>',()=>`<script type="module">\n${script}\n</script>`);
fs.writeFileSync(path.join(root,'index.html'),html);
console.log(`v2/index.html: ${(Buffer.byteLength(html)/1024).toFixed(0)} KiB. Bundle syntax PASS. Original root untouched.`);
