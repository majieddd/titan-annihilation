const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const base = params.has('baseline') ? '../../' : '../';
if(params.has('compare')) localStorage.setItem(base==='../../'?'ta_settings':'ta_v2_settings',JSON.stringify({difficulty:'normal',quality:'high',planets:5,biome:'earth',seed:'titan',style:base==='../../'?'polished':'tactical',adaptive:false,reducedMotion:false,volume:0,sv:1}));
$('game').src = base + (params.has('bundle')?'index.html':'dev.html');
if(params.has('w')) $('game').style.width=Math.max(375,Math.min(2560,Number(params.get('w'))))+'px';
if(params.has('h')) $('game').style.height=Math.max(500,Math.min(1440,Number(params.get('h'))))+'px';
let app, GameAI, THREE, util;
const log = msg => { $('results').textContent += msg + '\n'; $('results').scrollTop = $('results').scrollHeight; };
const ready = setInterval(async () => {
  app = $('game').contentWindow.__app;
  if (!app || app.state !== 'menu' || app.generating) return;
  clearInterval(ready);
  const imports = await Promise.all([import(new URL(base + 'src/ai.js', location)), import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'), import(new URL(base + 'src/util.js', location))]);
  GameAI = imports[0].AI; THREE = imports[1]; util = imports[2];
  app.testHarness = true;
  $('status').textContent = 'Ready'; log('Build: ' + base + ' seed=' + app.settings.seed);
  if(params.get('auto')) document.getElementById(params.get('auto'))?.click();
}, 400);
const yieldFrame = () => new Promise(r => setTimeout(r, 0));
async function start() { await app.startGame(); app.introT = 0; app.cam.dist = app.cam.targetDist = 110; app.advance(4); }
$('e2e').onclick = async () => {
  $('status').textContent = 'Full match running'; await start();
  const g = app.game; const player = new GameAI(g, 0, 'normal');
  const enemyUpdate = app.ai.update.bind(app.ai); app.ai.update = dt => { enemyUpdate(dt); player.update(dt); };
  const begin = performance.now();
  while (!g.over && g.time < 2400) { app.paused=false; app.advance(2); if (Math.round(g.time) % 60 < 3) $('status').textContent = 'Simulated ' + Math.floor(g.time) + 's / ' + g.units.length + ' units'; await yieldFrame(); }
  app.advance(4); app.paused = true;
  const report={check:'full-match',pass:g.over,winner:g.winner,seconds:g.time,units:g.units.length,wallMs:Math.round(performance.now()-begin),stats:g.teams.map(t=>t.stats)};log(JSON.stringify(report));
  if(location.hostname==='127.0.0.1')fetch('/__evidence?name='+ (params.has('baseline')?'baseline':'v2')+'-full-match.json',{method:'POST',body:JSON.stringify(report)}).catch(()=>{});
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
  $('status').textContent='Benchmark running'; await start(); app.paused=true; app.cam.spin=0; app.cam.dist=app.cam.targetDist=110; app.cam.jumpTo(app.game.main,app.game.teams[0].commander.dir,110);app.cam.update(.1);app.advance(.01);app.renderer.info.autoReset=false;
  const win=$('game').contentWindow, samples=[];let draw;
  // Synchronously finish the GPU workload so browser occlusion / timer throttling is excluded.
  // This is render work per frame, not a promise of real-world monitor FPS.
  for(let i=0;i<130;i++){
    app.renderer.info.reset();const t0=performance.now();app.advance(1/60);app.renderer.getContext().finish();samples.push(performance.now()-t0);draw={...app.renderer.info.render};
    if(i%10===0)await yieldFrame();
  }
  const a=samples.slice(10).sort((a,b)=>a-b),mean=a.reduce((x,y)=>x+y,0)/a.length;
  const report={check:'render-work-benchmark',style:app.settings.style,quality:app.settings.quality,planets:app.system.planets.length,viewport:[win.innerWidth,win.innerHeight],dpr:app.renderer.getPixelRatio(),meanMs:mean,p50:a[60],p95:a[114],draw,geometries:app.renderer.info.memory.geometries};
  log(JSON.stringify(report));$('status').textContent='Benchmark recorded';
  if(location.hostname==='127.0.0.1')fetch('/__evidence?name='+ (params.has('baseline')?'baseline':'v2')+'-benchmark.json',{method:'POST',body:JSON.stringify(report)}).catch(()=>{});
};
$('capture').onclick=async()=>{app.paused=true;app.advance(.001);const name=params.has('baseline')?'baseline-battle':'v2-battle';const result=await fetch('/__evidence?name='+name+'.png',{method:'POST',body:app.canvas.toDataURL('image/png')});log(result.ok?'Saved '+name+'.png':'Capture needs the local tests/serve.py server.');};
