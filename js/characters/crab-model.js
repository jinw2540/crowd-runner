/* Crowd Runner / Coral Crab. Original procedural model for Three.js r149.
 * +Y up, +Z forward. Eight articulated walking legs and two pinching claws.
 * Tier values, scale and crown eligibility follow the game's js/crowd.js.
 */
(function(scope){
'use strict';
const TIERS=[
  {id:0,name:'꼬마 게',value:1,scale:1,outfit:'작은 산호색 등딱지 · 둥근 집게'},
  {id:1,name:'큰 집게 게',value:10,scale:1.75,outfit:'도톰한 집게 · 넓은 등딱지'},
  {id:2,name:'왕관 대장 게',value:100,scale:2.9,outfit:'금빛 왕관 · 작은 보석'},
  {id:3,name:'왕관 황제 게',value:1000,scale:4.6,outfit:'높은 왕관 · 진주 장식'}
];
scope.CRAB_TIERS=TIERS;
scope.createCrowdCrab=function(T,options={}){
  const tier=T.MathUtils.clamp(Math.floor(options.tier||0),0,3),info=TIERS[tier],high=options.detail!=='low';
  const root=new T.Group();root.name='Coral_Crab_Tier_'+tier;
  const rig=new T.Group();rig.name='Crab_BodyRig';root.add(rig);
  const material=(name,color,roughness=.88,metalness=0)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness});m.name=name;return m;};
  const coral=material('Deep coral shell','#b84134'),limbMat=material('Deep coral joints','#a53e32');
  const ivory=material('Warm ivory eyes','#fcf5e6',.87),ink=material('Deep navy eyes','#23333e',.6);
  const mouthMat=material('Warm dark zigzag mouth','#603028',1),cheekMat=material('Coral apricot cheeks','#d4775c',.95);
  const fingerMat=material('Warm apricot claw tips','#cf8564',.84);
  function add(name,g,m,parent=rig){const o=new T.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function egg(name,p,s,m,parent=rig,n=high?24:16){const g=new T.SphereGeometry(1,n,Math.round(n*.72));g.scale(...s);const o=add(name,g,m,parent);o.position.set(...p);return o;}
  function surface(n,m,fn,flip=false){
    const ps=[],uv=[],ix=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){ps.push(...fn(i/n,j/m));uv.push(i/n,j/m);}
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+n+1;if(flip)ix.push(a,b,a+1,b,b+1,a+1);else ix.push(a,a+1,b,b,a+1,b+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
  }
  function seam(g,n,m){const norm=g.attributes.normal;for(let j=0;j<=m;j++){const a=j*(n+1),b=a+n,v=new T.Vector3().fromBufferAttribute(norm,a).add(new T.Vector3().fromBufferAttribute(norm,b)).normalize();norm.setXYZ(a,...v.toArray());norm.setXYZ(b,...v.toArray());}}
  function cord(name,points,r,mat,parent=rig,closed=false){return add(name,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed),high?Math.max(20,points.length*3):Math.max(12,points.length),r,high?6:4,closed),mat,parent);}
  // A rounded continuous carapace, with colour softly changing to a pale underside.
  const shellGeo=surface(high?64:36,high?44:26,(u,v)=>{
    const a=u*Math.PI*2,p=v*Math.PI,s=Math.sin(p),c=Math.cos(p);
    const scallop=1+.013*Math.cos(a*8)*Math.pow(s,7);
    return[Math.sin(a)*1.015*s*scallop,.69-.39*c,Math.cos(a)*.675*s*(1+.025*Math.cos(a*2))];
  });seam(shellGeo,high?64:36,high?44:26);
  const shellMat=material('Coral to cream carapace','#ffffff');shellMat.vertexColors=true;
  const colors=[],top=new T.Color('#c24e3e'),side=new T.Color('#b53e32'),belly=new T.Color('#dfaa88');
  const sp=shellGeo.attributes.position;
  for(let i=0;i<sp.count;i++){
    const y=sp.getY(i),x=sp.getX(i),z=sp.getZ(i),c=side.clone().lerp(top,T.MathUtils.smoothstep(y,.68,1.08));
    c.lerp(belly,1-T.MathUtils.smoothstep(y,.37,.58));
    const spots=[[-.40,.0,.055],[.04,-.22,.065],[.39,-.05,.048],[-.16,-.40,.035],[.57,-.25,.030]];
    if(y>.89)for(const [sx,sz,r] of spots){const d=Math.hypot(x-sx,z-sz);if(d<r)c.lerp(new T.Color('#db956f'),.5*(1-T.MathUtils.smoothstep(d,r*.6,r)));}
    colors.push(c.r,c.g,c.b);
  }
  shellGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));add('Continuous rounded carapace',shellGeo,shellMat);
  // The shell lip is a shallow curve rather than a separate stack of spheres.
  const lipPoints=Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2;return[Math.sin(a)*.923,.525+.008*Math.cos(2*a),Math.cos(a)*.617];});
  cord('Fine carapace edge',lipPoints,.011,limbMat,rig,true);
  // A clear zigzag with softly rounded corners, fitted to the shell surface.
  const mouthPoints=Array.from({length:7},(_,i)=>{
    const x=(i-3)*.060,y=i%2?.619:.665,s=Math.sqrt(1-Math.pow((y-.69)/.39,2));
    const a=Math.asin(x/(1.015*s));
    return new T.Vector3(x,y,.675*Math.cos(a)*s*(1+.025*Math.cos(2*a))+.008);
  });
  const mouthPath=new T.CurvePath();let previous=mouthPoints[0];
  for(let i=1;i<mouthPoints.length-1;i++){
    const p=mouthPoints[i],entry=p.clone().lerp(mouthPoints[i-1],.15),exit=p.clone().lerp(mouthPoints[i+1],.15);
    mouthPath.add(new T.LineCurve3(previous,entry));mouthPath.add(new T.QuadraticBezierCurve3(entry,p,exit));previous=exit;
  }
  mouthPath.add(new T.LineCurve3(previous,mouthPoints[mouthPoints.length-1]));
  add('Rounded zigzag crab mouth',new T.TubeGeometry(mouthPath,high?72:36,.0115,high?8:6,false),mouthMat);
  for(const i of [0,6])egg('Soft zigzag endpoint '+i,mouthPoints[i].toArray(),[.0115,.0115,.0115],mouthMat,rig,12);
  for(const s of [-1,1]){const c=egg('Soft cheek '+s,[s*.39,.71,.643],[.072,.029,.012],cheekMat);c.rotation.y=s*.28;}

  // Smooth tapered tubes are used for stems, limbs and the sculpted claw fingers.
  function organic(points,radius,n=high?16:10,m=high?30:18,depth=1){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),axis=new T.Vector3(0,0,1);
    const g=surface(n,m,(u,v)=>{
      const p=curve.getPoint(v),t=curve.getTangent(v).normalize(),a=u*Math.PI*2;
      const nrm=new T.Vector3().crossVectors(axis,t).normalize(),b=new T.Vector3().crossVectors(t,nrm).normalize(),r=radius(v);
      p.addScaledVector(nrm,Math.cos(a)*r).addScaledVector(b,Math.sin(a)*r*depth);return p.toArray();
    });seam(g,n,m);return g;
  }
  const eyeStems=[],lids=[];
  for(const s of [-1,1]){
    const stem=new T.Group();stem.name=s<0?'Crab_EyeStem_L':'Crab_EyeStem_R';stem.position.set(s*.32,.94,.285);rig.add(stem);eyeStems.push(stem);
    add('Curved eye stalk '+s,organic([[0,0,0],[s*.012,.13,.045],[s*.025,.25,.10],[s*.03,.34,.125]],v=>.078-.026*v,high?16:10,high?24:16),coral,stem);
    const eye=new T.Group();eye.position.set(s*.03,.35,.13);eye.scale.setScalar(1.10);stem.add(eye);
    egg('Rounded coral eyelid '+s,[0,0,0],[.151,.165,.136],coral,eye);
    const blink=new T.Group();blink.name=s<0?'Crab_Blink_L':'Crab_Blink_R';eye.add(blink);lids.push(blink);
    egg('Ivory eye patch '+s,[0,.005,.126],[.121,.133,.023],ivory,blink);
    egg('Friendly navy pupil '+s,[-s*.009,.003,.150],[.063,.076,.014],ink,blink);
    egg('Tiny eye catchlight '+s,[-.018,.031,.162],[.012,.015,.006],ivory,blink,12);
  }

  // Eight two-bone walking legs. IK clips plant the feet while the shell sways.
  const legs=[],anchors=[[.69,.52,.33],[.80,.52,.11],[.79,.52,-.17],[.67,.52,-.40]],feet=[[1.48,.008,.78],[1.63,.008,.34],[1.64,.008,-.23],[1.50,.008,-.70]];
  function kneeFor(target,L1,L2){
    const d=T.MathUtils.clamp(target.length(),.02,L1+L2-.001),e=target.clone().normalize(),a=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-a*a));
    const bend=new T.Vector3(0,1,0).addScaledVector(e,-e.y).normalize();return e.multiplyScalar(a).addScaledVector(bend,h);
  }
  for(const s of [-1,1])for(let i=0;i<4;i++){
    const anchor=new T.Vector3(s*anchors[i][0],anchors[i][1],anchors[i][2]),foot=new T.Vector3(s*feet[i][0],feet[i][1],feet[i][2]);
    const target=foot.clone().sub(anchor),L1=.52,L2=.65,knee=kneeFor(target,L1,L2);
    const middle=knee.clone().add(target).multiplyScalar(.5);middle.y+=.012;
    const g=organic([[0,0,0],knee.clone().multiplyScalar(.52).toArray(),knee.toArray(),middle.toArray(),target.toArray()],v=>.006+.078*Math.pow(1-v,.72),high?14:10,high?36:22,.82);
    const si=[],sw=[],n=high?14:10,m=high?36:22;
    for(let j=0;j<=m;j++)for(let k=0;k<=n;k++){const w=T.MathUtils.smoothstep(j/m,.39,.61);si.push(0,w>0?1:0,0,0);sw.push(1-w,w,0,0);}
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));
    const mesh=new T.SkinnedMesh(g,limbMat);mesh.name='Crab smooth leg '+s+' '+i;mesh.position.copy(anchor);mesh.castShadow=true;mesh.receiveShadow=true;rig.add(mesh);
    const hip=new T.Bone(),bend=new T.Bone();hip.name='Crab_Hip_'+s+'_'+i;bend.name='Crab_Knee_'+s+'_'+i;bend.position.copy(knee);hip.add(bend);mesh.add(hip);mesh.bind(new T.Skeleton([hip,bend]));
    legs.push({side:s,index:i,anchor,foot,L1,L2,knee,lower:target.clone().sub(knee),hip,bend,mesh});
  }

  // Each claw has a soft palm, one fixed finger and an independently hinged thumb.
  const arms=[],thumbs=[],claws=[];
  const clawScale=[.92,1.04,1.08,1.15][tier];
  for(const s of [-1,1]){
    const shoulder=new T.Group();shoulder.name='Crab_Shoulder_'+s;shoulder.position.set(s*.75,.67,.30);rig.add(shoulder);
    add('Soft upper claw arm '+s,organic([[0,0,0],[s*.16,-.018,.085],[s*.30,-.015,.19]],v=>.105-.023*v),limbMat,shoulder);
    const elbow=new T.Group();elbow.name='Crab_Elbow_'+s;elbow.position.set(s*.30,-.015,.19);shoulder.add(elbow);
    add('Soft lower claw arm '+s,organic([[0,0,0],[s*.12,.10,.08],[s*.27,.26,.14]],v=>.083-.017*v),coral,elbow);
    const hand=new T.Group();hand.name='Crab_Claw_'+s;hand.position.set(s*.27,.26,.14);hand.rotation.set(-.10,-s*.13,-s*.23);hand.scale.setScalar(clawScale*(s===1?1.055:1));elbow.add(hand);claws.push(hand);
    egg('Rounded claw palm '+s,[0,.045,0],[.251,.268,.163],coral,hand,high?32:20);
    add('Curved fixed claw finger '+s,organic([[s*.13,.10,0],[s*.245,.26,0],[s*.20,.45,.005],[s*.055,.565,.014]],v=>.014+.133*Math.pow(1-v,1.15),high?20:12,high?36:20,.91),coral,hand);
    const thumb=new T.Group();thumb.name='Crab_Thumb_'+s;thumb.position.set(-s*.15,.03,.008);thumb.rotation.z=s*.05;hand.add(thumb);thumbs.push(thumb);
    add('Curved movable claw finger '+s,organic([[0,0,0],[-s*.11,.20,0],[-s*.07,.39,.004],[s*.07,.50,.006]],v=>.013+.107*Math.pow(1-v,1.1),high?20:12,high?34:20,.9),coral,thumb);
    // Low-contrast tips help the opening read from the game camera.
    egg('Fixed apricot fingertip '+s,[s*.055,.565,.014],[.018,.022,.017],fingerMat,hand,12);
    egg('Moving apricot fingertip '+s,[s*.07,.50,.006],[.016,.020,.016],fingerMat,thumb,12);
    arms.push({s,shoulder,elbow});
  }

  const crown=new T.Group();crown.name='Crab_Crown';
  if(tier>=2){
    rig.add(crown);crown.position.set(0,1.04,-.18);
    const royal=tier===3,rx=royal?.41:.35,rz=royal?.32:.29,n=high?100:60;
    const gold=material('Warm satin gold crown','#d7ac5c',.38,.62),gem=material('Deep sea teal gems','#428482',.28,.16);
    const top=a=>.13+(royal?.24:.17)*Math.pow(.5+.5*Math.cos(5*a),2);
    const wall=(inside)=>surface(n,8,(u,v)=>{const a=u*Math.PI*2,r=inside?-.026:0;return[Math.sin(a)*(rx+.023*v+r),v*top(a),Math.cos(a)*(rz+.018*v+r)];},inside);
    const outer=wall(false),inner=wall(true);seam(outer,n,8);seam(inner,n,8);add('Five rounded crown points',outer,gold,crown);add('Inner crown wall',inner,gold,crown);
    add('Crown upper edge',surface(n,1,(u,v)=>{const a=u*Math.PI*2;return[Math.sin(a)*(rx-.003+.026*v),top(a),Math.cos(a)*(rz-.008+.026*v)];},true),gold,crown);
    add('Crown lower edge',surface(n,1,(u,v)=>{const a=u*Math.PI*2;return[Math.sin(a)*(rx-.026+.026*v),0,Math.cos(a)*(rz-.026+.026*v)];}),gold,crown);
    const topPts=Array.from({length:60},(_,i)=>{const a=i/60*Math.PI*2;return[Math.sin(a)*(rx+.010),top(a),Math.cos(a)*(rz+.005)];});cord('Soft crown rim',topPts,.009,gold,crown,true);
    const basePts=Array.from({length:48},(_,i)=>{const a=i/48*Math.PI*2;return[Math.sin(a)*(rx+.004),.026,Math.cos(a)*(rz+.003)];});cord('Crown base piping',basePts,royal?.016:.011,gold,crown,true);
    for(let i=0;i<5;i++){
      const a=i/5*Math.PI*2;
      const b=egg('Gold bezel '+i,[Math.sin(a)*(rx+.012),.073,Math.cos(a)*(rz+.01)],[.043,.047,.013],gold,crown);b.rotation.y=a;
      const j=egg('Sea glass jewel '+i,[Math.sin(a)*(rx+.023),.073,Math.cos(a)*(rz+.022)],[.030,.034,.012],gem,crown);j.rotation.y=a;
      if(royal)egg('Ivory pearl point '+i,[Math.sin(a)*(rx+.01),top(a)+.012,Math.cos(a)*(rz+.005)],[.026,.027,.026],ivory,crown,16);
    }
  }

  function bodyPose(p,mode){
    const run=mode==='Scuttle',wave=mode==='Wave';
    const position=new T.Vector3(run?.034*Math.sin(p):0,run?.015*(1-Math.cos(p*2)):.006*Math.sin(p),0);
    const quaternion=new T.Quaternion().setFromEuler(new T.Euler(run?.018:0,run?.012*Math.sin(p):.024*Math.sin(p),run?.025*Math.sin(p):wave?.016*Math.sin(p):.006*Math.sin(p)));
    const sy=run?1-.01*Math.cos(p*2):1+.006*Math.sin(p),scale=new T.Vector3(1/Math.sqrt(sy),sy,1/Math.sqrt(sy));
    return{position,quaternion,scale,inverse:new T.Matrix4().compose(position,quaternion,scale).invert()};
  }
  function makeClip(mode,duration){
    const times=Array.from({length:97},(_,i)=>duration*i/96),phases=times.map(t=>t/duration*Math.PI*2),tracks=[],poses=phases.map(p=>bodyPose(p,mode)),run=mode==='Scuttle',wave=mode==='Wave';
    const vector=(node,prop,fn)=>tracks.push(new T.VectorKeyframeTrack(node.name+'.'+prop,times,phases.flatMap((p,i)=>fn(p,i))));
    const quat=(node,fn)=>tracks.push(new T.QuaternionKeyframeTrack(node.name+'.quaternion',times,phases.flatMap((p,i)=>fn(p,i).toArray())));
    const rotation=(node,fn)=>quat(node,(p,i)=>new T.Quaternion().setFromEuler(new T.Euler(...fn(p,i))));
    vector(rig,'position',(_,i)=>poses[i].position.toArray());vector(rig,'scale',(_,i)=>poses[i].scale.toArray());quat(rig,(_,i)=>poses[i].quaternion);
    for(const leg of legs){
      const hipQs=[],kneeQs=[];
      for(let f=0;f<phases.length;f++){
        const p=phases[f]+leg.index*Math.PI+(leg.side<0?Math.PI:0),foot=leg.foot.clone();
        if(run){foot.x+=.13*Math.cos(p);foot.y+=.115*Math.pow(Math.max(0,Math.sin(p)),2);foot.z+=.018*Math.cos(p);}
        const target=foot.applyMatrix4(poses[f].inverse).sub(leg.anchor),knee=kneeFor(target,leg.L1,leg.L2);
        const qh=new T.Quaternion().setFromUnitVectors(leg.knee.clone().normalize(),knee.clone().normalize());
        const ql=new T.Quaternion().setFromUnitVectors(leg.lower.clone().normalize(),target.clone().sub(knee).normalize());
        hipQs.push(qh);kneeQs.push(qh.clone().invert().multiply(ql));
      }
      quat(leg.hip,(_,i)=>hipQs[i]);quat(leg.bend,(_,i)=>kneeQs[i]);
    }
    arms.forEach(({s,shoulder,elbow},i)=>{
      rotation(shoulder,p=>[run?.035*Math.sin(p+i*Math.PI):0,(run?.035:.02)*Math.sin(p+i),s*(wave?.13+.06*Math.sin(p*2+i):run?.035*Math.sin(p+i*Math.PI):.015*Math.sin(p+i))]);
      rotation(elbow,p=>[0,.02*Math.sin(p-.5+i),s*(wave?.12+.07*Math.sin(p*2-.4+i):.025*Math.sin(p-.4+i))]);
      rotation(thumbs[i],p=>[0,0,s*(wave?.06+.24*Math.sin(p*3+i*.6):run?.07+.13*Math.sin(p*2+i):.02+.08*Math.sin(p+i*.8))]);
    });
    eyeStems.forEach((eye,i)=>rotation(eye,p=>[(run?.025:.015)*Math.sin(p-.4+i*.3),.03*Math.sin(p+i*.5),(i?1:-1)*.02*Math.sin(p-.6)]));
    lids.forEach((lid,i)=>vector(lid,'scale',(p,f)=>{
      let sy=1;if(!run)for(const c of [duration*.37,duration*.81]){const d=Math.abs(times[f]-c-i*.012);if(d<.11)sy=Math.min(sy,.06+.94*Math.pow(d/.11,2));}return[1,sy,1];
    }));
    return new T.AnimationClip(mode,duration,tracks);
  }
  const clips=[makeClip('Idle',5.6),makeClip('Scuttle',1.12*(1+tier*.15)),makeClip('Wave',3.2)];
  const growthScale=options.growthScale===false?1:info.scale;root.scale.setScalar(growthScale);root.updateMatrixWorld(true);
  root.userData={version:2,title:'Deep Coral Crab',mouth:'rounded zigzag',forward:'+Z',tier,representedCount:info.value,tierScale:info.scale,growthScaleApplied:options.growthScale!==false,walkingLegs:8,claws:2};
  const mixer=new T.AnimationMixer(root),actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)]));let active=actions.Idle;active.play();
  function update(dt,mode='Idle'){const next=actions[mode]||actions.Idle;if(next!==active){next.reset().play();next.crossFadeFrom(active,.24,false);active=next;}mixer.update(dt);}
  function stats(){let triangles=0,meshes=0;const materials=new Set();root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;materials.add(o.material);}});return{triangles,meshes,materials:materials.size};}
  return{root,rig,tier,info,legs,arms,thumbs,claws,crown,eyeStems,clips,mixer,update,stats};
};
})(typeof window!=='undefined'?window:globalThis);
