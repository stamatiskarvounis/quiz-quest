/* Quiz Quest — board engine v5.
   The board is a pre-rendered isometric map (built from the modular 3D terrain),
   served as an image. Hero tokens are placed on exact path positions (MAPDATA.pts)
   and animated on top. Heroes are original SVG sprites. Requires mapdata.js loaded first. */

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

/* ---- geared race characters ---- */
const LOOKS={
  human:{skin:'#f0c08a',hair:'#7a4a26',tunic:'#3a78d6',tunicD:'#255aa8',boot:'#3a2a1a',head:'hair',feat:null,wpn:'sword',cape:null,name:'Human'},
  elf:{skin:'#f6dcb0',hair:'#e8c84a',tunic:'#3aa85a',tunicD:'#247d3f',boot:'#5a3d1c',head:'hair',feat:'ears',wpn:'bow',cape:null,name:'Elf'},
  darkelf:{skin:'#c2a8e0',hair:'#eef0f6',tunic:'#7a3fc0',tunicD:'#5a2a92',boot:'#2a2240',head:'hair',feat:'ears',wpn:'sword',cape:'#3a1f66',name:'Dark Elf'},
  dwarf:{skin:'#f0b878',hair:'#d98a2a',tunic:'#d0392b',tunicD:'#a32820',boot:'#5a3d1c',head:'helm',feat:'beard',wpn:'axe',cape:null,name:'Dwarf'},
  orc:{skin:'#7fae4f',hair:'#2a2a2a',tunic:'#7a5a2e',tunicD:'#5a4020',boot:'#2a2a2a',head:'hair',feat:'tusks',wpn:'axe',cape:null,name:'Orc'},
  halfling:{skin:'#f0c08a',hair:'#8a5a2b',tunic:'#4a9e3f',tunicD:'#2f7d2c',boot:'#5a3d1c',head:'hair',feat:null,wpn:'bow',cape:null,name:'Halfling'},
  mage:{skin:'#f0d6b8',hair:'#cfd6e6',tunic:'#2a3f7a',tunicD:'#1c2a55',boot:'#1c2540',head:'hat',feat:null,wpn:'staff',cape:null,name:'Mage'},
  knight:{skin:'#e8c49a',hair:'#c2cad6',tunic:'#9aa3b3',tunicD:'#727d8f',boot:'#4a4f5a',head:'helm',feat:null,wpn:'sword',cape:'#16467a',name:'Knight'}
};
const RACE=LOOKS;
function character(race,frame,ring){
  const L=LOOKS[race]||LOOKS.human; let s='';
  s+='<ellipse cx="0" cy="2" rx="9" ry="3.6" fill="#000" opacity="0.34"/>';
  if(ring) s+='<ellipse cx="0" cy="1" rx="10.5" ry="4.2" fill="none" stroke="'+ring+'" stroke-width="2.6"/>';
  if(L.cape) s+='<path d="M-6 -24 Q-12 -9 -8 -2 L8 -2 Q12 -9 6 -24 Z" fill="'+L.cape+'"/>';
  const lo=frame?1:0;
  s+='<rect x="-6" y="'+(-12+lo)+'" width="5" height="9" rx="2" fill="'+L.boot+'"/><rect x="1" y="'+(-12-lo)+'" width="5" height="9" rx="2" fill="'+L.boot+'"/>';
  s+='<path d="M-7 -25 Q-9 -12 -5 -10 L5 -10 Q9 -12 7 -25 Z" fill="'+L.tunic+'"/><path d="M0 -25 Q9 -12 5 -10 L0 -10 Z" fill="'+L.tunicD+'"/>';
  s+='<rect x="-7" y="-13.5" width="14" height="2.6" fill="#caa02a" opacity="0.85"/>';
  s+='<rect x="-9" y="-24" width="4" height="10" rx="2" fill="'+L.tunic+'"/><rect x="5" y="-24" width="4" height="10" rx="2" fill="'+L.tunicD+'"/>';
  s+='<circle cx="0" cy="-29" r="7" fill="'+L.skin+'"/>';
  if(L.feat==='ears') s+='<path d="M-7 -30 l-3 -5 l3 2 Z" fill="'+L.skin+'"/><path d="M7 -30 l3 -5 l-3 2 Z" fill="'+L.skin+'"/>';
  if(L.head==='hair') s+='<path d="M-7 -30 Q0 -43 7 -30 Q3 -38 0 -37 Q-3 -38 -7 -30 Z" fill="'+L.hair+'"/>';
  else if(L.head==='helm') s+='<path d="M-8 -29 Q-8 -40 0 -40 Q8 -40 8 -29 Z" fill="'+L.hair+'"/><rect x="-5.5" y="-31" width="11" height="2.6" fill="#2a2f3a"/><path d="M0 -40 l2.5 -6 l-5 0 Z" fill="#e0473b"/>';
  else if(L.head==='hat') s+='<path d="M-9 -28 Q0 -54 0 -33 Q0 -54 9 -28 Q4 -39 0 -37 Q-4 -39 -9 -28 Z" fill="'+L.hair+'"/><path d="M-9 -28 Q0 -35 9 -28 L7 -25 Q0 -31 -7 -25 Z" fill="#ffd23f" opacity="0.8"/>';
  if(L.head!=='helm'){ s+='<circle cx="-3" cy="-29" r="1.1" fill="#222"/><circle cx="3" cy="-29" r="1.1" fill="#222"/>'; }
  if(L.feat==='beard') s+='<path d="M-6 -28 Q0 -16 6 -28 Q4 -23 0 -23 Q-4 -23 -6 -28 Z" fill="'+L.hair+'"/>';
  if(L.feat==='tusks') s+='<path d="M-3.5 -26 l-1 3 l2 -1 Z" fill="#fff"/><path d="M3.5 -26 l1 3 l-2 -1 Z" fill="#fff"/>';
  if(L.wpn==='sword') s+='<rect x="7.5" y="-35" width="2.6" height="23" rx="1" fill="#e6eef7"/><rect x="6" y="-15" width="5.6" height="2.6" fill="#caa02a"/>';
  else if(L.wpn==='axe') s+='<rect x="8" y="-33" width="2.4" height="21" fill="#6e4422"/><path d="M8.4 -33 q9 -1 9 7 q-9 -2 -9 1 Z" fill="#cfd4dc"/>';
  else if(L.wpn==='staff') s+='<rect x="8" y="-37" width="2.6" height="27" rx="1.3" fill="#6e4422"/><circle cx="9.3" cy="-39" r="4.2" fill="#8fe6ff"/><circle cx="8.4" cy="-40" r="1.4" fill="#fff"/>';
  else if(L.wpn==='bow') s+='<path d="M9 -35 Q17 -23 9 -11" fill="none" stroke="#6e4422" stroke-width="2.4"/><line x1="9" y1="-35" x2="9" y2="-11" stroke="#e8e2d0" stroke-width="0.8"/>';
  return s;
}
function avatarSVG(race,px){ return '<svg width="'+px+'" height="'+Math.round(px*52/34)+'" viewBox="-17 -46 34 52" style="vertical-align:middle">'+character(race,0,null)+'</svg>'; }

