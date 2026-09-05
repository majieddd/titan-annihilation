import {DEFS} from './src/defs.js';
import {buildModel} from './src/models.js';
import {ModelPortraits} from './src/portraits.js';
const models={};const wait=()=>new Promise(r=>setTimeout(r,0));
for(const d of Object.values(DEFS)){models[d.id]=buildModel(d);await wait();}
const portraits=new ModelPortraits(models);
for(const d of Object.values(DEFS)){
  const el=document.createElement('article');el.className='model';el.dataset.kind=d.kind;
  el.append(portraits.copy(d.id));const h=document.createElement('h2');h.textContent=d.name;el.append(h);
  const p=document.createElement('p');p.textContent=d.desc;el.append(p);
  const st=document.createElement('p');st.className='stats';st.textContent=`${d.cost} metal / ${d.hp} HP`+(d.weapons?` / ${d.weapons[0].range} range`:'');el.append(st);document.getElementById('models').append(el);await wait();
}
document.getElementById('rosterStatus').textContent=Object.keys(DEFS).length+' models, rendered from game geometry.';
document.querySelectorAll('[data-kind]').forEach(b=>{if(b.tagName!=='BUTTON')return;b.onclick=()=>{document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.model').forEach(m=>m.hidden=b.dataset.kind!=='all'&&m.dataset.kind!==b.dataset.kind);};});
