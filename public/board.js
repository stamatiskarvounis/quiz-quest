/* Quiz Quest — board engine v7 (PixiJS + Tiny Swords art).
   Scene layers: water color -> animated shore foam -> island map (generated from the
   Tiny Swords tileset) -> dust -> tokens (heroes + swaying trees, y-sorted) -> name
   tags -> drifting clouds -> vignette. Heroes are Tiny Swords units with real idle/run
   animations. Follow-camera identical to v5/v6. Public API unchanged:
     renderBoardAnimated(containerId, players, opts) / drawOverlay / clearOverlay
     avatarSVG(race, px) / iconSVG(key, px) / ELEMS / RACE
   Requires mapdata.js + pixi.min.js (CDN) loaded first. Static-image fallback if PIXI
   is unavailable. */

/* ================= answer-option icons (DOM, unchanged) ================= */
function pixels(grid, pal, cell, ox, oy){ let r='';
  for(let y=0;y<grid.length;y++){ const row=grid[y];
    for(let x=0;x<row.length;x++){ const ch=row[x];
      if(ch!=='.'&&pal[ch]) r+='<rect x="'+(ox+x*cell).toFixed(1)+'" y="'+(oy+y*cell).toFixed(1)+'" width="'+cell+'" height="'+cell+'" fill="'+pal[ch]+'"/>'; } }
  return r; }
const ICONS={
  fire:{pal:{o:'#ff7a18',y:'#ffe24a',r:'#d62200'},g:["...oo...","..ooo...","..oyoo..",".ooyyo..",".oyyryo.",".oyrryo.",".ryyyyr.","..rrrr.."]},
  water:{pal:{b:'#0a6cff',c:'#9fe3ff',w:'#0344a8'},g:["...b....","...bb...","..bcb...","..bccb..",".bcccb..",".bccccb.",".bccccb.","..bwwb.."]},
  leaf:{pal:{g:'#46e056',G:'#1f9d2f',s:'#8b5a2b'},g:[".....g..","....gg..","...gGg..","..gGGg..",".gGGgg..","gGGgg...",".gGg....","..s....."]},
  earth:{pal:{t:'#f4c061',T:'#b9742a',d:'#7a4a18'},g:["........","...tt...","..tttt..",".tttTtt.",".tTtttT.","tttttttt",".TttttT.","..dTTd.."]}
};
const ELEMS=['fire','water','leaf','earth'];
function iconSVG(key,px){ const ic=ICONS[key],cell=px/8;
  return '<svg width="'+px+'" height="'+px+'" viewBox="0 0 '+px+' '+px+'" shape-rendering="crispEdges">'+pixels(ic.g,ic.pal,cell,0,0)+'</svg>'; }

/* ================= avatars -> Tiny Swords units =================
   20 avatars: 4 distinct designs x 5 colours. Three male designs
   (warrior=helmet, pawn=coif, monk=bearded) and one female design (archer),
   each recoloured. Portrait PNGs are the identity (lobby/phone/podium); the
   matching unit sprite walks the map. ORDER drives the selection grid. */
const AVATAR_ORDER=[];
const UNITS={};
['warrior','pawn','monk','archer'].forEach(d=>{
  const sc = d==='pawn'?1.05 : d==='monk'?1.0 : 0.95;
  ['blue','red','yellow','purple','black'].forEach(c=>{
    const key=d+'_'+c; UNITS[key]={scale:sc}; AVATAR_ORDER.push(key);
  });
});
const RACE=UNITS;
const FRAME=192, FEET_Y=0.72, TAGOFF=104;

function raceKey(r){ return UNITS[r]?r:'warrior_blue'; }
function avatarURL(race){ return '/assets/avatars/'+raceKey(race)+'.png'; }
function avatarSVG(race,px){
  return '<img src="'+avatarURL(race)+'" width="'+px+'" height="'+px+'" style="image-rendering:pixelated;vertical-align:middle;" alt="">'; }

