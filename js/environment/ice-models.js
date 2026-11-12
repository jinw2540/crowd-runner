/* Crowd Runner / Soft Ice environment kit.
 * Original parametric meshes, Three.js r149. +Y up; snow surface at Y=0.
 * Road: 10 units wide. Floes: rounded and fractured silhouettes, with snow caps.
 * Materials are opaque for predictable mobile rendering; no external textures.
 */
(function(scope){
'use strict';
function kit(T,options={}){
  const high=options.detail!=='low',N=high?160:80;
  const color=hex=>new T.Color(hex);
  const ice=new T.MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,roughness:.36,metalness:0,clearcoat:.24,clearcoatRoughness:.38});
  ice.name='Satin blue ice with frosted depth';
  const snow=new T.MeshStandardMaterial({color:'#f3f7ef',roughness:.96,metalness:0});snow.name='Soft matte snow';
  const seamMat=new T.MeshStandardMaterial({color:'#a7cbd2',roughness:.90});seamMat.name='Pale blue hairline in snow';
  const upper=color('#b2e1e5'),middle=color('#71bdcf'),lower=color('#3e8ca9');
  const smooth=T.MathUtils.smoothstep;
  function mesh(name,g,mat,parent){const m=new T.Mesh(g,mat);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function roundedRect(w,l,r,seed){
    const x=w/2,z=l/2,s=new T.Shape();
    s.moveTo(-x+r,-z);s.lineTo(x-r,-z);s.quadraticCurveTo(x,-z,x,-z+r);
    s.lineTo(x,z-r);s.quadraticCurveTo(x,z,x-r,z);s.lineTo(-x+r,z);s.quadraticCurveTo(-x,z,-x,z-r);
    s.lineTo(-x,-z+r);s.quadraticCurveTo(-x,-z,-x+r,-z);
    return s.getSpacedPoints(N).slice(0,-1).map(p=>{
      // Keep the ends aligned so road sections can meet without holes in the lane.
      const q=Math.pow(Math.abs(p.x)/x,4)*Math.sin(Math.PI*(p.y/z+1)/2);
      return new T.Vector2(p.x*(1+q*(.040*Math.sin(p.y*.83+seed)+.018*Math.cos(p.y*1.71+seed*.4))),p.y);
    });
  }
  function organic(w,l,seed){
    const knots=[];
    for(let i=0;i<14;i++){
      const a=i/14*Math.PI*2,r=1+.055*Math.sin(3*a+seed)+.038*Math.cos(5*a-seed*.7)+.024*Math.sin(7*a+seed*.9);
      knots.push(new T.Vector3(Math.cos(a)*w*.5*r,0,Math.sin(a)*l*.5*r));
    }
    const path=new T.CatmullRomCurve3(knots,true,'catmullrom',.45);
    return Array.from({length:N},(_,i)=>{const p=path.getPoint(i/N);return new T.Vector2(p.x,p.z);});
  }
  function ringMesh(outline,profile,seed,mat,kind,parent,name){
    const ps=[],cs=[],indices=[],n=outline.length;
    for(let j=0;j<profile.length;j++){
      const [radius,y]=profile[j];
      for(let i=0;i<=n;i++){
        const a=i/n*Math.PI*2,p=outline[i%n];
        const vary=kind==='snow'&&y>=0?0:(.010*Math.sin(a*3+seed)+.007*Math.cos(a*7-seed))*Math.min(1,radius*4);
        ps.push(p.x*radius,y+vary,p.y*radius);
        if(kind==='ice'){
          const v=j/(profile.length-1),c=upper.clone().lerp(middle,smooth(v,0,.48));
          c.lerp(lower,smooth(v,.35,1)*.78);
          // Broad milky inclusions remain subtle, without black outlines or sharp facets.
          const frost=.07*Math.pow(.5+.5*Math.sin(a*5.0+v*3.4+seed),6)+.026*Math.sin(a*11-v*4);
          c.lerp(upper,Math.max(0,frost));cs.push(c.r,c.g,c.b);
        }
      }
    }
    // The outline is counter-clockwise. Ring order goes from the upper face downward.
    for(let j=0;j<profile.length-1;j++)for(let i=0;i<n;i++){
      const a=j*(n+1)+i,b=a+n+1;
      if(profile[j][0]>0)indices.push(a,a+1,b);
      if(profile[j+1][0]>0)indices.push(b,a+1,b+1);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));
    if(cs.length)g.setAttribute('color',new T.Float32BufferAttribute(cs,3));g.setIndex(indices);g.computeVertexNormals();
    const norm=g.attributes.normal;
    for(let j=0;j<profile.length;j++){
      const i=j*(n+1),k=i+n,v=new T.Vector3().fromBufferAttribute(norm,i).add(new T.Vector3().fromBufferAttribute(norm,k)).normalize();
      norm.setXYZ(i,...v.toArray());norm.setXYZ(k,...v.toArray());
      if(profile[j][0]===0)for(let i=0;i<=n;i++)norm.setXYZ(j*(n+1)+i,0,j===0?1:-1,0);
    }
    return mesh(name,g,mat,parent);
  }
  function slab(parent,outline,h,seed,prefix,flat=true){
    const bodyProfile=[[0,0],[.68,0],[.985,0],[.997,.065],[1.007,.18],
      [1.012,.48],[.991,.72],[.94,.88],[.82,.96],[.58,1],[0,1]]
      .map(([r,v])=>[r,-.125-(h-.125)*v]);
    const core=ringMesh(outline,bodyProfile,seed,ice,'ice',parent,prefix+' rounded ice body');
    const snowProfile=[
      [0,0],[.42,0],[.72,0],[.87,0],[.952,-.009],[.994,-.045],[1.008,-.095],
      [1.002,-.146],[.98,-.181],[.923,-.196],[.7,-.192],[0,-.192]
    ];
    const cap=ringMesh(outline,snowProfile,seed,snow,'snow',parent,prefix+' continuous snow cap');
    if(!flat){
      const p=cap.geometry.attributes.position;
      for(let i=0;i<p.count;i++)if(p.getY(i)>=-.009){
        const x=p.getX(i),z=p.getZ(i),r=Math.hypot(x,z);p.setY(i,p.getY(i)+.012*Math.sin(x*1.3+seed)*Math.cos(z*1.5)*Math.min(1,r));
      }
      cap.geometry.computeVertexNormals();
    }
    return{core,cap};
  }
  function ribbon(parent,name,points,width=.014){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0],.003,p[1]))),ps=[],ix=[],up=new T.Vector3(0,1,0);
    const count=high?56:28;
    for(let i=0;i<=count;i++){
      const v=i/count,p=curve.getPoint(v),normal=new T.Vector3().crossVectors(curve.getTangent(v),up).normalize();
      const r=width*Math.pow(Math.sin(Math.PI*v),.45);
      for(const side of [-1,1])ps.push(p.x+normal.x*r*side,p.y,p.z+normal.z*r*side);
      if(i<count){const a=i*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setIndex(ix);g.computeVertexNormals();
    for(let i=0;i<g.attributes.normal.count;i++)g.attributes.normal.setXYZ(i,0,1,0);
    return mesh(name,g,seamMat,parent);
  }
  function stats(root){let triangles=0,meshes=0;root.traverseVisible(o=>{if(o.isMesh){meshes++;triangles+=o.geometry.index.count/3;}});return{meshes,triangles};}
  return{T,N,ice,snow,roundedRect,organic,slab,ribbon,stats};
}

