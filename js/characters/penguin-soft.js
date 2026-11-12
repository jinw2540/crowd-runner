/* Crowd Runner / Soft Penguin v2. Original parametric geometry.
 * Three.js r149; +Y up, +Z forward, default height approximately 2.12.
 * Two-joint continuous body and two-joint flippers, standard glTF animation clips.
 */
(function(scope){
'use strict';
scope.createSoftPenguin=function(T,options={}){
  const high=options.detail!=='low', N=high?48:28;
  const root=new T.Group();root.name='Soft_Penguin';
  const rig=new T.Group();rig.name='Soft_BodyRig';root.add(rig);
  const mat=(name,color,roughness=.85)=>{const m=new T.MeshStandardMaterial({color,roughness});m.name=name;return m;};
  const dark=mat('Soft navy clay','#273b52',.82),ivory=mat('Milk white','#fbf6e9',.94);
  const black=mat('Gentle dark eyes','#111b22',.70),orange=mat('Soft apricot bill','#e18b50',.83);
  const lowerOrange=mat('Lower bill','#cc7440',.90),mouthMat=mat('Mouth crease','#80513c',.95);
  const footMat=mat('Apricot clay feet','#dc9857',.90);
  function surface(n,m,fn){
    const p=[],uv=[],idx=[];
    for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){p.push(...fn(i/n,j/m));uv.push(i/n,j/m);}
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+n+1;idx.push(a,a+1,b,b,a+1,b+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  function weldSeam(g,n,m){const norm=g.attributes.normal;for(let j=0;j<=m;j++){const a=j*(n+1),b=a+n;const v=new T.Vector3().fromBufferAttribute(norm,a).add(new T.Vector3().fromBufferAttribute(norm,b)).normalize();norm.setXYZ(a,...v.toArray());norm.setXYZ(b,...v.toArray());}}
  function add(name,g,m,parent=rig){const o=new T.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function egg(name,pos,scale,m,parent=rig,n=high?24:16){const g=new T.SphereGeometry(1,n,Math.round(n*.7));g.scale(...scale);const o=add(name,g,m,parent);o.position.set(...pos);return o;}
  function tube(name,ps,r,m,parent=rig){return add(name,new T.TubeGeometry(new T.CatmullRomCurve3(ps.map(p=>new T.Vector3(...p))),high?16:8,r,high?6:4,false),m,parent);}
  const profile=[
    [.055,.025,.025],[.105,.36,.30],[.26,.57,.47],[.58,.75,.60],
    [.82,.78,.63],[1.05,.73,.59],[1.25,.66,.55],[1.43,.67,.56],
    [1.65,.71,.59],[1.84,.66,.55],[2.01,.49,.42],[2.13,.25,.23],[2.18,.003,.003]
  ];
  function radius(y,c){
    if(y>=1.65)return Math.max(.001,(c===1?.71:.59)*Math.sqrt(Math.max(0,1-Math.pow((y-1.65)/.53,2))));
    let k=0;while(k<profile.length-2&&y>profile[k+1][0])k++;
    const a=profile[Math.max(0,k-1)],b=profile[k],d=profile[k+1],e=profile[Math.min(profile.length-1,k+2)];
    const t=T.MathUtils.clamp((y-b[0])/(d[0]-b[0]),0,1),span=d[0]-b[0];
    const m0=(d[c]-a[c])/(d[0]-a[0])*span,m1=(e[c]-b[c])/(e[0]-b[0])*span;
    return(2*t*t*t-3*t*t+1)*b[c]+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*d[c]+(t*t*t-t*t)*m1;
  }
  // The head bends continuously into the body; no visible ball-joint neck.
  const torso=new T.Bone();torso.name='Soft_Torso';
  const head=new T.Bone();head.name='Soft_Head';head.position.y=1.20;torso.add(head);
  const skeleton=new T.Skeleton([torso,head]);
  function weightBody(g){const si=[],sw=[];const p=g.attributes.position;
    for(let i=0;i<p.count;i++){const t=T.MathUtils.smoothstep(p.getY(i),1.08,1.45);si.push(0,t>0?1:0,0,0);sw.push(1-t,t,0,0);}
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));
  }
  const bodyGeo=surface(N,high?52:30,(u,v)=>{const y=.055+2.125*v,a=u*Math.PI*2;return[Math.sin(a)*radius(y,1),y,Math.cos(a)*radius(y,2)];});
  weldSeam(bodyGeo,N,high?52:30);weightBody(bodyGeo);
  for(let i=0;i<=N;i++)bodyGeo.attributes.normal.setXYZ((high?52:30)*(N+1)+i,0,1,0);
  const body=new T.SkinnedMesh(bodyGeo,dark);body.name='Soft continuous silhouette';body.add(torso);rig.add(body);body.bind(skeleton);body.castShadow=true;body.receiveShadow=true;
  const bibGeo=surface(high?36:20,high?36:20,(u,v)=>{const y=.11+1.27*v,a=(u*2-1)*1.00*Math.pow(Math.sin(Math.PI*v),.54);return[Math.sin(a)*(radius(y,1)+.006),y,Math.cos(a)*(radius(y,2)+.006)];});
  weightBody(bibGeo);const bib=new T.SkinnedMesh(bibGeo,ivory);bib.name='Simple milk-white belly';rig.add(bib);bib.bind(skeleton);bib.receiveShadow=true;
  const headLocal=y=>y-1.20;
  const lids=[],pupils=[];
  for(const side of [-1,1]){
    const eye=new T.Group();eye.name=side<0?'Soft_Eye_L':'Soft_Eye_R';head.add(eye);eye.position.set(side*.245,headLocal(1.67),.551);eye.rotation.y=side*.25;
    const lid=new T.Group();lid.name=side<0?'Soft_Blink_L':'Soft_Blink_R';eye.add(lid);lids.push(lid);
    egg('Small ivory eye',[0,0,0],[.109,.119,.025],ivory,lid);
    const pupil=egg('Quiet pupil',[-side*.008,-.002,.024],[.059,.069,.014],black,lid);pupils.push(pupil);
  }
  const upperBill=egg('Small rounded upper bill',[0,headLocal(1.454),.621],[.153,.068,.139],orange,head);
  const lowerBill=egg('Soft_LowerBill',[0,headLocal(1.417),.617],[.134,.036,.113],lowerOrange,head);
  tube('Small relaxed smile',[[-.115,headLocal(1.438),.686],[-.065,headLocal(1.424),.742],[0,headLocal(1.421),.758],[.065,headLocal(1.424),.742],[.115,headLocal(1.438),.686]],.006,mouthMat,head);
  // Short flexible flippers: articulated tips lag behind the shoulder.
  const shoulders=[],tips=[];
  for(const side of [-1,1]){
    const g=surface(high?22:14,high?28:16,(u,v)=>{const a=u*Math.PI*2,r=Math.pow(Math.sin(Math.PI*v),.62);return[Math.cos(a)*.16*r+side*.08*v,-.78*v,Math.sin(a)*.068*r-.06*v*v];});
    weldSeam(g,high?22:14,high?28:16);
    const si=[],sw=[];for(let i=0;i<g.attributes.position.count;i++){const w=T.MathUtils.smoothstep(-g.attributes.position.getY(i),.28,.64);si.push(0,w>0?1:0,0,0);sw.push(1-w,w,0,0);}
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));
    // Keep the shoulder below the scarf and in front of the cape opening.
    const mesh=new T.SkinnedMesh(g,dark);mesh.name=side<0?'Flexible left flipper':'Flexible right flipper';mesh.position.set(side*.65,1.11,.12);rig.add(mesh);
    const shoulder=new T.Bone(),tip=new T.Bone();shoulder.name=side<0?'Soft_Wing_L':'Soft_Wing_R';tip.name=side<0?'Soft_WingTip_L':'Soft_WingTip_R';tip.position.y=-.36;shoulder.add(tip);mesh.add(shoulder);
    mesh.bind(new T.Skeleton([shoulder,tip]));mesh.castShadow=true;mesh.receiveShadow=true;shoulders.push(shoulder);tips.push(tip);
  }
  // Small, flattened feet nest under the tummy. No exposed ankle cylinders.
  const feet=[];
  for(const side of [-1,1]){
    const pivot=new T.Group();pivot.name=side<0?'Soft_Foot_L':'Soft_Foot_R';pivot.position.set(side*.285,.072,.12);pivot.rotation.y=side*.17;root.add(pivot);feet.push(pivot);
    const geo=new T.SphereGeometry(1,high?28:16,high?16:10);
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const toes=1+.018*Math.cos(x*11)*Math.max(0,z);p.setXYZ(i,x*.205,y*.062,z*.28*toes+.055);}
    geo.computeVertexNormals();add('Small rounded foot',geo,footMat,pivot);
  }
  const tailGeo=surface(high?24:16,high?18:12,(u,v)=>{
    const a=u*Math.PI*2,taper=Math.pow(Math.sin(Math.PI*v),.90)*(1-.40*v);
    return[Math.sin(a)*(.18*taper+.001),.23+Math.cos(a)*(.065*taper+.001)+.025*v,-.19-.50*v];
  });
  weldSeam(tailGeo,high?24:16,high?18:12);add('Gently pointed tail',tailGeo,dark);

  // Optional cloth scarf, shaped around the body with an asymmetric drape.
  const scarf=new T.Group();scarf.name='Soft_OptionalScarf';rig.add(scarf);scarf.visible=!!options.scarf;
  const woven=document.createElement('canvas');woven.width=woven.height=256;
  const wc=woven.getContext('2d'),pixels=wc.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const i=(y*256+x)*4;
    const weave=1+.022*Math.sin(x*Math.PI/2)+.018*Math.sin(y*Math.PI/2)+.009*Math.sin(x*13.1+y*7.7);
    pixels.data[i]=186*weave;pixels.data[i+1]=115*weave;pixels.data[i+2]=86*weave;pixels.data[i+3]=255;
  }
  wc.putImageData(pixels,0,0);const clothMap=new T.CanvasTexture(woven);clothMap.encoding=T.sRGBEncoding;clothMap.wrapS=clothMap.wrapT=T.RepeatWrapping;
  const cloth=new T.MeshStandardMaterial({color:'#ffffff',map:clothMap,roughness:1});cloth.name='Soft woven rust fabric';
  function collarPoint(u,v){
    const a=u*Math.PI*2,b=v*Math.PI*2;
    const centerY=1.265-.052*Math.cos(a)+.022*Math.sin(a+.35)+.009*Math.sin(2*a);
    const y=centerY+.070*Math.sin(b)*(1+.12*Math.sin(a-.4));
    const headWeight=T.MathUtils.smoothstep(y,1.08,1.45),s=1-.06*headWeight;
    const fold=.005*Math.sin(3*a+.6)*Math.sin(b)*Math.sin(b);
    const offset=.023+.012*Math.cos(b)+fold;
    return[Math.sin(a)*(radius(y,1)*s+offset),y,Math.cos(a)*(radius(y,2)*s+offset)];
  }
  const scarfGeo=surface(high?88:44,high?20:12,collarPoint);weldSeam(scarfGeo,high?88:44,high?20:12);
  const suv=scarfGeo.attributes.uv;for(let i=0;i<suv.count;i++)suv.setXY(i,suv.getX(i)*2.8,suv.getY(i)*.30);
  add('Loosely wrapped cloth collar',scarfGeo,cloth,scarf);
  // A small gathered fold joins the overlapping ends, rather than a rigid buckle.
  const knot=egg('Soft gathered knot',[.438,1.208,.472],[.092,.111,.058],cloth,scarf);
  knot.rotation.z=-.52;
  const kp=knot.geometry.attributes.position;
  for(let i=0;i<kp.count;i++){const x=kp.getX(i),y=kp.getY(i),z=kp.getZ(i);kp.setZ(i,z+.005*Math.cos(y*70+x*20)*(1-Math.min(1,Math.abs(y)/.111)));}
  knot.geometry.computeVertexNormals();
  const scarfTails=[];
  for(let i=0;i<2;i++){
    const pivot=new T.Group();pivot.name='Soft_ScarfTail_'+i;pivot.position.set(i?.475:.426,i?1.195:1.178,i?.458:.493);scarf.add(pivot);scarfTails.push(pivot);
    const len=i?.275:.415,width=i?.142:.186,nx=high?14:8,ny=high?32:18;
    function point(u,v,back){
      const x=(u-.5)*width*(.94+.06*Math.sin(Math.PI*v))+.016*Math.sin(Math.PI*v);
      const y=-v*len+.018*(u-.5)*v+.009*Math.cos(u*Math.PI*2)*Math.pow(v,4);
      const z=.016+.115*Math.sin(v*Math.PI*.55)+.012*Math.sin(v*Math.PI*2+i*.7)*Math.sin(Math.PI*v)+.009*Math.sin(u*Math.PI*3+v)*Math.sin(Math.PI*v)+(back?-.006:.006);
      return[x,y,z];
    }
    const ps=[],uv=[],ix=[],count=(nx+1)*(ny+1);
    for(let layer=0;layer<2;layer++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){ps.push(...point(x/nx,y/ny,!!layer));uv.push(x/nx*.26,y/ny*.65);}
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const a=y*(nx+1)+x,b=a+nx+1;
      ix.push(a,b,a+1,b,b+1,a+1,a+count,a+1+count,b+count,b+count,a+1+count,b+1+count);
    }
    const border=[];for(let y=0;y<=ny;y++)border.push(y*(nx+1));for(let x=1;x<=nx;x++)border.push(ny*(nx+1)+x);for(let y=ny-1;y>=0;y--)border.push(y*(nx+1)+nx);for(let x=nx-1;x>0;x--)border.push(x);
    for(let j=0;j<border.length;j++){const a=border[j],b=border[(j+1)%border.length];ix.push(a,a+count,b,b,a+count,b+count);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
    add('Draped cloth end '+i,g,cloth,pivot);
  }
  // Shrink only the articulated head; eyes and bill follow the same proportion.
  head.scale.setScalar(.94);
  // Requested silhouette refinement: compress the complete character left/right.
  root.scale.x=.80;
  root.updateMatrixWorld(true);
  // Standard clip tracks preserve the new motion when exported to GLB.
  function makeClip(mode,duration){
    const tracks=[],times=Array.from({length:97},(_,i)=>i/96*duration),TAU=Math.PI*2;
    const walk=mode==='Waddle',wave=mode==='Wave',bump=mode==='Bump';
    // Bump: lean back to wind up (W), then throw the belly and head forward (S).
    const S=p=>Math.pow(Math.max(0,Math.sin(p)),2),Wd=p=>Math.pow(Math.max(0,-Math.sin(p)),2);
    const vectors=(node,prop,fn)=>tracks.push(new T.VectorKeyframeTrack(node.name+'.'+prop,times,times.flatMap(t=>fn(t/duration*TAU,t))));
    const rotation=(node,fn)=>{const values=[];times.forEach(t=>{const q=new T.Quaternion().setFromEuler(new T.Euler(...fn(t/duration*TAU,t)));values.push(q.x,q.y,q.z,q.w);});tracks.push(new T.QuaternionKeyframeTrack(node.name+'.quaternion',times,values));};
    // Shift the torso over the planted foot; feet remain outside this rolling rig.
    // The broad silhouette reads at runner distance without making the whole bird hop.
    vectors(rig,'position',p=>bump?[0,.05*S(p),.24*S(p)-.08*Wd(p)]:[walk?.10*Math.sin(p):0,walk?.030-.025*Math.cos(p*2):.007*Math.sin(p),0]);
    vectors(rig,'scale',p=>{const sy=bump?1-.06*S(p)+.035*Wd(p):walk?1-.012*Math.cos(p*2):1+.006*Math.sin(p);return[1/Math.sqrt(sy),sy,1/Math.sqrt(sy)];});
    rotation(rig,p=>bump?[.34*S(p)-.16*Wd(p),0,.035*Math.sin(p)]:[walk?.035:0,walk?.028*Math.sin(p):0,walk?-.170*Math.sin(p):wave?-.035:.008*Math.sin(p)]);
    rotation(head,p=>bump?[.26*S(p)-.12*Wd(p),0,0]:[walk?.025*Math.sin(p*2-.5):-.018+.018*Math.sin(p),walk?-.045*Math.sin(p-.3):.10*Math.sin(p),walk?.040*Math.sin(p-.3):wave?-.10:.045+.025*Math.sin(p-.6)]);
    shoulders.forEach((w,i)=>{
      const s=i?1:-1;
      rotation(w,p=>bump?[.35*Wd(p)-.55*S(p),0,s*(.20+1.05*Wd(p)+.45*S(p))]:[walk?.18*Math.sin(p+i*Math.PI-.45):.03*Math.sin(p),0,wave&&i===1?1.85+.10*Math.sin(p*3):s*(.13+(walk?.060*Math.cos(p*2):.025*Math.sin(p)))]);
      rotation(tips[i],p=>bump?[-.2*S(p),0,s*.3*Wd(p)]:[walk?.09*Math.sin(p+i*Math.PI-.8):0,0,wave&&i===1?.30*Math.sin(p*3-.4):s*.08*Math.sin(p-.6)]);
    });
    feet.forEach((f,i)=>{const s=i?1:-1;
      vectors(f,'position',p=>{const q=p+i*Math.PI;return[s*.285,.072+(walk?.145*Math.pow(Math.max(0,Math.sin(q)),2):0),.12+(walk?-.17*Math.cos(q):0)];});
      rotation(f,p=>[walk?.20*Math.sin(p+i*Math.PI):0,s*.17,0]);
    });
    scarfTails.forEach((s,i)=>rotation(s,p=>[(walk?.085:bump?.11:.012)*Math.sin(p-1.0-i*.30),.018*Math.sin(p-.5),(i?.22:-.12)+(walk?.040:.025)*Math.sin(p-.9-i*.20)]));
    // Blinks are part of the exported idle/wave animation as well.
    lids.forEach((lid,i)=>vectors(lid,'scale',(p,t)=>{
      const centers=walk||bump?[]:[duration*.36,duration*.84];let y=1;
      centers.forEach(c=>{const d=Math.abs(t-c);if(d<.10)y=Math.min(y,.06+.94*Math.pow(d/.10,2));});
      return[1,y,1];
    }));
    return new T.AnimationClip(mode,duration,tracks);
  }
  const clips=[makeClip('Idle',5.6),makeClip('Waddle',1.12),makeClip('Wave',2.8),makeClip('Bump',.64)];
  const mixer=new T.AnimationMixer(root),actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)]));let active=actions.Idle;active.play();
  function update(dt,mode='Idle'){
    const action=actions[mode]||actions.Idle;
    if(action!==active){action.reset().play();action.crossFadeFrom(active,.28,false);active=action;}
    mixer.update(dt);
  }
  function stats(){let triangles=0,meshes=0;const mats=new Set();root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;mats.add(o.material);}});return{triangles,meshes,materials:mats.size};}
  root.userData={version:2,title:'Soft Navy Penguin',forward:'+Z',height:2.1212,headScale:.94,widthScale:.80};
  return{root,rig,head,scarf,update,clips,mixer,stats};
};
})(typeof window!=='undefined'?window:globalThis);
