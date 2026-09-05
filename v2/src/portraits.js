import * as THREE from 'three';

// A single tiny renderer creates cached portraits from the battlefield geometry.
// The canvas is copied immediately, so it does not need preserveDrawingBuffer.
export class ModelPortraits {
  constructor(models) {
    this.models = models; this.cache = new Map();
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(192,144); this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xd4ecfa,0x384957,2.4));
    const light = new THREE.DirectionalLight(0xffedda,3.5); light.position.set(-3,7,5); this.scene.add(light);
    const rim = new THREE.DirectionalLight(0x8ecbff,2); rim.position.set(4,2,-4); this.scene.add(rim);
    this.camera = new THREE.OrthographicCamera(-4,4,3,-3,0.01,1000);
    this.material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.55,metalness:0.3});
  }
  get(id, team=0) {
    const key=id+':'+team; if(this.cache.has(key)) return this.cache.get(key);
    const model=this.models[id]; if(!model)return null;
    const group=new THREE.Group();
    for(const [source,off] of [[model.body,[0,0,0]],[model.turret,model.pivot]]) {
      if(!source)continue;
      const geo=source.clone(), col=geo.getAttribute('color'), va=geo.getAttribute('aVA');
      const tint=team ? [0.95,0.36,0.12] : [0.12,0.58,0.84];
      for(let i=0;i<col.count;i++)if(va.getX(i)>0.5)col.setXYZ(i,...tint);
      const mesh=new THREE.Mesh(geo,this.material);mesh.position.set(...off);group.add(mesh);
    }
    const box=new THREE.Box3().setFromObject(group),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const extent=Math.max(size.y,size.x*0.86,size.z*0.8)*0.78;
    group.position.sub(center); this.scene.add(group);
    this.camera.left=-extent*4/3;this.camera.right=extent*4/3;this.camera.top=extent;this.camera.bottom=-extent;
    this.camera.position.set(8,6,11).normalize().multiplyScalar(extent*6);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene,this.camera);
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=144;canvas.getContext('2d').drawImage(this.renderer.domElement,0,0);
    this.cache.set(key,canvas);this.scene.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();});
    return canvas;
  }
  copy(id,team=0) {const source=this.get(id,team);if(!source)return null;const c=document.createElement('canvas');c.width=source.width;c.height=source.height;c.getContext('2d').drawImage(source,0,0);c.setAttribute('aria-hidden','true');return c;}
}