/* ---- map scene + tokens ---- */
const HS=1.7, PER_TILE=380, ANIM={};
function esc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function buildSceneHTML(){
  const W=MAPDATA.w, H=MAPDATA.h;
  return '<div class="board-wrap" style="position:relative;width:100%;height:100%;overflow:hidden;container-type:size;container-name:board;">'
    +'<svg class="mapsvg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;display:block;">'
    +'<image href="'+MAPDATA.img+'" x="0" y="0" width="'+W+'" height="'+H+'"/>'
    +'<g class="tokens"></g></svg>'
    +'<div class="overlay" style="position:absolute;inset:0;pointer-events:none;font-family:Verdana,Arial,sans-serif;"></div>'
    +'</div>';
}
function ensureScene(containerId){ const el=document.getElementById(containerId); if(!el) return null;
  if(!el.querySelector('.mapsvg')){ el.innerHTML=buildSceneHTML(); } return el; }
const AR = ()=> MAPDATA.w/MAPDATA.h;
/* viewBox that frames the given pixel points: zoom toward clusters, never too tight, matched to map aspect, clamped to bounds */
function frameViewBox(pts){
  const W=MAPDATA.w, H=MAPDATA.h, ar=AR();
  if(!pts || !pts.length) return [0,0,W,H];
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  pts.forEach(p=>{ minx=Math.min(minx,p[0]); miny=Math.min(miny,p[1]); maxx=Math.max(maxx,p[0]); maxy=Math.max(maxy,p[1]); });
  minx-=W*0.05+30; maxx+=W*0.05+30; miny-=H*0.14+70; maxy+=H*0.06+30;
  let w=maxx-minx, h=maxy-miny;
  const minW=W*0.46, minH=minW/ar;
  if(w<minW){ const cx=(minx+maxx)/2; minx=cx-minW/2; maxx=cx+minW/2; w=minW; }
  if(h<minH){ const cy=(miny+maxy)/2; miny=cy-minH/2; maxy=cy+minH/2; h=minH; }
  if(w/h < ar){ const cx=(minx+maxx)/2; w=h*ar; minx=cx-w/2; maxx=cx+w/2; }
  else { const cy=(miny+maxy)/2; h=w/ar; miny=cy-h/2; maxy=cy+h/2; }
  if(w>=W){ w=W; minx=0; } else { if(minx<0) minx=0; if(minx+w>W) minx=W-w; }
  if(h>=H){ h=H; miny=0; } else { if(miny<0) miny=0; if(miny+h>H) miny=H-h; }
  return [minx,miny,w,h];
}
function setVB(svg,vb){ if(svg) svg.setAttribute('viewBox', vb[0].toFixed(1)+' '+vb[1].toFixed(1)+' '+vb[2].toFixed(1)+' '+vb[3].toFixed(1)); }
function lerpVB(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t, a[3]+(b[3]-a[3])*t]; }
function easeIO(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
function ptOf(t){ const p=MAPDATA.pts[Math.min(Math.max(t,1),MAPDATA.pts.length)-1]; return [p[0]*MAPDATA.w, p[1]*MAPDATA.h]; }
function nameTag(cx,cy,name,color){ const t=(name||'').slice(0,10), fw=t.length*9.5+14;
  return '<g><rect x="'+(cx-fw/2).toFixed(1)+'" y="'+(cy-12).toFixed(1)+'" width="'+fw.toFixed(1)+'" height="22" rx="4" fill="#0b0f1a" fill-opacity="0.82" stroke="'+color+'" stroke-width="2"/>'+
    '<text x="'+cx.toFixed(1)+'" y="'+(cy+4).toFixed(1)+'" text-anchor="middle" font-family="Verdana,sans-serif" font-size="15" font-weight="bold" fill="#fff">'+esc(t)+'</text></g>'; }
function facingOf(a,b){ return (b[0]-a[0])>=0?'R':'L'; }
function renderBoardAnimated(containerId, players, opts){
  opts=opts||{}; const el=ensureScene(containerId); if(!el) return;
  const layer=el.querySelector('.tokens'); if(!layer) return;
  if(ANIM[containerId]){ cancelAnimationFrame(ANIM[containerId]); delete ANIM[containerId]; }
  const LEN=MAPDATA.pts.length;
  const objs=(players||[]).map((p,idx)=>({ race:p.hero, color:p.color||'#ffd23f', name:p.name||'', off:(idx%3-1)*14,
    fromT:((p.from==null?p.position:p.from)<1?1:Math.min(p.from==null?p.position:p.from,LEN)),
    toT:((p.position||0)<1?1:Math.min(p.position,LEN)), cf:-1, cd:'' }));
  let nm=''; objs.forEach(o=>{ const c=ptOf(o.toT); nm+=nameTag(c[0]+o.off, c[1]-HS*52, o.name, o.color); });
  layer.innerHTML=objs.map(()=> '<g class="tok"></g>').join('')+'<g class="names">'+nm+'</g>';
  const nodes=layer.querySelectorAll('.tok'); objs.forEach((o,i)=>o.node=nodes[i]);
  function drawTok(o,x,y,frame,face){
    if(o.cf!==frame||o.cd!==face){ o.node.innerHTML=character(o.race,frame,o.color); o.cf=frame; o.cd=face; }
    o.node.setAttribute('transform','translate('+x.toFixed(1)+','+y.toFixed(1)+') scale('+(face==='L'?-HS:HS)+','+HS+')');
  }
  const mapsvg=el.querySelector('.mapsvg'); const W=MAPDATA.w, H=MAPDATA.h;
  const fromVB=frameViewBox(objs.map(o=>ptOf(o.fromT)));
  const toVB=frameViewBox(objs.map(o=>ptOf(o.toT)));
  const finish=()=>{ if(opts.onDone){ const cb=opts.onDone; opts.onDone=null; setTimeout(cb,300); } };
  if(!opts.animate){
    setVB(mapsvg, opts.focus ? toVB : [0,0,W,H]);   /* static = whole map (lobby) unless focus requested */
    objs.forEach(o=>{ const c=ptOf(o.toT); drawTok(o,c[0]+o.off,c[1],0,'R'); }); finish(); return;
  }
  setVB(mapsvg, fromVB);
  const maxDur=Math.max(1, ...objs.map(o=>Math.max(0,o.toT-o.fromT)*PER_TILE));
  const ZOOMOUT=950, fullVB=[0,0,W,H], total=maxDur+ZOOMOUT;   /* after the walk, pull back to the whole map */
  const start=performance.now();
  function frame(now){ const el2=now-start;
    if(el2<=maxDur) setVB(mapsvg, lerpVB(fromVB, toVB, easeIO(el2/maxDur)));        /* phase 1: follow heroes */
    else setVB(mapsvg, lerpVB(toVB, fullVB, easeIO(Math.min(1,(el2-maxDur)/ZOOMOUT)))); /* phase 2: zoom out to overview */
    objs.forEach(o=>{ const steps=o.toT-o.fromT;
      if(steps<=0){ const c=ptOf(o.toT); drawTok(o,c[0]+o.off,c[1],0,'R'); return; }
      const dur=steps*PER_TILE; const t=Math.min(el2,dur);
      const fp=(o.fromT-1)+t/PER_TILE; const i0=Math.floor(fp), f=fp-i0;
      const a=ptOf(i0+1), b=ptOf(Math.min(i0+2,LEN));
      const x=a[0]+(b[0]-a[0])*f+o.off, y=a[1]+(b[1]-a[1])*f - Math.abs(Math.sin(Math.PI*f))*8;
      const done=t>=dur;
      drawTok(o, x, y, done?0:(Math.floor(el2/150)%2), done?'R':facingOf(a,b));
    });
    if(el2<total) ANIM[containerId]=requestAnimationFrame(frame); else { delete ANIM[containerId]; finish(); }
  }
  ANIM[containerId]=requestAnimationFrame(frame);
}

/* ---- fixed HUD overlay (stays put while the map zooms) ---- */
function drawOverlay(containerId, data){
  const el=document.getElementById(containerId); if(!el) return;
  const ov=el.querySelector('.overlay'); if(!ov) return;
  let s='';
  if(data && data.title){
    s+='<div style="position:absolute;left:1.5%;top:2.5%;background:rgba(11,15,26,.85);border:0.22cqw solid #ffd23f;border-radius:0.8cqw;padding:0.55cqw 1.1cqw;color:#ffd23f;font-weight:700;font-size:2.1cqw;text-shadow:1px 1px 0 #000;">'+esc(data.title)+'</div>';
  }
  if(data && data.rows && data.rows.length){
    let rows='';
    data.rows.forEach(r=>{ rows+='<div style="display:flex;align-items:center;gap:0.5cqw;margin:0.22cqw 0;font-size:1.5cqw;color:#fff;line-height:1.25;"><span style="width:1.3cqw;height:1.3cqw;border-radius:2px;background:'+(r.color||'#ffd23f')+';flex:0 0 auto;"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(r.text)+'</span></div>'; });
    s+='<div style="position:absolute;right:1.5%;top:9%;width:25%;max-height:86%;overflow:hidden;background:rgba(11,15,26,.74);border:0.18cqw solid #ffd23f;border-radius:0.8cqw;padding:0.7cqw;box-sizing:border-box;">'+rows+'</div>';
  }
  ov.innerHTML=s;
}
function clearOverlay(containerId){ const el=document.getElementById(containerId); const ov=el&&el.querySelector('.overlay'); if(ov) ov.innerHTML=''; }