scope.createIceRoad=function(T,options={}){
  const k=kit(T,options),width=options.width||10,length=options.length||12,thickness=options.thickness||1.65,seed=options.seed||3.2;
  const root=new T.Group();root.name='Soft_Ice_Road';
  const outline=k.roundedRect(width,length,.84,seed);k.slab(root,outline,thickness,seed,'Road',true);
  // Shallow pale seams suggest joined plates while the walking surface stays flat.
  if(length>=14){
    for(const z of [-length*.21,length*.22])k.ribbon(root,'Soft joined ice seam',[
      [-width*.42,z-.05],[-width*.23,z+.13],[-width*.05,z-.10],[width*.13,z+.07],[width*.34,z-.06]
    ],.027);
  }
  k.ribbon(root,'Short frost fracture',[[width*.28,length*.23],[width*.20,length*.16],[width*.23,length*.09],[width*.14,length*.04]],.010);
  k.ribbon(root,'Fine frost branch',[[width*.20,length*.16],[width*.12,length*.17],[width*.07,length*.12]],.007);
  // Low rounded snow ridges sit outside the playable lane, never across it.
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const group=new T.Group();group.name='Rounded snow shoulder '+side+' '+i;
      const z=(i-1)*length*.29,x=side*width*.465;group.position.set(x,.045,z);root.add(group);
    const p=k.organic(.55,length*.14,seed+i+side*2).filter((_,i)=>i%4===0);
    const ridge=k.slab(group,p,.22,seed+i,'Snow shoulder',false);
    ridge.core.visible=false;
    const pos=ridge.cap.geometry.attributes.position;
    for(let j=0;j<pos.count;j++)if(pos.getY(j)>-.02){const r=Math.min(1,Math.hypot(pos.getX(j)/.30,pos.getZ(j)/(length*.075)));pos.setY(j,pos.getY(j)+.09*(1-r*r));}
    ridge.cap.geometry.computeVertexNormals();
  }
  root.userData={version:1,kind:'road',surfaceY:0,width,length,thickness,forward:'-Z',playableWidth:width*.84};
  return{root,outline,info:root.userData,clips:[],stats:()=>k.stats(root)};
};

