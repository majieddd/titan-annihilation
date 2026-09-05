import { BUILD_LISTS } from './defs.js';

const $=id=>document.getElementById(id);
const STEPS=[
  {id:'metal',title:'Claim two metal deposits',text:'Select your commander, choose Metal Extractor, then click a blue deposit.',build:'metal_extractor',label:'Locate a deposit'},
  {id:'energy',title:'Power your industry',text:'Build an Energy Plant on clear ground. Construction consumes both resources.',build:'energy_plant',label:'Build energy plant'},
  {id:'factory',title:'Establish a vehicle factory',text:'Factories turn your economy into an army. Leave room in front of the exit.',build:'vehicle_factory',label:'Build vehicle factory'},
  {id:'army',title:'Assemble six combat units',text:'Select a factory and queue Ant tanks. Shift-click adds five. Mix in anti-air.',label:'Select a factory'},
  {id:'attack',title:'Eliminate the enemy commander',text:'Press F to select your local army, A then click to attack-move. Keep your commander safe.',label:'Select local army'},
];
export class TacticalUI {
  constructor(app) {
    this.app=app;this.timer=0;this.done=new Set();this.stage=-1;
    $('hud').insertAdjacentHTML('beforeend',`<section id="commandStatus" class="panel"><button id="focusCommander" title="Select and focus commander (H)"><span>COMMANDER</span><strong id="commanderHP">9000 / 9000</strong></button><div class="healthTrack"><i id="commanderFill"></i></div><div id="efficiency">Construction ready</div></section>
      <section id="mission" class="panel"><button id="missionToggle" aria-expanded="true">OPENING OBJECTIVE <span id="missionNumber">01 / 05</span></button><div id="missionBody"><h2 id="missionTitle"></h2><p id="missionText"></p><button id="missionAction"></button><div id="missionChecks"></div></div></section>
      <div id="quickbar"><button id="armyBtn" title="Select combat units on this planet (F)">Army <b id="armyCount">0</b></button><button id="idleFactoryBtn" title="Select an idle factory (I)">Idle factories <b id="idleFactoryCount">0</b></button><button id="idleBuilderBtn" title="Select next idle builder (Tab)">Idle builders <b id="idleBuilderCount">0</b></button></div>
      <button id="settingsBtn" title="Pause and settings (Escape)">Menu <kbd>Esc</kbd></button>`);
    $('app').insertAdjacentHTML('beforeend',`<dialog id="settingsDialog" class="panel" aria-labelledby="settingsTitle"><div class="dialogHead"><h2 id="settingsTitle">Command paused</h2><button id="closeSettings" aria-label="Close settings">Close</button></div><p>Resume when you are ready. Your orders are preserved.</p><label class="setting">Graphics <select id="liveQuality"><option value="medium">Performance</option><option value="high">Balanced</option><option value="ultra">Ultra</option></select></label><label class="setting">Adaptive resolution <input id="adaptiveSetting" type="checkbox"></label><label class="setting">Reduced motion <input id="motionSetting" type="checkbox"></label><label class="setting">Sound volume <input id="volumeSetting" type="range" min="0" max="1" step="0.05"></label><details open><summary>Controls</summary><dl class="controlList"><dt>Arrows / drag</dt><dd>Orbit camera</dd><dt>Wheel / Q E</dt><dd>Zoom / rotate</dd><dt>Click / drag</dt><dd>Select units</dd><dt>Right click</dt><dd>Move, attack, assist or repair</dd><dt>A / S</dt><dd>Attack-move / stop</dd><dt>F / H / I / Tab</dt><dd>Army / commander / idle factory / builder</dd><dt>Shift / Ctrl + 1-9</dt><dd>Queue orders / save groups</dd><dt>V / N / P</dt><dd>System / nuke / pause</dd></dl></details><div class="dialogActions"><button class="primary" id="resumeGame">Resume operation</button><button id="returnMenu">Main menu</button></div></dialog>`);
    $('settingsBtn').onclick=()=>this.openSettings();$('closeSettings').onclick=$('resumeGame').onclick=()=>this.closeSettings();
    $('settingsDialog').addEventListener('cancel',e=>{e.preventDefault();this.closeSettings();});
    $('returnMenu').onclick=()=>{$('settingsDialog').close();app.toMenu();};
    $('focusCommander').onclick=()=>this.commander();$('armyBtn').onclick=()=>this.army();$('idleFactoryBtn').onclick=()=>this.idleFactory();$('idleBuilderBtn').onclick=()=>app.ui.selectIdleFabber();
    $('missionAction').onclick=()=>this.missionAction();
    $('missionToggle').onclick=()=>{const expanded=$('missionToggle').getAttribute('aria-expanded')==='true';$('missionToggle').setAttribute('aria-expanded',String(!expanded));$('missionBody').hidden=expanded;};
    $('liveQuality').onchange=e=>{app.settings.quality=e.target.value;app.applyQuality();this.save();};
    $('adaptiveSetting').onchange=e=>{app.settings.adaptive=e.target.checked;app.applyQuality();this.save();};
    $('motionSetting').onchange=e=>{app.settings.reducedMotion=e.target.checked;app.cam.reducedMotion=e.target.checked;app.cam.shake=0;this.save();};
    $('volumeSetting').oninput=e=>{app.settings.volume=Number(e.target.value);app.audio.setVolume(app.settings.volume);this.save();};
    window.addEventListener('keydown',e=>{
      const modal=$('settingsDialog').open;
      if(modal){if(e.key==='Escape'){e.preventDefault();this.closeSettings();}e.stopImmediatePropagation();return;}
      if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||app.state!=='playing')return;
      if(e.code==='Escape'&&!app.ui.placing&&!app.ui.mode){e.preventDefault();e.stopImmediatePropagation();this.openSettings();}
      if(e.code==='KeyF'&&!e.ctrlKey&&!e.metaKey){this.army();e.preventDefault();}
      if(e.code==='KeyI'&&!e.ctrlKey&&!e.metaKey){this.idleFactory();e.preventDefault();}
    },true);
    window.addEventListener('blur',()=>{app.ui.shiftDown=false;app.ui.boxStart=null;app.ui.boxing=false;$('selbox').classList.add('hidden');});
    this.syncSettings();
  }
  save(){try{localStorage.setItem('ta_v2_settings',JSON.stringify(this.app.settings));}catch{} }
  syncSettings(){const s=this.app.settings;$('liveQuality').value=s.quality;$('adaptiveSetting').checked=s.adaptive;$('motionSetting').checked=s.reducedMotion;$('volumeSetting').value=s.volume;}
  openSettings(){const a=this.app;this.wasPaused=a.paused;if(!a.paused)a.togglePause();a.cam.keys={};a.cam.panX=a.cam.panY=0;this.syncSettings();$('settingsDialog').showModal();}
  closeSettings(){$('settingsDialog').close();if(!this.wasPaused&&this.app.paused)this.app.togglePause();this.app.canvas.focus();}
  commander(){const c=this.app.game?.teams[0].commander;if(!c||c.dead)return;this.app.ui.select([c]);this.app.cam.jumpTo(c.planet,c.dir,90);return c;}
  army(){const a=this.app;const units=a.game.teams[0].units.filter(u=>u.built&&!u.dead&&u.def.mobile&&u.def.weapons&&u.def.kind!=='commander'&&u.planet===a.cam.planet&&!u.transit);a.ui.select(units);a.ui.hint(units.length?`${units.length} combat units selected. A then click to attack-move.`:'No combat units on this planet. Build units at a factory.');}
  idleFactory(any=false){const a=this.app;const f=a.game.teams[0].units.find(u=>u.factory&&u.built&&!u.dead&&(any||(!u.factory.current&&!u.factory.queue.length)));if(f){a.ui.select([f]);a.cam.jumpTo(f.planet,f.dir,95);}else a.ui.hint('No idle factories.');}
  missionAction(){const s=STEPS[this.stage];if(!s)return;if(s.id==='army'){this.idleFactory(true);return;}if(s.id==='attack'){this.army();return;}const c=this.commander();if(!c)return;
    if(s.id==='metal'){const g=this.app.game;const spot=c.planet.spots.filter(p=>!p.taken&&c.planet.sameComponent(c.dir,p.dir)&&g.canPlace('metal_extractor',0,c.planet,p.dir).ok).sort((a,b)=>b.dir.dot(c.dir)-a.dir.dot(c.dir))[0];if(spot)this.app.cam.jumpTo(c.planet,spot.dir,75);}
    if(BUILD_LISTS[c.def.builder.list].includes(s.build))this.app.ui.startPlacing(s.build);
  }
  reset(){this.done.clear();this.stage=-1;this.timer=1;$('missionBody').hidden=false;$('missionToggle').setAttribute('aria-expanded','true');}
  update(dt){this.timer+=dt;if(this.timer<0.15)return;this.timer=0;const a=this.app,g=a.game;if(!g)return;const t=g.teams[0],c=t.commander,units=t.units.filter(u=>u.built&&!u.dead);
    if(c){$('commanderHP').textContent=Math.ceil(Math.max(0,c.hp))+' / '+c.def.hp;$('commanderFill').style.transform=`scaleX(${Math.max(0,c.hp/c.def.hp)})`;$('commandStatus').classList.toggle('critical',c.hp/c.def.hp<0.3);}
    const efficiency=Math.round(t.eff*100);$('efficiency').textContent=t.lastDemandM?`${efficiency}% construction efficiency`:'Construction ready';$('efficiency').classList.toggle('warning',efficiency<95&&t.lastDemandM>0);
    $('armyCount').textContent=units.filter(u=>u.def.mobile&&u.def.weapons&&u.def.kind!=='commander'&&u.planet===a.cam.planet).length;
    $('idleFactoryCount').textContent=units.filter(u=>u.factory&&!u.factory.current&&!u.factory.queue.length).length;
    $('idleBuilderCount').textContent=units.filter(u=>u.def.builder&&u.def.kind!=='commander'&&!u.orders.length&&!u.transit).length;
    if(units.filter(u=>u.def.extractor).length>=2)this.done.add('metal');if(units.some(u=>u.def.id==='energy_plant'))this.done.add('energy');if(units.some(u=>u.factory))this.done.add('factory');if(units.filter(u=>u.def.mobile&&u.def.weapons&&u.def.kind!=='commander').length>=6)this.done.add('army');
    const stage=STEPS.findIndex(s=>!this.done.has(s.id));if(stage!==this.stage){this.stage=stage;const s=STEPS[stage];$('missionNumber').textContent=`0${stage+1} / 05`;$('missionTitle').textContent=s.title;$('missionText').textContent=s.text;$('missionAction').textContent=s.label;$('missionChecks').textContent=STEPS.slice(0,stage).map(s=>'✓ '+s.id).join('   ');}
    if(t.stallM&&t.lastDemandM>0)$('missionText').textContent='Metal income is limiting construction. Claim more deposits or pause a production queue.';
    else if(t.stallE&&t.lastDemandM>0)$('missionText').textContent='Energy income is limiting construction. Build another Energy Plant or pause a production queue.';
    else $('missionText').textContent=STEPS[stage].text;
    $('fps').textContent=`${a.performance.fps} FPS`;$('fps').title=`${a.performance.frameMs.toFixed(1)}ms / ${Math.round(a.renderScale*100)}% adaptive scale`;
  }
}
