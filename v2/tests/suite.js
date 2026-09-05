import * as THREE from 'three';
import {DEFS} from '../src/defs.js';
import {moveOnSphere,anyTangent,rotateTangent} from '../src/util.js';
const vec=()=>new THREE.Vector3();
const landing=planet=>planet.spawns[0]?.dir||planet.spots[0]?.dir||new THREE.Vector3(0,1,0);
const wait=()=>new Promise(r=>setTimeout(r,0));
function near(c,distance,angle=0){const t=anyTangent(c.dir,vec());rotateTangent(c.dir,t,angle,t);return moveOnSphere(c.dir,t,distance/c.planet.R,vec());}
export async function runSuite(app,log){
  const rows=[];const check=(id,condition,details={})=>{const row={id,pass:!!condition,...details};rows.push(row);log(JSON.stringify(row));};
  try{
    await app.startGame();app.ai.update=()=>{};app.introT=0;app.advance(4);
    const g=app.game,c=g.teams[0].commander,p=c.planet,t=g.teams[0],win=app.canvas.ownerDocument.defaultView,doc=win.document;
    check('launch-selects-commander',app.ui.sel[0]===c&&c.drop===0);
    const spot=p.spots.filter(s=>g.canPlace('metal_extractor',0,p,s.dir).ok&&p.sameComponent(c.dir,s.dir)).sort((a,b)=>b.dir.dot(c.dir)-a.dir.dot(c.dir))[0];
    app.cam.jumpTo(p,spot.dir,90);app.cam.dist=app.cam.targetDist;app.cam.update(1/60);app.ui.startPlacing('metal_extractor');
    const point=vec();app.cam.worldToScreen(spot.pos,point);
    // No mousemove or rendered ghost frame between input and the placement click.
    app.canvas.dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true,button:0,clientX:point.x,clientY:point.y}));
    app.canvas.dispatchEvent(new win.MouseEvent('mouseup',{bubbles:true,button:0,clientX:point.x,clientY:point.y}));
    const extractor=spot.taken;check('first-click-placement',!!extractor&&!app.ui.placing);
    app.advance(22);check('construction-and-income',extractor?.built&&t.incomeM>12,{income:t.incomeM});
    await wait();
    const firstButton=doc.querySelector('[data-def="metal_extractor"]');firstButton.focus();app.ui.renderPanels();app.advance(1);
    check('production-controls-retain-focus',doc.activeElement===firstButton&&firstButton.isConnected);
    const cameraBefore=app.cam.q.clone();win.dispatchEvent(new win.KeyboardEvent('keydown',{bubbles:true,key:'a',code:'KeyA'}));app.cam.update(.1);win.dispatchEvent(new win.KeyboardEvent('keyup',{bubbles:true,key:'a',code:'KeyA'}));
    check('attack-key-does-not-pan',app.ui.mode==='attack'&&cameraBefore.angleTo(app.cam.q)<1e-6);app.ui.mode=null;
    const selected=app.ui.sel[0];const currentGame=app.game;const currentTime=g.time;app.setStyle('poly');app.setStyle('tactical');
    check('style-preserves-match',app.game===currentGame&&g.time===currentTime&&!app.generating&&app.ui.sel[0]===selected);
    app.togglePause();const pausedAt=g.time;app.advance(3);check('pause-stops-simulation',g.time===pausedAt);app.togglePause();
    const metal=t.metal,energy=t.energy;t.metal=0;t.energy=0;g.economyPre(1/60);g.spend(0,1e6,1/60);g.spend(0,1e6,1/60);
    check('simultaneous-spend-conserves-budget',t.spentM<=t.incomeM/60+1e-8&&t.spentE<=t.incomeE/60+1e-8);t.metal=metal;t.energy=energy;
    g.orderStop([c]);
    const tank=g.createUnit('ant',0,p,near(c,8,1));tank.hp=tank.def.hp*.5;t.metal=100;t.energy=2000;
    const startMoney=t.metal,startTime=g.time;const expectedIncome=t.incomeM;g.orderRepair([c],tank);app.advance(3);
    const cost=startMoney+expectedIncome*(g.time-startTime)-t.metal;
    check('repair-restores-with-exact-cost',tank.hp===tank.def.hp&&Math.abs(cost-27)<.05,{repairCost:cost});
    const enemy=g.createUnit('ant',1,p,near(c,180,2));enemy.hp=100;
    check('repair-rejects-enemy',g.orderRepair([c],enemy)===0);
    c.hp=4500;const fab=g.createUnit('bot_fabber',0,p,near(c,8,2));g.orderRepair([fab],c);const hp=c.hp;app.advance(2);
    check('commander-repair-is-bounded',c.hp>hp&&c.hp<hp+200,{repaired:c.hp-hp});g.orderStop([fab]);c.hp=c.def.hp;
    const before=tank.pos.clone();g.orderMove([tank],p,near(c,25,1));app.advance(5);
    check('movement-follows-surface',tank.pos.distanceTo(before)>5&&Math.abs(tank.dir.length()-1)<1e-6,{moved:tank.pos.distanceTo(before)});
    check('interpolation-snapshot-exists',tank.prevPos.distanceTo(tank.pos)<2&&tank.prevQuat.length()>0.99);
    g.orderStop([tank]);app.advance(.5);check('stop-clears-order',tank.orders.length===0&&tank.speed<.1);
    const target=app.system.planets[1];check('ground-cannot-cross-without-gate',g.orderMove([tank],target,landing(target))===0);
    const fd=g.findPlacement('vehicle_factory',0,p,c.dir,20,65);const factory=g.createUnit('vehicle_factory',0,p,fd);t.metal=2000;t.energy=25000;
    g.factoryQueue(factory,'ant',2);app.advance(35);
    const products=g.teams[0].units.filter(u=>u.parentFactory===factory&&u.built);
    check('factory-produces-and-rallies',products.length===2&&products.every(u=>u.pos.distanceTo(factory.pos)>factory.def.radius),{products:products.length});
    factory.factory.loop=true;g.factoryQueue(factory,'skitter');app.advance(12);
    check('repeat-production-persists',factory.factory.queue.includes('skitter')||factory.factory.current?.def.id==='skitter');factory.factory.loop=false;factory.factory.queue=[];
    const tp1=g.createUnit('teleporter',0,p,near(c,42,2));const tp2=g.createUnit('teleporter',0,target,landing(target));
    check('teleporter-link-is-reciprocal',g.linkTeleporters(tp1,tp2)&&tp1.link===tp2&&tp2.link===tp1);
    const traveler=g.createUnit('dox',0,p,near({dir:tp1.dir,planet:p},tp1.def.radius+1,0));g.orderMove([traveler],target,near({dir:tp2.dir,planet:target},15,0));app.advance(2);
    check('ground-teleport-arrival',traveler.planet===target);
    g.unlinkTeleporter(tp1);check('unlink-clears-both-ends',!tp1.link&&!tp2.link);
    const orbital=g.createUnit('orbital_fabber',0,p,c.dir);g.orderMove([orbital],target,landing(target));app.advance(40);
    check('orbital-transit-arrival',orbital.planet===target&&!orbital.transit);
    await wait();
    const cannon=g.createUnit('nuke_launcher',0,p,near(c,38,-1));cannon.silo.ammo=1;cannon.silo.active=false;
    const shield=g.createUnit('antinuke',1,target,near({dir:landing(target),planet:target},26,1));shield.silo.ammo=1;shield.silo.active=false;
    g.fireNuke(cannon,target,shield.dir);app.advance(40);
    check('anti-nuke-intercepts',shield.silo.ammo===0&&!shield.dead&&g.nukes.length===0);
    const walker=DEFS.commander.model.filter(part=>(part[7]||'').includes('S'));const left=walker.filter(part=>part[1]<0);
    check('connected-leg-pivots',left.length>=4&&left.every(part=>JSON.stringify(part[11])===JSON.stringify(left[0][11])));
    check('joint-attributes-cover-geometry',Object.values(app.unitRenderer.models).every(m=>m.body.getAttribute('aJR').count===m.body.getAttribute('position').count));
    const batch=app.unitRenderer.types.ant,initialCap=batch.cap,matrix=new THREE.Matrix4();app.unitRenderer.begin();
    for(let i=0;i<=initialCap;i++)app.unitRenderer.add('ant',matrix,[.2,.6,1],1,0,matrix);
    check('large-army-batches-grow',batch.n===initialCap+1&&batch.cap>=batch.n&&batch.body.instanceMatrix.array.length===batch.cap*16&&batch.turret.geometry.getAttribute('aMot').count===batch.cap);
    app.advance(.1);check('animation-snapshots-are-finite',[tank.prevPhase,tank.prevRecoil,tank.phase,tank.recoil].every(Number.isFinite));
    app.cam.dist=app.cam.targetDist=110;app.advance(.1);check('tactical-distance-shows-models',app.fx.icons.uniforms.uAlpha.value===0);
    app.tacticalUI.openSettings();const atSettings=g.time;app.advance(2);check('settings-pauses-and-opens-dialog',g.time===atSettings&&doc.getElementById('settingsDialog').open);
    const quality=doc.getElementById('liveQuality');quality.value='medium';quality.dispatchEvent(new win.Event('change'));
    check('live-quality-preserves-game',app.game===g&&app.settings.quality==='medium'&&app.renderer.getPixelRatio()<=1);
    quality.value='high';quality.dispatchEvent(new win.Event('change'));const motion=doc.getElementById('motionSetting');motion.checked=true;motion.dispatchEvent(new win.Event('change'));app.cam.addShake(1);
    check('reduced-motion-disables-shake',app.cam.shake===0&&app.cam.reducedMotion);motion.checked=false;motion.dispatchEvent(new win.Event('change'));app.tacticalUI.closeSettings();
    check('settings-resumes-match',!app.paused&&!doc.getElementById('settingsDialog').open);
    for(const planet of app.system.planets){app.focusPlanet(planet,landing(planet),110);app.cam.update(.02);check('inspect-world-'+planet.index,app.cam.planet===planet&&Number.isFinite(app.cam.camera.position.x));}
    app.focusPlanet(p,c.dir,95);app.cam.dist=95;app.cam.update(.1);app.ui.select([c]);app.advance(.1);
    check('hud-page-no-overflow',doc.body.scrollWidth<=win.innerWidth,{width:win.innerWidth,scrollWidth:doc.body.scrollWidth});
    const control=doc.querySelector('[data-def="metal_extractor"]');check('build-control-is-accessible',control?.tagName==='BUTTON'&&!!control.getAttribute('aria-label'));
    const modelThumb=control?.querySelector('canvas');check('build-control-uses-model',modelThumb?.width===192);
    let ends=0;const event=g.onEvent;g.onEvent=e=>{if(e.type==='gameover')ends++;event(e);};
    for(let i=0;i<8;i++){const u=g.createUnit('leveler',1,p,near(c,18+i*2,i*.2));g.orderAttack([u],c);}
    for(let i=0;i<100&&!g.over;i++){app.advance(1);if(i%10===0)await wait();}
    app.advance(4);check('combat-reaches-one-end-state',g.over&&g.winner===1&&ends===1,{winner:g.winner,events:ends});
    app.paused=true;
  }catch(error){check('suite-exception',false,{error:String(error),stack:error.stack});}
  const pass=rows.filter(r=>r.pass).length,fail=rows.length-pass;log(`pass=${pass} fail=${fail}`);document.getElementById('status').textContent=`Suite: pass=${pass} fail=${fail}`;
  window.testResults=rows;
  if(location.hostname==='127.0.0.1')fetch('/__evidence?name=v2-regression.json',{method:'POST',body:JSON.stringify({pass,fail,rows})}).catch(()=>{});
}
export async function showcase(app,log){
  await app.startGame();app.ai.update=()=>{};app.advance(4);const g=app.game,c=g.teams[0].commander,p=c.planet;
  const buildings=['vehicle_factory','bot_factory','energy_plant','laser_tower'];
  for(let i=0;i<buildings.length;i++){const d=g.findPlacement(buildings[i],0,p,c.dir,16+i*8,70,null);if(d)g.createUnit(buildings[i],0,p,d);}
  for(const spot of p.spots.filter(s=>s.dir.dot(c.dir)>Math.cos(40/p.R)).slice(0,3)){const u=g.placeStructure('metal_extractor',0,p,spot.dir);if(u)g.complete(u);}
  const army=[];for(let i=0;i<22;i++){const id=i%5===0?'leveler':i%3===0?'dox':'ant';const dir=g.findPlacement(id,0,p,near(c,14+(i%6)*4,.3+Math.floor(i/6)*.25),0,45);if(dir){const u=g.createUnit(id,0,p,dir);army.push(u);}}
  let front=c.dir;for(let i=0;i<16;i++){const id=i%4===0?'inferno':'ant';const dir=g.findPlacement(id,1,p,near(c,65+(i%4)*4,.25+Math.floor(i/4)*.14),0,45);if(dir){const u=g.createUnit(id,1,p,dir);g.orderAttackMove([u],p,c.dir);front=dir;}}
  g.orderAttackMove(army,p,front);app.ui.select(army);app.cam.jumpTo(p,c.dir.clone().lerp(front,.35).normalize(),110);app.cam.dist=110;app.advance(2);app.paused=true;
  log('Showcase: 22 friendly and 16 hostile units, real combat and factory geometry.');
}
