/* Crowd Runner growth outfits. Three.js r149. Load penguin-soft.js first.
 * Original procedural meshes; tier thresholds and scales follow js/crowd.js.
 * +Y up, +Z forward. Set growthScale:false to inspect outfits at equal size.
 */
(function(scope){
'use strict';
const TIERS=[
  {id:0,name:'꼬마 펭귄',value:1,scale:1,outfit:'목도리'},
  {id:1,name:'털모자 펭귄',value:10,scale:1.75,outfit:'목도리 · 니트 모자'},
  {id:2,name:'왕관 대장',value:100,scale:2.9,outfit:'목도리 · 왕관'},
  {id:3,name:'망토 황제',value:1000,scale:4.6,outfit:'목도리 · 왕관 · 망토'}
];
scope.PENGUIN_TIERS=TIERS;
scope.createCrowdPenguin=function(T,options={}){
  const tier=T.MathUtils.clamp(Math.floor(options.tier||0),0,3),info=TIERS[tier],high=options.detail!=='low';
  const model=scope.createSoftPenguin(T,{detail:options.detail,scarf:true});
  const {root,rig,head}=model;model.mixer.stopAllAction();model.mixer.uncacheRoot(root);
  const clothes=new T.Group();clothes.name='Growth_Headwear';if(tier>0)head.add(clothes);
  function material(name,color,roughness=1,metalness=0){const m=new T.MeshStandardMaterial({color,roughness,metalness});m.name=name;return m;}
  function mesh(name,g,m,parent=clothes){const o=new T.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function egg(name,p,s,m,parent=clothes){const g=new T.SphereGeometry(1,high?28:16,high?20:12);g.scale(...s);const o=mesh(name,g,m,parent);o.position.set(...p);return o;}
  function surface(n,m,fn,flip=false){
    const p=[],uv=[],ix=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){p.push(...fn(i/n,j/m));uv.push(i/n,j/m);}
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+n+1;if(flip)ix.push(a,b,a+1,b,b+1,a+1);else ix.push(a,a+1,b,b,a+1,b+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
  }
  function seam(g,n,m){const a=g.attributes.normal;for(let j=0;j<=m;j++){const i=j*(n+1),k=i+n,v=new T.Vector3().fromBufferAttribute(a,i).add(new T.Vector3().fromBufferAttribute(a,k)).normalize();a.setXYZ(i,...v.toArray());a.setXYZ(k,...v.toArray());}}
  function cord(name,points,r,mat,parent=clothes,closed=false){const c=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed);return mesh(name,new T.TubeGeometry(c,high?Math.max(40,points.length*3):Math.max(20,points.length),r,high?6:4,closed),mat,parent);}
  function textile(kind){
    const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
    if(kind==='knit'){
      x.fillStyle='#b67455';x.fillRect(0,0,256,256);x.lineCap='round';
      for(let y=-16;y<272;y+=32)for(let col=-1;col<9;col++){
        const px=col*32;
        x.strokeStyle='#a56349';x.lineWidth=9;x.beginPath();x.moveTo(px+3,y);x.quadraticCurveTo(px+6,y+19,px+16,y+28);x.quadraticCurveTo(px+25,y+19,px+29,y);x.stroke();
        x.strokeStyle='#c58a66';x.lineWidth=4;x.beginPath();x.moveTo(px+6,y+2);x.quadraticCurveTo(px+8,y+18,px+16,y+26);x.moveTo(px+26,y+2);x.quadraticCurveTo(px+24,y+18,px+17,y+26);x.stroke();
      }
    }else{
      const d=x.createImageData(256,256);for(let y=0;y<256;y++)for(let u=0;u<256;u++){const i=(y*256+u)*4,v=240+4*Math.sin(u*Math.PI/2)+4*Math.sin(y*Math.PI/2)+2*Math.sin(u*13+y*7);d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}x.putImageData(d,0,0);
    }
    const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;return t;
  }
  if(tier===1){
    const knit=material('Warm rust knitted wool','#ffffff');knit.map=textile('knit');
    const rib=material('Folded rib knit','#b77859');rib.map=textile('weave');
    const pomMat=material('Soft wool pompom','#bd8060');pomMat.map=rib.map;
    const n=high?128:64,m=high?32:20;
    const dome=surface(n,m,(u,v)=>{
      const a=u*Math.PI*2,r=Math.cos(v*Math.PI/2),fold=.004*Math.sin(24*a+v*3)*Math.sin(Math.PI*v);
      return[Math.sin(a)*(.645*r+fold)-.115*v*v,.755+.56*v-.018*Math.sin(a)*(1-v),Math.cos(a)*(.535*r+fold)-.055*v*v];
    });seam(dome,n,m);const uv=dome.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*6,uv.getY(i)*2.5);
    mesh('Slouched knitted beanie',dome,knit);
    const rim=surface(n,high?24:12,(u,v)=>{
      const a=u*Math.PI*2,b=v*Math.PI*2,rr=.022*Math.cos(b)+.0025*Math.cos(64*a)*(1+.3*Math.cos(b));
      return[Math.sin(a)*(.646+rr),.755+.079*Math.sin(b)-.018*Math.sin(a),Math.cos(a)*(.536+rr)];
    });seam(rim,n,high?24:12);mesh('Turned soft ribbed brim',rim,rib);
    const pom=egg('Small wool pompom',[-.116,1.345,-.056],[.157,.155,.15],pomMat);
    const p=pom.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),f=1+.025*Math.sin(x*93)*Math.sin(y*83)*Math.sin(z*101);p.setXYZ(i,x*f,y*f,z*f);}pom.geometry.computeVertexNormals();
    const tagMat=material('Oatmeal woven tab','#e6d5b7');
    const tag=egg('Tiny folded fabric tab',[.46,.742,.39],[.052,.052,.013],tagMat);tag.rotation.y=.72;
  }
  const gold=material('Warm satin gold','#d7ac5c',.38,.62);
  if(tier>=2){
    const n=high?120:60,base=.805;
    const top=a=>base+.142+.177*Math.pow(.5+.5*Math.cos(5*a),2);
    const crown=surface(n,high?12:6,(u,v)=>{
      const a=u*Math.PI*2,y=base+(top(a)-base)*v;return[Math.sin(a)*(.494+.028*v),y,Math.cos(a)*(.412+.024*v)];
    });seam(crown,n,high?12:6);mesh('Five rounded crown points',crown,gold);
    const inner=surface(n,high?12:6,(u,v)=>{const a=u*Math.PI*2;return[Math.sin(a)*(.461+.028*v),base+(top(a)-base)*v,Math.cos(a)*(.379+.024*v)];},true);seam(inner,n,high?12:6);mesh('Crown inner wall',inner,gold);
    const topEdge=surface(n,2,(u,v)=>{const a=u*Math.PI*2;return[Math.sin(a)*(.489+.033*v),top(a),Math.cos(a)*(.403+.033*v)];},true);mesh('Rounded crown rim',topEdge,gold);
    const bottom=surface(n,1,(u,v)=>{const a=u*Math.PI*2;return[Math.sin(a)*(.461+.033*v),base,Math.cos(a)*(.379+.033*v)];});mesh('Crown lower edge',bottom,gold);
    const rimPoints=Array.from({length:60},(_,i)=>{const a=i/60*Math.PI*2;return[Math.sin(a)*.507,top(a),Math.cos(a)*.421];});cord('Polished softened crown edge',rimPoints,.009,gold,clothes,true);
    const bandPoints=Array.from({length:48},(_,i)=>{const a=i/48*Math.PI*2;return[Math.sin(a)*.502,base+.028,Math.cos(a)*.419];});cord('Crown lower piping',bandPoints,.012,gold,clothes,true);
    const ruby=material('Muted berry cabochons','#a34250',.27,.12);
    for(let i=0;i<5;i++){
      const a=i/5*Math.PI*2,bezel=egg('Gold gem setting '+i,[Math.sin(a)*.509,base+.080,Math.cos(a)*.427],[.057,.059,.016],gold);bezel.rotation.y=a;
      const gem=egg('Rounded berry jewel '+i,[Math.sin(a)*.519,base+.080,Math.cos(a)*.437],[.041,.044,.016],ruby);gem.rotation.y=a;
    }
  }
  const capeBones=[];
  if(tier===3){
    const capeMat=material('Soft cranberry cape','#a44755');capeMat.map=textile('weave');
    const nx=high?56:28,ny=high?44:24,count=(nx+1)*(ny+1),ps=[],uv=[],ix=[],si=[],sw=[];
    function capePoint(u,v,inside=false){
      // Open sides give each flipper its own motion envelope in front of the cloth.
      const edge=1.92+.08*Math.sin(Math.PI*v),a=edge+(Math.PI*2-2*edge)*u;
      const pleat=(.010+.033*v)*Math.cos(8*Math.PI*u+.5*v)*Math.sin(Math.PI*u);
      const rx=.69+.20*Math.sin(Math.PI*v*.85)+pleat,rz=.58+.32*Math.sin(Math.PI*v*.52)+pleat;
      return[Math.sin(a)*(rx-(inside?.012:0)),-1.035*v+.025*Math.cos(u*Math.PI*2)*v*v,Math.cos(a)*(rz-(inside?.012:0))-.018*v];
    }
    for(let layer=0;layer<2;layer++)for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const u=i/nx,v=j/ny;ps.push(...capePoint(u,v,!!layer));uv.push(u*2,v*1.4);
      const blend=T.MathUtils.smoothstep(v,v<.48?0:.48,v<.48?.48:1),a=v<.48?0:1,b=v<.48?1:2;
      si.push(blend<1?a:0,blend>0?b:0,0,0);sw.push(1-blend,blend,0,0);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;ix.push(a,b,a+1,b,b+1,a+1,a+count,a+1+count,b+count,b+count,a+1+count,b+1+count);}
    const border=[];for(let j=0;j<=ny;j++)border.push(j*(nx+1));for(let i=1;i<=nx;i++)border.push(ny*(nx+1)+i);for(let j=ny-1;j>=0;j--)border.push(j*(nx+1)+nx);for(let i=nx-1;i>0;i--)border.push(i);
    for(let i=0;i<border.length;i++){const a=border[i],b=border[(i+1)%border.length];ix.push(a,a+count,b,b,a+count,b+count);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));g.setIndex(ix);g.computeVertexNormals();
    const cape=new T.SkinnedMesh(g,capeMat);cape.name='Growth flowing cape';cape.position.y=1.31;cape.castShadow=true;cape.receiveShadow=true;rig.add(cape);
    for(let i=0;i<3;i++){const b=new T.Bone();b.name='Growth_Cape_'+i;b.position.y=i?-.46:0;capeBones.push(b);if(i)capeBones[i-1].add(b);else cape.add(b);}
    const skeleton=new T.Skeleton(capeBones);root.updateMatrixWorld(true);cape.bind(skeleton);
    // A narrow fabric binding follows the same three bones as the cape.
    const trimMat=material('Oatmeal cape binding','#dcccac');trimMat.map=capeMat.map;
    const samples=[];for(let i=0;i<=24;i++)samples.push([0,i/24]);for(let i=1;i<=56;i++)samples.push([i/56,1]);for(let i=23;i>=0;i--)samples.push([1,i/24]);
    const path=new T.CatmullRomCurve3(samples.map(([u,v])=>new T.Vector3(...capePoint(u,v))));
    const tg=new T.TubeGeometry(path,high?180:90,.014,high?6:4,false),ti=[],tw=[],tp=tg.attributes.position;
    for(let i=0;i<tp.count;i++){const v=T.MathUtils.clamp(-tp.getY(i)/1.035,0,1),b=T.MathUtils.smoothstep(v,v<.48?0:.48,v<.48?.48:1),a=v<.48?0:1;ti.push(b<1?a:0,b>0?a+1:0,0,0);tw.push(1-b,b,0,0);}
    tg.setAttribute('skinIndex',new T.Uint16BufferAttribute(ti,4));tg.setAttribute('skinWeight',new T.Float32BufferAttribute(tw,4));const trim=new T.SkinnedMesh(tg,trimMat);trim.name='Growth flexible cape binding';trim.position.copy(cape.position);rig.add(trim);trim.bind(skeleton);trim.castShadow=true;
    // Two soft shoulder gathers disappear beneath the established scarf.
    for(const s of [-1,1]){const o=egg('Cape shoulder gather '+s,[s*.61,1.29,-.24],[.065,.045,.065],capeMat,rig);o.rotation.y=-s*.45;}
  }
  const clips=model.clips.map(c=>c.clone());
  for(const c of clips){
    const times=Array.from({length:97},(_,i)=>i/96*c.duration),walk=c.name==='Waddle'||c.name==='Bump';
    capeBones.forEach((bone,i)=>{
      const values=[];for(const t of times){const p=t/c.duration*Math.PI*2,q=new T.Quaternion().setFromEuler(new T.Euler((i===0?.018:0)+(walk?.060:.012)*Math.sin(p-.65*i),0,(walk?.045:.009)*Math.sin(p-.5*i)));values.push(q.x,q.y,q.z,q.w);}
      c.tracks.push(new T.QuaternionKeyframeTrack(bone.name+'.quaternion',times,values));
    });
  }
  const growthScale=options.growthScale===false?1:info.scale;root.scale.set(.80*growthScale,growthScale,growthScale);
  root.name='Penguin_Tier_'+tier;root.userData={...root.userData,version:3,tier,representedCount:info.value,tierScale:info.scale,growthScaleApplied:options.growthScale!==false,outfit:info.outfit};
  root.updateMatrixWorld(true);
  const mixer=new T.AnimationMixer(root),actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)]));let active=actions.Idle;active.play();
  function update(dt,mode='Idle'){const next=actions[mode]||actions.Idle;if(next!==active){next.reset().play();next.crossFadeFrom(active,.28,false);active=next;}mixer.update(dt);}
  return{...model,root,headwear:clothes,capeBones,tier,info,clips,mixer,update};
};
})(typeof window!=='undefined'?window:globalThis);