/* sliced textures per race: {idle:[...], run:[...]} */
const UNIT_TEX={};
function unitTex(race){
  race=raceKey(race);
  if(UNIT_TEX[race]) return UNIT_TEX[race];
  const rec={idle:[],run:[]};
  UNIT_TEX[race]=rec;
  ['idle','run'].forEach(kind=>{
    const base=PIXI.BaseTexture.from('/assets/units/'+race+'_'+kind+'.png',{scaleMode:PIXI.SCALE_MODES.NEAREST});
    const slice=()=>{ const n=Math.max(1,Math.round(base.width/FRAME));
      for(let i=0;i<n;i++) rec[kind].push(new PIXI.Texture(base,new PIXI.Rectangle(i*FRAME,0,FRAME,base.height))); };
    if(base.valid) slice(); else base.once('loaded',slice);
  });
  return rec;
}
/* generic sheet slicer (foam 192x192x16, trees 192-wide x8) */
function sliceSheet(url,fw,store){
  const base=PIXI.BaseTexture.from(url,{scaleMode:PIXI.SCALE_MODES.NEAREST});
  const slice=()=>{ const n=Math.max(1,Math.round(base.width/fw));
    for(let i=0;i<n;i++) store.push(new PIXI.Texture(base,new PIXI.Rectangle(i*fw,0,fw,base.height))); };
  if(base.valid) slice(); else base.once('loaded',slice);
  return store;
}
const FOAM_FRAMES=[]; let TREE_FRAMES=null; const CLOUD_TEX=[];
function getFoamFrames(){ if(!FOAM_FRAMES.length) sliceSheet('/assets/fx/foam.png',192,FOAM_FRAMES); return FOAM_FRAMES; }
function getTreeFrames(){ if(!TREE_FRAMES){ TREE_FRAMES=[[],[],[],[]];
  for(let i=0;i<4;i++) sliceSheet('/assets/fx/tree'+(i+1)+'.png',192,TREE_FRAMES[i]); } return TREE_FRAMES; }
function getCloudTex(){ if(!CLOUD_TEX.length){ for(let i=1;i<=3;i++) CLOUD_TEX.push(PIXI.Texture.from('/assets/fx/cloud'+i+'.png')); } return CLOUD_TEX; }

