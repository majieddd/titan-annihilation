const $ = id => document.getElementById(id);
const base = new URLSearchParams(location.search).has('baseline') ? '../../' : '../';
$('game').src = base + 'dev.html';
let app, GameAI, THREE, util;
const log = msg => { $('results').textContent += msg + '\n'; $('results').scrollTop = $('results').scrollHeight; };
const ready = setInterval(async () => {
  app = $('game').contentWindow.__app;
  if (!app || app.state !== 'menu' || app.generating) return;
  clearInterval(ready);
  const imports = await Promise.all([import(new URL(base + 'src/ai.js', location)), import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'), import(new URL(base + 'src/util.js', location))]);
  GameAI = imports[0].AI; THREE = imports[1]; util = imports[2];
  $('status').textContent = 'Ready'; log('Baseline: ' + base + ' seed=' + app.settings.seed);
}, 400);
const yieldFrame = () => new Promise(r => setTimeout(r, 0));
async function start() { await app.startGame(); app.introT = 0; app.cam.dist = app.cam.targetDist = 110; app.advance(4); }
$('e2e').onclick = async () => {
  $('status').textContent = 'Full match running'; await start();
  const g = app.game; const player = new GameAI(g, 0, 'normal');
  const enemyUpdate = app.ai.update.bind(app.ai); app.ai.update = dt => { enemyUpdate(dt); player.update(dt); };
  const begin = performance.now();
  while (!g.over && g.time < 2400) { app.advance(5); if (Math.round(g.time) % 60 < 6) $('status').textContent = 'Simulated ' + Math.floor(g.time) + 's / ' + g.units.length + ' units'; await yieldFrame(); }
  app.advance(4); app.paused = true;
  log(JSON.stringify({check:'full-match',pass:g.over,winner:g.winner,seconds:g.time,units:g.units.length,wallMs:Math.round(performance.now()-begin),stats:g.teams.map(t=>t.stats)}));
  $('status').textContent = g.over ? 'Full match PASS' : 'Full match TIMEOUT';
};
$('combat').onclick = async () => {
  await start(); const g = app.game, c = g.teams[0].commander;
  for(let i=0;i<6;i++) { const d=util.moveOnSphere(c.dir,util.anyTangent(c.dir,new THREE.Vector3()),(16+i*3)/c.planet.R,new THREE.Vector3()); const u=g.createUnit('leveler',1,c.planet,d); g.orderAttack([u],c); }
  while(!g.over&&g.time<180) {app.advance(2);await yieldFrame();}
  app.advance(4); app.paused=true; log(JSON.stringify({check:'combat-end',pass:g.over&&g.winner===1,time:g.time,commanderHP:c.hp})); $('status').textContent='Combat end recorded';
};
$('suite').onclick=async()=>{ const {runSuite}=await import('./suite.js'); await runSuite(app,log); };
$('scene').onclick=async()=>{ const {showcase}=await import('./suite.js'); await showcase(app,log); };
$('bench').onclick=async()=>{
  if(!app.game) await start(); app.paused=true; app.cam.spin=0;
  const win=$('game').contentWindow, samples=[]; let last;
  await new Promise(resolve=>{const tick=now=>{if(last)samples.push(now-last);last=now;if(samples.length<150)win.requestAnimationFrame(tick);else resolve();};win.requestAnimationFrame(tick);});
  const a=samples.slice(30).sort((a,b)=>a-b), mean=a.reduce((x,y)=>x+y,0)/a.length;
  log(JSON.stringify({check:'render-benchmark',style:app.settings.style,quality:app.settings.quality,viewport:[win.innerWidth,win.innerHeight],dpr:app.renderer.getPixelRatio(),meanMs:mean,p50:a[60],p95:a[114],fps:1000/mean,draw:app.renderer.info.render,geometries:app.renderer.info.memory.geometries})); $('status').textContent='Benchmark recorded';
};