scope.createIceFloe=function(T,options={}){
  const variant=['small','snowy','large','spiky'].includes(options.variant)?options.variant:'snowy';
  const definitions={small:{width:3.5,length:2.6,thickness:.72,seed:1.8},snowy:{width:5.0,length:3.8,thickness:1.02,seed:4.6},large:{width:6.6,length:5.4,thickness:1.4,seed:7.2},spiky:{width:6.5,length:5.0,thickness:1.20,seed:9.4}};
  const d={...definitions[variant],...options},k=kit(T,options),root=new T.Group();root.name='Soft_Ice_Floe_'+variant;
  const outline=variant==='spiky'?[[-.98,-.20],[-.72,-.72],[-.18,-.96],[.46,-.86],[.87,-.46],[1.04,.05],[.75,.59],[.25,.90],[-.34,.82],[-.91,.45]].map(([x,z])=>new T.Vector2(x*d.width/2,z*d.length/2)):k.organic(d.width,d.length,d.seed);
  const base=k.slab(root,outline,d.thickness,d.seed,'Floe',false);
  if(variant==='spiky'){
    // Broad broken ice plates: irregular ridges and sloping fracture faces, not cones.
    const facetMat=k.ice.clone();facetMat.name='Blue fractured ice faces';facetMat.roughness=.30;facetMat.clearcoat=.30;facetMat.flatShading=true;
    const bottom=new T.Color('#4f9fb9'),tip=new T.Color('#c5edf0'),faceTint=[.07,.03,.00,.09,.02,.12,.04,.15,.06];
    function shard(name,{x,z,w,depth,h,angle}){
      const group=new T.Group();group.name=name;group.position.set(x,0,z);group.rotation.y=angle;root.add(group);
      const vertices=[[-.55,-.16,.28],[.55,-.14,.25],[.48,-.16,-.35],[-.48,-.15,-.38],[-.46,.45,.28],[.32,.38,.20],[.12,.78,-.20],[-.40,.64,-.30],[.08,1,-.12],[-.16,.88,.20]].map(([vx,vy,vz])=>new T.Vector3(vx*w,vy<0?vy:vy*h,vz*depth));
      const faces=[[0,3,2,1],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,9],[5,6,8,9],[6,7,8],[7,4,9,8]];
      const center=vertices.reduce((p,v)=>p.add(v),new T.Vector3()).divideScalar(vertices.length);
      const ps=[],cs=[],snowPoints=[];
      faces.forEach((face,f)=>{
        for(let i=1;i<face.length-1;i++){
          const tri=[vertices[face[0]],vertices[face[i]],vertices[face[i+1]]].map(v=>v.clone());
          const middle=tri.reduce((p,v)=>p.add(v),new T.Vector3()).divideScalar(3);
          let normal=new T.Vector3().subVectors(tri[1],tri[0]).cross(new T.Vector3().subVectors(tri[2],tri[0])).normalize();
          if(normal.dot(middle.clone().sub(center))<0){[tri[1],tri[2]]=[tri[2],tri[1]];normal.negate();}
          tri.forEach(v=>{
            ps.push(v.x,v.y,v.z);
            const frost=T.MathUtils.smoothstep(v.y/h,.16,1)*.76+faceTint[f];
            const c=bottom.clone().lerp(tip,Math.min(.96,frost));cs.push(c.r,c.g,c.b);
          });
          if(normal.y>.16&&middle.y>h*.52){
            // Snow clings to upward faces without rounding off the pointed silhouette.
            for(const v of tri){const p=v.clone().addScaledVector(normal,.009);snowPoints.push(p.x,p.y,p.z);}
          }
        }
      });
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('color',new T.Float32BufferAttribute(cs,3));g.setIndex(Array.from({length:ps.length/3},(_,i)=>i));g.computeVertexNormals();
      const m=new T.Mesh(g,facetMat);m.name=name+' solid ice';m.castShadow=m.receiveShadow=true;group.add(m);
      if(snowPoints.length){const s=new T.BufferGeometry();s.setAttribute('position',new T.Float32BufferAttribute(snowPoints,3));s.setIndex(Array.from({length:snowPoints.length/3},(_,i)=>i));s.computeVertexNormals();const snow=new T.Mesh(s,k.snow);snow.name=name+' windblown snow';snow.castShadow=snow.receiveShadow=true;group.add(snow);}
    }
    [
      {x:-.24,z:-.50,w:2.30,depth:2.05,h:3.05,angle:-.13},
      {x:-1.47,z:.18,w:1.65,depth:1.65,h:1.84,angle:-.64},
      {x:1.15,z:-.22,w:1.82,depth:1.72,h:2.32,angle:.66},
      {x:.50,z:.94,w:1.22,depth:1.32,h:1.10,angle:.20},
      {x:-1.55,z:1.07,w:.85,depth:.95,h:.57,angle:-.40}
    ].forEach((s,i)=>shard('Jagged ice plate '+i,s));
    k.ribbon(root,'Fracture across the floe',[[-2.15,.92],[-1.72,.52],[-1.44,.59],[-1.10,.15]],.022);
  }
  if(variant==='snowy'||variant==='large'){
    const shelves=variant==='large'?[
      {x:-1.34,z:-.85,w:2.08,l:1.71,h:.76,y:.59,rot:-.23},
      {x:.34,z:-1.18,w:1.56,l:1.40,h:1.16,y:.98,rot:.30}
    ]:[{x:-1.05,z:-.56,w:1.38,l:1.05,h:.47,y:.30,rot:-.35}];
    shelves.forEach((s,i)=>{
      const ledge=new T.Group();ledge.name='Snow covered ice shelf '+i;ledge.position.set(s.x,s.y,s.z);ledge.rotation.y=s.rot;root.add(ledge);
      k.slab(ledge,k.roundedRect(s.w,s.l,.42,d.seed+i),s.h,d.seed+i,'Shelf',false);
    });
    k.ribbon(root,'Quiet frost vein',[[d.width*.28,d.length*.18],[d.width*.13,d.length*.09],[d.width*.17,-d.length*.04]],.009);
  }
  const duration=6.8,times=Array.from({length:65},(_,i)=>duration*i/64);
  const bob=new T.VectorKeyframeTrack(root.name+'.position',times,times.flatMap(t=>[0,.025*Math.sin(t/duration*Math.PI*2),0]));
  const rotations=[];for(const t of times){const p=t/duration*Math.PI*2;rotations.push(...new T.Quaternion().setFromEuler(new T.Euler(.009*Math.sin(p),0,.012*Math.sin(p+.6))).toArray());}
  const clip=new T.AnimationClip('Gentle_Float',duration,[bob,new T.QuaternionKeyframeTrack(root.name+'.quaternion',times,rotations)]);
  root.userData={version:1,kind:'floe',variant,surfaceY:0,width:d.width,length:d.length,thickness:d.thickness};
  return{root,outline,info:root.userData,clips:[clip],stats:()=>k.stats(root)};
};
})(typeof window!=='undefined'?window:globalThis);