/* ================= shared geometry helpers (same math as v5) ================= */
const PER_TILE=560, HOP=8, ZOOMOUT=950;
function esc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
const AR=()=>MAPDATA.w/MAPDATA.h;
function clampT(t){ const LEN=MAPDATA.pts.length; return t<1?1:Math.min(t,LEN); }
function ptOf(t){ const p=MAPDATA.pts[clampT(t)-1]; return [p[0]*MAPDATA.w,p[1]*MAPDATA.h]; }
function frameViewBox(pts){
  const W=MAPDATA.w,H=MAPDATA.h,ar=AR();
  if(!pts||!pts.length) return [0,0,W,H];
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  pts.forEach(p=>{ minx=Math.min(minx,p[0]); miny=Math.min(miny,p[1]); maxx=Math.max(maxx,p[0]); maxy=Math.max(maxy,p[1]); });
  minx-=W*0.05+30; maxx+=W*0.05+30; miny-=H*0.14+70; maxy+=H*0.06+30;
  let w=maxx-minx,h=maxy-miny;
  const minW=W*0.46,minH=minW/ar;
  if(w<minW){ const cx=(minx+maxx)/2; minx=cx-minW/2; maxx=cx+minW/2; w=minW; }
  if(h<minH){ const cy=(miny+maxy)/2; miny=cy-minH/2; maxy=cy+minH/2; h=minH; }
  if(w/h<ar){ const cx=(minx+maxx)/2; w=h*ar; minx=cx-w/2; maxx=cx+w/2; }
  else { const cy=(miny+maxy)/2; h=w/ar; miny=cy-h/2; maxy=cy+h/2; }
  if(w>=W){ w=W; minx=0; } else { if(minx<0) minx=0; if(minx+w>W) minx=W-w; }
  if(h>=H){ h=H; miny=0; } else { if(miny<0) miny=0; if(miny+h>H) miny=H-h; }
  return [minx,miny,w,h];
}
function lerpVB(a,b,t){ return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,a[3]+(b[3]-a[3])*t]; }
function easeIO(t){ return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
function hexOf(c){ if(typeof c!=='string') return 0xffd23f;
  let s=c.replace('#',''); if(s.length===3) s=s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
  const n=parseInt(s,16); return isNaN(n)?0xffd23f:n; }

/* sound hooks — host.html provides window.QQSFX; silent elsewhere (phones) */
function sfx(name){ try{ if(window.QQSFX) window.QQSFX(name); }catch(e){} }

/* ================= Pixi scene management ================= */
const APPS={};
let SHADOW_TEX=null, DUST_TEX=null, VIGNETTE_TEX=null;
function getShadowTex(){ if(SHADOW_TEX) return SHADOW_TEX;
  const cv=document.createElement('canvas'); cv.width=64; cv.height=24;
  const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(32,12,2,32,12,30);
  g.addColorStop(0,'rgba(0,0,0,0.5)'); g.addColorStop(0.7,'rgba(0,0,0,0.22)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(32,12); ctx.scale(1,0.36); ctx.translate(-32,-12);
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(32,12,30,0,Math.PI*2); ctx.fill(); ctx.restore();
  SHADOW_TEX=PIXI.Texture.from(cv); return SHADOW_TEX; }
function getDustTex(){ if(DUST_TEX) return DUST_TEX;
  const cv=document.createElement('canvas'); cv.width=24; cv.height=24;
  const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(12,12,1,12,12,12);
  g.addColorStop(0,'rgba(248,244,228,0.95)'); g.addColorStop(0.6,'rgba(236,226,200,0.5)'); g.addColorStop(1,'rgba(236,226,200,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(12,12,12,0,Math.PI*2); ctx.fill();
  DUST_TEX=PIXI.Texture.from(cv); return DUST_TEX; }
function getVignetteTex(){ if(VIGNETTE_TEX) return VIGNETTE_TEX;
  const cv=document.createElement('canvas'); cv.width=512; cv.height=288;
  const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(256,144,120,256,144,330);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.75,'rgba(8,12,24,0.10)'); g.addColorStop(1,'rgba(8,12,24,0.42)');
  ctx.fillStyle=g; ctx.fillRect(0,0,512,288);
  VIGNETTE_TEX=PIXI.Texture.from(cv); return VIGNETTE_TEX; }

/* ---- special-block markers: a glowing fairy (good) or wizard (bad) ---- */
let SPECIALS=[];               // [{tile,type,good,icon,label,desc}]
const MARKER_TEX={};
function getMarkerTex(good){     // just the figure, soft drop-shadow (no glow circle)
  const key=good?'good':'bad';
  if(MARKER_TEX[key]) return MARKER_TEX[key];
  const S=96, cv=document.createElement('canvas'); cv.width=S; cv.height=S;
  const ctx=cv.getContext('2d');
  ctx.font='58px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=6; ctx.shadowOffsetY=3;
  ctx.fillText(good?'🧚':'🧙', S/2, S/2+2);
  MARKER_TEX[key]=PIXI.Texture.from(cv); return MARKER_TEX[key];
}
function getBlockTex(good){      // painted tile patch: translucent green (good) / red (bad)
  const key='tile_'+(good?'g':'b');
  if(MARKER_TEX[key]) return MARKER_TEX[key];
  const S=84, cv=document.createElement('canvas'); cv.width=S; cv.height=S;
  const ctx=cv.getContext('2d');
  const fill = good?'rgba(60,210,110,0.55)':'rgba(230,70,70,0.55)';
  const edge = good?'rgba(180,255,210,0.95)':'rgba(255,170,170,0.95)';
  const r=14, m=8, w=S-2*m, h=S-2*m;
  ctx.beginPath();
  ctx.moveTo(m+r,m); ctx.arcTo(m+w,m,m+w,m+h,r); ctx.arcTo(m+w,m+h,m,m+h,r);
  ctx.arcTo(m,m+h,m,m,r); ctx.arcTo(m,m,m+w,m,r); ctx.closePath();
  ctx.fillStyle=fill; ctx.fill(); ctx.lineWidth=4; ctx.strokeStyle=edge; ctx.stroke();
  MARKER_TEX[key]=PIXI.Texture.from(cv); return MARKER_TEX[key];
}
function applyMarkers(S){
  if(!S||!S.markerLayer) return;
  S.markerLayer.removeChildren().forEach(c=>{ try{ c.destroy({children:true}); }catch(e){} });
  S.markers=[];
  SPECIALS.forEach((sp,i)=>{
    const p=ptOf(sp.tile);
    const tile=new PIXI.Sprite(getBlockTex(sp.good)); tile.anchor.set(0.5); tile.position.set(p[0],p[1]); tile.scale.set(1,0.62);
    const fig=new PIXI.Sprite(getMarkerTex(sp.good)); fig.anchor.set(0.5,0.95); fig.scale.set(0.8);
    const c=new PIXI.Container(); c.position.set(p[0],p[1]-22); c.addChild(fig);
    S.markerLayer.addChild(tile); S.markerLayer.addChild(c);
    S.markers.push({c:c, baseY:p[1]-22, ph:i*1.1});
  });
}
function setMapSpecials(arr){ SPECIALS=arr||[]; Object.values(APPS).forEach(S=>{ if(S&&!S.fallback) applyMarkers(S); }); }

function ensureScene(id){
  const el=document.getElementById(id); if(!el) return null;
  let S=APPS[id];
  if(S&&S.fallback) return S;
  if(S&&S.wrap&&el.contains(S.wrap)) return S;
  if(S&&S.app){ try{ S.app.destroy(true,{children:true}); }catch(e){} delete APPS[id]; }
  if(!window.PIXI){ S={fallback:true,el:el}; APPS[id]=S; return S; }
  el.innerHTML='';
  const wrap=document.createElement('div');
  wrap.className='board-wrap';
  wrap.style.cssText='position:relative;width:100%;height:100%;overflow:hidden;container-type:size;container-name:board;';
  el.appendChild(wrap);
  const app=new PIXI.Application({
    width:Math.max(4,wrap.clientWidth||400), height:Math.max(4,wrap.clientHeight||220),
    antialias:true, autoDensity:true,
    resolution:Math.min(window.devicePixelRatio||1,2),
    backgroundColor:hexOf(MAPDATA.water||'#47aba9') });
  app.view.style.cssText='position:absolute;inset:0;display:block;image-rendering:auto;';
  wrap.appendChild(app.view);
  const root=new PIXI.Container();
  /* water */
  const water=new PIXI.Graphics();
  water.beginFill(hexOf(MAPDATA.water||'#47aba9')).drawRect(-MAPDATA.w,-MAPDATA.h,MAPDATA.w*3,MAPDATA.h*3).endFill();
  /* shore foam */
  const foamLayer=new PIXI.Container();
  const foamSprites=[];
  (MAPDATA.foam||[]).forEach(f=>{
    const sp=new PIXI.Sprite(PIXI.Texture.EMPTY); sp.anchor.set(0.5); sp.position.set(f[0],f[1]);
    foamLayer.addChild(sp); foamSprites.push(sp);
  });
  /* island map */
  const mapSpr=new PIXI.Sprite(PIXI.Texture.EMPTY);
  const markerLayer=new PIXI.Container();   // special-block fairies/wizards (under heroes)
  const dustLayer=new PIXI.Container();
  const tokLayer=new PIXI.Container(); tokLayer.sortableChildren=true;
  const tagLayer=new PIXI.Container();
  const cloudLayer=new PIXI.Container();
  root.addChild(water,foamLayer,mapSpr,markerLayer,dustLayer,tokLayer,tagLayer,cloudLayer);
  app.stage.addChild(root);
  /* swaying trees live with tokens so heroes sort around them */
  const treeSprites=[];
  const TF=getTreeFrames();
  (MAPDATA.trees||[]).forEach((t,i)=>{
    const sp=new PIXI.Sprite(PIXI.Texture.EMPTY);
    sp.anchor.set(0.5,0.9); sp.position.set(t[0],t[1]); sp.zIndex=t[1];
    tokLayer.addChild(sp); treeSprites.push({sp:sp,v:t[2]||0,ph:i*1.37});
  });
  /* clouds */
  const clouds=[];
  const CT=getCloudTex();
  for(let i=0;i<3;i++){
    const sp=new PIXI.Sprite(CT[i%CT.length]); sp.anchor.set(0.5); sp.alpha=0.85;
    sp.position.set(Math.random()*MAPDATA.w, 120+Math.random()*(MAPDATA.h-300));
    sp.scale.set(0.9+Math.random()*0.5);
    cloudLayer.addChild(sp);
    clouds.push({sp:sp,vx:6+Math.random()*8});
  }
  /* screen-space vignette */
  const vig=new PIXI.Sprite(getVignetteTex()); vig.alpha=0.85;
  app.stage.addChild(vig);
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.style.cssText='position:absolute;inset:0;pointer-events:none;font-family:Verdana,Arial,sans-serif;';
  wrap.appendChild(overlay);
  S={app:app,root:root,mapSpr:mapSpr,markerLayer:markerLayer,dustLayer:dustLayer,tokLayer:tokLayer,tagLayer:tagLayer,
     foamSprites:foamSprites,treeSprites:treeSprites,clouds:clouds,cloudLayer:cloudLayer,vig:vig,
     wrap:wrap,el:el,overlayDiv:overlay,toks:[],dust:[],markers:[],anim:null,lastVB:null,cw:0,ch:0,phone:false,lastT:0};
  APPS[id]=S;
  const tex=PIXI.Texture.from(MAPDATA.img);
  const fit=()=>{ mapSpr.texture=tex; mapSpr.width=MAPDATA.w; mapSpr.height=MAPDATA.h; };
  if(tex.baseTexture.valid) fit(); else tex.baseTexture.once('loaded',fit);
  applyMarkers(S);   // draw any known special-block markers
  app.ticker.add(()=>tick(S));
  return S;
}
function applyVB(S,vb){
  S.lastVB=vb;
  const cw=S.cw,ch=S.ch; if(!cw||!ch) return;
  const s=(S.fit==='contain'?Math.min:Math.max)(cw/vb[2],ch/vb[3]);
  S.root.scale.set(s);
  S.root.position.set(cw/2-(vb[0]+vb[2]/2)*s, ch/2-(vb[1]+vb[3]/2)*s);
}
function makeTag(name,color){
  const c=new PIXI.Container();
  const t=new PIXI.Text(String(name||'').slice(0,10),
    {fontFamily:'Verdana,Arial,sans-serif',fontSize:15,fontWeight:'bold',fill:0xffffff});
  t.resolution=2; t.anchor.set(0.5);
  const w=Math.max(28,t.width+16),h=22;
  const g=new PIXI.Graphics();
  g.lineStyle(2,hexOf(color),1); g.beginFill(0x0b0f1a,0.82);
  g.drawRoundedRect(-w/2,-h/2,w,h,5); g.endFill();
  c.addChild(g,t); return c;
}
function buildTokens(S,players){
  S.toks.forEach(o=>{ try{ o.cont.destroy({children:true}); o.tag.destroy({children:true}); }catch(e){} });
  S.toks=[];
  (players||[]).forEach((p,idx)=>{
    const fromT=clampT(p.from==null?p.position:p.from), toT=clampT(p.position||0);
    const race=raceKey(p.hero);
    const cont=new PIXI.Container();
    const shadow=new PIXI.Sprite(getShadowTex()); shadow.anchor.set(0.5); shadow.y=3;
    shadow.width=54; shadow.height=19;
    const ring=new PIXI.Graphics();
    ring.lineStyle(4,hexOf(p.color||'#ffd23f'),0.95); ring.drawEllipse(0,3,23,8.5);
    const tex=unitTex(race);
    const hero=new PIXI.Sprite(tex.idle[0]||PIXI.Texture.EMPTY);
    hero.anchor.set(0.5,FEET_Y); hero.y=2;
    const sc=UNITS[race].scale;
    hero.scale.set(sc);
    cont.addChild(shadow,ring,hero);
    S.tokLayer.addChild(cont);
    const tag=makeTag(p.name,p.color||'#ffd23f');
    S.tagLayer.addChild(tag);
    S.toks.push({cont:cont,hero:hero,shadow:shadow,ring:ring,tag:tag,tex:tex,sc:sc,
      off:(idx%3-1)*16, fromT:fromT, toT:toT, frame:-1, kind:'', lastTile:null, arrived:false, squashT:0,
      face:1, shadowBX:shadow.scale.x, shadowBY:shadow.scale.y});
  });
}
function spawnDust(S,x,y,n){
  for(let i=0;i<n;i++){
    const sp=new PIXI.Sprite(getDustTex()); sp.anchor.set(0.5);
    sp.position.set(x+(Math.random()*18-9), y+2+(Math.random()*6-3));
    S.dustLayer.addChild(sp);
    S.dust.push({sp:sp,t0:performance.now(),life:380+Math.random()*220,
      x:sp.x,y:sp.y, vx:(Math.random()*46-23), vy:-(6+Math.random()*14),
      s0:0.35+Math.random()*0.25, s1:1+Math.random()*0.7});
  }
}
function updateDust(S,now){
  if(!S.dust.length) return;
  S.dust=S.dust.filter(d=>{
    const t=(now-d.t0)/d.life;
    if(t>=1){ try{ d.sp.destroy(); }catch(e){} return false; }
    d.sp.position.set(d.x+d.vx*t, d.y+d.vy*t);
    d.sp.alpha=0.55*(1-t);
    const s=d.s0+(d.s1-d.s0)*t; d.sp.scale.set(s);
    return true;
  });
}
function updateTokens(S,now){
  const LEN=MAPDATA.pts.length;
  const animating=S.anim&&S.anim.animate;
  const el2=animating?now-S.anim.start:0;
  S.toks.forEach((o,idx)=>{
    let x,y,hop=0,walking=false;
    const steps=o.toT-o.fromT;
    if(animating&&steps!==0){
      const dir=steps>0?1:-1, dist=Math.abs(steps);
      const dur=dist*PER_TILE, t=Math.min(el2,dur);
      const fp=(o.fromT-1)+dir*(t/PER_TILE);          // fractional 0-based tile, forward OR backward
      const i0=Math.floor(fp), f=fp-i0;
      const a=ptOf(i0+1), b=ptOf(Math.min(i0+2,LEN));
      x=a[0]+(b[0]-a[0])*f+o.off; y=a[1]+(b[1]-a[1])*f;
      hop=Math.sin(Math.PI*f)*HOP;
      if(t<dur){
        walking=true;
        // face the direction of travel (backwards = look toward lower tiles)
        const seg=(b[0]-a[0]); if(seg!==0) o.face=(dir>0?(seg>=0?1:-1):(seg>=0?-1:1));
        if(o.lastTile!==i0){
          if(o.lastTile!=null){ spawnDust(S,x,y,3); o.squashT=now; sfx('step'); }
          o.lastTile=i0;
        }
      } else if(!o.arrived){
        o.arrived=true; spawnDust(S,x,y,9); o.squashT=now; sfx('land');
      }
    } else {
      const c=ptOf(o.toT); x=c[0]+o.off; y=c[1];
    }
    /* squash & stretch: subtle while running, squash pop on landing */
    let sx=1,sy=1;
    const air=hop/HOP;
    sy+=0.08*air; sx-=0.05*air;
    if(o.squashT){ const dt=now-o.squashT;
      if(dt<140){ const k=1-dt/140; sy*=(1-0.16*k); sx*=(1+0.18*k); } }
    o.cont.position.set(x,y);
    o.cont.zIndex=y;
    o.hero.y=2-hop;
    o.hero.scale.set(o.sc*sx*o.face, o.sc*sy);
    const sk=1-0.28*air;
    o.shadow.scale.set(o.shadowBX*sk,o.shadowBY*sk);
    o.shadow.alpha=1-0.4*air;
    /* animation frames: run sheet while moving, idle sheet otherwise */
    const kind=walking?'run':'idle';
    const arr=o.tex[kind];
    if(arr.length){
      const ms=walking?70:140;
      const fr=(((now/ms)|0)+idx)%arr.length;
      if(o.kind!==kind||o.frame!==fr){ o.kind=kind; o.frame=fr; o.hero.texture=arr[fr%arr.length]; }
    }
    o.tag.position.set(x, y-hop-TAGOFF);
  });
}
function tick(S){
  const w=S.wrap.clientWidth|0,h=S.wrap.clientHeight|0;
  if(w<4||h<4) return;
  if(w!==S.cw||h!==S.ch){
    S.cw=w; S.ch=h; S.app.renderer.resize(w,h);
    S.vig.width=w; S.vig.height=h;
    if(S.lastVB) applyVB(S,S.lastVB);
  }
  const now=performance.now();
  const dt=S.lastT?Math.min(100,now-S.lastT):16; S.lastT=now;
  if(S.anim){
    const A=S.anim, t=now-A.start;
    if(A.animate){
      if(t<=A.maxDur) applyVB(S,lerpVB(A.fromVB,A.toVB,easeIO(t/A.maxDur)));
      else applyVB(S,lerpVB(A.toVB,A.fullVB,easeIO(Math.min(1,(t-A.maxDur)/ZOOMOUT))));
    }
    if(t>=A.total){ const cb=A.onDone; S.anim=null; if(cb) setTimeout(cb,300); }
  }
  /* ambient animation (static frames on phones to save battery) */
  const FF=getFoamFrames();
  if(FF.length){
    const fi=S.phone?0:((now/120)|0)%FF.length;
    if(S.foamFi!==fi){ S.foamFi=fi; S.foamSprites.forEach(sp=>{ sp.texture=FF[fi]; }); }
  }
  const TF=getTreeFrames();
  S.treeSprites.forEach(tr=>{
    const arr=TF[tr.v]; if(!arr.length) return;
    const fi=S.phone?0:((now/150+tr.ph*37)|0)%arr.length;
    if(tr.fi!==fi){ tr.fi=fi; tr.sp.texture=arr[fi]; }
  });
  if(S.markers) S.markers.forEach(mk=>{ mk.c.y = mk.baseY + Math.sin(now/600+mk.ph)*4; });
  if(!S.phone){
    S.clouds.forEach(c=>{
      c.sp.x+=c.vx*dt/1000;
      if(c.sp.x>MAPDATA.w+400) c.sp.x=-400;
    });
  } else { S.cloudLayer.visible=false; }
  updateTokens(S,now);
  updateDust(S,now);
}

/* ================= fallback (PIXI failed to load) ================= */
function renderFallback(S,players,opts){
  const el=S.el;
  let s='<div class="board-wrap" style="position:relative;width:100%;height:100%;overflow:hidden;container-type:size;container-name:board;background:'+(MAPDATA.water||'#47aba9')+';">'
    +'<img src="'+MAPDATA.img+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" alt="">';
  (players||[]).forEach(p=>{
    const c=MAPDATA.pts[clampT(p.position||0)-1];
    s+='<img src="'+avatarURL(p.hero)+'" style="position:absolute;left:'+(c[0]*100).toFixed(2)+'%;top:'+(c[1]*100).toFixed(2)
      +'%;width:4%;transform:translate(-50%,-85%);image-rendering:pixelated;" alt="">';
  });
  s+='<div class="overlay" style="position:absolute;inset:0;pointer-events:none;font-family:Verdana,Arial,sans-serif;"></div></div>';
  el.innerHTML=s;
  if(opts&&opts.onDone) setTimeout(opts.onDone,800);
}

/* ================= public API ================= */
function renderBoardAnimated(containerId,players,opts){
  opts=opts||{};
  const S=ensureScene(containerId); if(!S) return;
  if(S.fallback){ renderFallback(S,players,opts); return; }
  S.phone=(opts.layout==='phone');
  S.fit=opts.fit||null;
  buildTokens(S,players);
  const fromVB=frameViewBox(S.toks.map(o=>ptOf(o.fromT)));
  const toVB=frameViewBox(S.toks.map(o=>ptOf(o.toT)));
  const FULL=[0,0,MAPDATA.w,MAPDATA.h];
  if(!opts.animate){
    S.anim=null;
    applyVB(S,opts.focus?toVB:FULL);
    if(opts.onDone){ const cb=opts.onDone; setTimeout(cb,300); }
    return;
  }
  applyVB(S,fromVB);
  const maxDur=Math.max(1,...S.toks.map(o=>Math.abs(o.toT-o.fromT)*PER_TILE));
  S.anim={start:performance.now(),animate:true,maxDur:maxDur,total:maxDur+ZOOMOUT,
          fromVB:fromVB,toVB:toVB,fullVB:FULL,onDone:opts.onDone||null};
}

/* ---- fixed HUD overlay (HTML, stays put while the camera moves) ---- */
function drawOverlay(containerId,data){
  const el=document.getElementById(containerId); if(!el) return;
  const ov=el.querySelector('.overlay'); if(!ov) return;
  let s='';
  if(data&&data.title){
    s+='<div style="position:absolute;left:1.5%;top:2.5%;background:rgba(11,15,26,.85);border:0.22cqw solid #ffd23f;border-radius:0.8cqw;padding:0.55cqw 1.1cqw;color:#ffd23f;font-weight:700;font-size:2.1cqw;text-shadow:1px 1px 0 #000;">'+esc(data.title)+'</div>';
  }
  if(data&&data.rows&&data.rows.length){
    let rows='';
    data.rows.forEach(r=>{ rows+='<div style="display:flex;align-items:center;gap:0.5cqw;margin:0.22cqw 0;font-size:1.5cqw;color:#fff;line-height:1.25;"><span style="width:1.3cqw;height:1.3cqw;border-radius:2px;background:'+(r.color||'#ffd23f')+';flex:0 0 auto;"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(r.text)+'</span></div>'; });
    s+='<div style="position:absolute;right:1.5%;top:9%;width:25%;max-height:86%;overflow:hidden;background:rgba(11,15,26,.74);border:0.18cqw solid #ffd23f;border-radius:0.8cqw;padding:0.7cqw;box-sizing:border-box;">'+rows+'</div>';
  }
  ov.innerHTML=s;
}
function clearOverlay(containerId){ const el=document.getElementById(containerId); const ov=el&&el.querySelector('.overlay'); if(ov) ov.innerHTML=''; }
