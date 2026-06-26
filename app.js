// ═══════════════════════════════════════════════════════════════
//  AquaDrop AI Leak Detection Simulator — app.js
//  Side-section cross-view renderer
// ═══════════════════════════════════════════════════════════════

let SCAN_INTERVAL = 10000;
let LEAK_CHANCE   = 25;
let scanTimer     = null;
//Version 3
const state = {
  sensors:[], alerts:[], totalScans:0, leaksFound:0,
  pressureData:[], is3D:true, view:'basement', startTime:Date.now(),
};

// ═══════════════════════════════════════════════════════════════
//  PIPE LAYOUT  — side cross-section view
//  Canvas coordinate system: x = 0 (left) → W (right), y = 0 (top) → H (bottom)
//  Ground line sits at ~55% of canvas height.
//  Above = house interior (rooms visible). Below = dark soil + pipes.
// ═══════════════════════════════════════════════════════════════

// Sensor definitions: position is (nx, ny) in normalised canvas coords
// Types: 'pressure' (blue), 'acoustic' (green), 'flow' (yellow)
const SENSOR_DEFS = [
  // ── WATER MAIN ENTRY (far left, mid-depth) ──
  { id:'S01', label:'A-1', pipe:'Water Main In',    loc:'West Foundation Entry', nx:0.07, ny:0.72, type:'pressure',  featured:false },
  // ── MAIN HORIZONTAL RUN (upper level) ──
  { id:'S02', label:'A-2', pipe:'Main Supply Line', loc:'Upper Main West',       nx:0.17, ny:0.63, type:'pressure',  featured:false },
  { id:'S03', label:'A-3', pipe:'Main Supply Line', loc:'Bathroom West Riser',   nx:0.26, ny:0.63, type:'acoustic',  featured:false },
  { id:'S04', label:'A-4', pipe:'Main Supply Line', loc:'Kitchen Feed Junction', nx:0.38, ny:0.63, type:'flow',      featured:false },
  { id:'S05', label:'A-5', pipe:'Main Supply Line', loc:'Laundry Branch Point',  nx:0.50, ny:0.63, type:'acoustic',  featured:false },
  { id:'S06', label:'B-3', pipe:'Section B-3',      loc:'Near Utility Room',     nx:0.60, ny:0.63, type:'acoustic',  featured:true  },
  { id:'S07', label:'A-7', pipe:'Main Supply Line', loc:'Bathroom East Riser',   nx:0.71, ny:0.63, type:'flow',      featured:false },
  { id:'S08', label:'A-8', pipe:'Main Supply Out',  loc:'East Foundation Exit',  nx:0.86, ny:0.63, type:'pressure',  featured:false },
  // ── WATER MAIN EXIT (far right) ──
  { id:'S09', label:'K-1', pipe:'Water Main Out',   loc:'East Foundation Exit',  nx:0.95, ny:0.72, type:'pressure',  featured:false },

  // ── LOWER LOOP / RETURN LINE ──
  { id:'S10', label:'B-1', pipe:'Lower Return W',   loc:'Lower West Run',        nx:0.17, ny:0.80, type:'pressure',  featured:false },
  { id:'S11', label:'B-2', pipe:'Lower Return Mid', loc:'Irrigation Branch',     nx:0.38, ny:0.80, type:'flow',      featured:false },
  { id:'S12', label:'B-4', pipe:'Lower Return E',   loc:'Lower East Run',        nx:0.60, ny:0.80, type:'acoustic',  featured:false },
  { id:'S13', label:'B-5', pipe:'Lower Return Far', loc:'Lower East Return',     nx:0.80, ny:0.80, type:'pressure',  featured:false },

  // ── IRRIGATION DROP ──
  { id:'S14', label:'C-1', pipe:'Irrigation Feed',  loc:'Irrigation System',     nx:0.38, ny:0.88, type:'flow',      featured:false },

  // ── VERTICAL RISERS (go up through ground into rooms) ──
  // Bathroom left riser (top at ground line ~0.55)
  { id:'S15', label:'D-1', pipe:'Bath-W Riser Top', loc:'Bathroom Left Wall',    nx:0.26, ny:0.56, type:'acoustic',  featured:false },
  // Kitchen riser
  { id:'S16', label:'D-2', pipe:'Kitchen Riser Top',loc:'Kitchen Supply',        nx:0.44, ny:0.56, type:'acoustic',  featured:false },
  // Laundry riser
  { id:'S17', label:'D-3', pipe:'Laundry Riser Top',loc:'Laundry Room',          nx:0.54, ny:0.56, type:'flow',      featured:false },
  // Bath right riser
  { id:'S18', label:'D-4', pipe:'Bath-E Riser Top', loc:'Bathroom Right Wall',   nx:0.71, ny:0.56, type:'acoustic',  featured:false },

  // ── GARAGE BRANCH (right side) ──
  { id:'S19', label:'E-1', pipe:'Garage Branch',    loc:'Garage Water Supply',   nx:0.86, ny:0.78, type:'flow',      featured:false },
  { id:'S20', label:'E-2', pipe:'Garage Low',       loc:'Garage Floor Drain',    nx:0.86, ny:0.85, type:'acoustic',  featured:false },

  // ── MID-SECTION T-JUNCTIONS ──
  { id:'S21', label:'C-2', pipe:'Section C-2',      loc:'Mid West Junction',     nx:0.17, ny:0.72, type:'flow',      featured:false },
  { id:'S22', label:'C-3', pipe:'Section C-3',      loc:'Mid Center Junction',   nx:0.60, ny:0.72, type:'pressure',  featured:false },
  { id:'S23', label:'C-4', pipe:'Section C-4',      loc:'East Mid Junction',     nx:0.80, ny:0.72, type:'acoustic',  featured:false },
  { id:'S24', label:'C-5', pipe:'Section C-5',      loc:'Far East Junction',     nx:0.93, ny:0.80, type:'flow',      featured:false },
];

// ── Pipe segment connections (pairs of sensor indices) ──────
const PIPE_SEGS = [
  // Water main in → upper run
  [0,1],
  // Upper horizontal main run
  [1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,3],
  // Main → exit
  [7,8],
  // Exit node → water main out
  [8,3],
  // Upper to exit right
  [7,18-1],

  // Vertical risers (sensor index → riser top sensor index)
  [2,14],   // Bath-W: S03 → S15
  [3,15],   // Kitchen: S04 → S16
  [4,16],   // Laundry: S05 → S17
  [6,17],   // Bath-E:  S07 → S18

  // T-junctions: upper main → mid vertical connector
  [1,20],   // S02 → S21 (mid west)
  [20,9],   // S21 → S10 (lower west)
  [0,20],   // main in → mid west

  [5,21],   // S06(B-3) → S22 (mid center)
  [21,11],  // S22 → S12 (lower center)

  [7,22],   // S08 → S23 (east mid)
  [22,12],  // S23 → S13 (lower east)
  [8,22],

  // Lower horizontal run
  [9,10],[10,11],[11,12],
  // Lower right
  [12,23],[23,18],[18,19],[19,12],

  // Irrigation drop
  [10,13],

  // Garage branch
  [7,18],[18,19],
  [22,23],

  // Right exit connector
  [8,3],[12,23],
];

// Clean invalid segs
const VALID_SEGS = PIPE_SEGS.filter(([a,b])=>
  a>=0 && b>=0 && a<SENSOR_DEFS.length && b<SENSOR_DEFS.length && a!==b
);

function initSensors() {
  state.sensors = SENSOR_DEFS.map(def=>({
    ...def,
    status:'normal', psi:42+Math.random()*8,
    noise:0.05+Math.random()*0.1, leakProb:0,
    lastPing: new Date().toLocaleTimeString(),
  }));
}

// ─── PAGE NAVIGATION ─────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg = document.getElementById('page-'+name);
  if(pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>{
    if(n.textContent.toLowerCase().includes(name)) n.classList.add('active');
  });
  if(name==='sensors')   renderSensorTable();
  if(name==='analytics') renderAnalyticsPage();
  if(name==='health')    renderHealthPage();
}

function updateClock() {
  const now=new Date();
  const t=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const d=now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('topbarTime').textContent=`${t} / ${d}`;
}

// ═══════════════════════════════════════════════════════════════
//  CROSS-SECTION RENDERER
// ═══════════════════════════════════════════════════════════════
const pipeCanvas = document.getElementById('pipeCanvas');
const pipeCtx    = pipeCanvas.getContext('2d');
let tooltipSensor = null;

// Animated state
let dirtParticles = [];
let waterParticles = [];

function resizePipeCanvas() {
  const wrap = pipeCanvas.parentElement;
  const W    = wrap.offsetWidth;
  const H    = Math.round(W * 0.58);
  pipeCanvas.width        = W;
  pipeCanvas.height       = H;
  pipeCanvas.style.height = H+'px';
  initDirtParticles(W, H);
}

function px(s, W) { return s.nx * W; }
function py(s, H) { return s.ny * H; }
const GROUND_Y = 0.54; // normalised Y of ground surface

// ─── DIRT PARTICLES (soil texture) ───────────────────────────
function initDirtParticles(W, H) {
  dirtParticles = [];
  for (let i=0; i<320; i++) {
    dirtParticles.push({
      x: Math.random()*W,
      y: GROUND_Y*H + Math.random()*(H*(1-GROUND_Y)),
      r: 0.8+Math.random()*3.5,
      a: 0.06+Math.random()*0.22,
      c: Math.random()<0.5 ? '#3d2510' : '#2a1a0a',
    });
  }
}

// ─── SKY / HOUSE BACKGROUND ──────────────────────────────────
function drawBackground(ctx, W, H) {
  const GY = GROUND_Y * H;

  // Night sky gradient
  const sky = ctx.createLinearGradient(0,0,0,GY);
  sky.addColorStop(0,   '#0a0f1e');
  sky.addColorStop(0.4, '#0d1528');
  sky.addColorStop(0.8, '#121c35');
  sky.addColorStop(1,   '#1a2840');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GY);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i=0; i<60; i++) {
    const sx=((i*137.5)%W), sy=((i*71.3)%(GY*0.75));
    const sr=0.5+Math.random()*1.0;
    ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill();
  }

  // Clouds (subtle)
  ctx.fillStyle = 'rgba(30,50,80,0.35)';
  [[W*0.15,GY*0.25,120,28],[W*0.55,GY*0.18,160,32],[W*0.80,GY*0.32,100,22]].forEach(([cx,cy,rw,rh])=>{
    ctx.beginPath(); ctx.ellipse(cx,cy,rw,rh,0,0,Math.PI*2); ctx.fill();
  });

  // Trees (silhouettes left and right)
  drawTree(ctx, W*0.04, GY, W*0.03, GY*0.35);
  drawTree(ctx, W*0.96, GY, W*0.03, GY*0.35);

  // House silhouette
  drawHouse(ctx, W, GY);

  // Ground surface line (grass)
  const grassGrd = ctx.createLinearGradient(0, GY-6, 0, GY+12);
  grassGrd.addColorStop(0, '#2d5a1b');
  grassGrd.addColorStop(0.4,'#1e3d12');
  grassGrd.addColorStop(1, 'transparent');
  ctx.fillStyle = grassGrd;
  ctx.fillRect(0, GY-6, W, 20);

  // Dirt / soil below ground
  drawSoil(ctx, W, H, GY);
}

function drawTree(ctx, x, baseY, w, h) {
  // Trunk
  ctx.fillStyle = '#1a0f05';
  ctx.fillRect(x - w*0.08, baseY - h*0.3, w*0.16, h*0.3);
  // Canopy layers
  for (let l=0; l<3; l++) {
    const ly = baseY - h*0.25 - l*h*0.27;
    const lw = w*(1.0-l*0.22);
    const lh = h*0.33;
    ctx.fillStyle = l===0?'#0e2b08':'#0a2006';
    ctx.beginPath();
    ctx.moveTo(x, ly-lh);
    ctx.lineTo(x+lw, ly);
    ctx.lineTo(x-lw, ly);
    ctx.closePath(); ctx.fill();
  }
}

function drawHouse(ctx, W, GY) {
  const hL = W*0.15, hR = W*0.88;
  const hW  = hR - hL;
  const hBase = GY;
  const hH  = GY * 0.72;
  const hTop = hBase - hH;

  // House body
  const bodyGrd = ctx.createLinearGradient(hL, hTop, hR, hBase);
  bodyGrd.addColorStop(0, '#c8bfb0');
  bodyGrd.addColorStop(1, '#a89f92');
  ctx.fillStyle = bodyGrd;
  ctx.fillRect(hL, hTop+hH*0.18, hW, hH*0.82);

  // Second floor (slightly different shade)
  const sfGrd = ctx.createLinearGradient(hL, hTop, hR, hTop+hH*0.5);
  sfGrd.addColorStop(0,'#d0c8bc'); sfGrd.addColorStop(1,'#b8b0a5');
  ctx.fillStyle = sfGrd;
  ctx.fillRect(hL+hW*0.05, hTop+hH*0.18, hW*0.90, hH*0.42);

  // Roof main
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(hL-hW*0.04, hTop+hH*0.22);
  ctx.lineTo(W*0.5, hTop-hH*0.04);
  ctx.lineTo(hR+hW*0.04, hTop+hH*0.22);
  ctx.closePath(); ctx.fill();

  // Roof ridge detail
  ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(hL-hW*0.04, hTop+hH*0.22);
  ctx.lineTo(W*0.5, hTop-hH*0.04);
  ctx.lineTo(hR+hW*0.04, hTop+hH*0.22);
  ctx.stroke();

  // Roof overhang shadow
  const roofShadow = ctx.createLinearGradient(0, hTop+hH*0.18, 0, hTop+hH*0.30);
  roofShadow.addColorStop(0,'rgba(0,0,0,0.6)'); roofShadow.addColorStop(1,'transparent');
  ctx.fillStyle = roofShadow;
  ctx.fillRect(hL, hTop+hH*0.18, hW, hH*0.14);

  // Wall trim / divider between floors
  ctx.strokeStyle='#888'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(hL, hTop+hH*0.60); ctx.lineTo(hR, hTop+hH*0.60); ctx.stroke();

  // Windows (warm lit glow)
  const wins = [
    // 2nd floor
    {x:hL+hW*0.10, y:hTop+hH*0.26, w:hW*0.10, h:hH*0.20},
    {x:hL+hW*0.24, y:hTop+hH*0.26, w:hW*0.10, h:hH*0.20},
    {x:hL+hW*0.44, y:hTop+hH*0.24, w:hW*0.12, h:hH*0.22},
    {x:hL+hW*0.60, y:hTop+hH*0.26, w:hW*0.10, h:hH*0.20},
    {x:hL+hW*0.74, y:hTop+hH*0.26, w:hW*0.10, h:hH*0.20},
    // 1st floor
    {x:hL+hW*0.05, y:hTop+hH*0.63, w:hW*0.14, h:hH*0.28, label:'BATHROOM'},
    {x:hL+hW*0.27, y:hTop+hH*0.63, w:hW*0.14, h:hH*0.28, label:'KITCHEN'},
    {x:hL+hW*0.44, y:hTop+hH*0.63, w:hW*0.11, h:hH*0.28, label:'LAUNDRY'},
    {x:hL+hW*0.60, y:hTop+hH*0.63, w:hW*0.14, h:hH*0.28, label:'BATHROOM'},
    {x:hL+hW*0.78, y:hTop+hH*0.63, w:hW*0.10, h:hH*0.28, label:'GARAGE', garage:true},
  ];

  wins.forEach(win=>{
    if(win.garage) {
      // Garage door
      const grd = ctx.createLinearGradient(win.x, win.y, win.x, win.y+win.h);
      grd.addColorStop(0,'#6b5a48'); grd.addColorStop(1,'#4a3d30');
      ctx.fillStyle=grd; ctx.fillRect(win.x,win.y,win.w,win.h);
      // Garage panels
      ctx.strokeStyle='#3a2e22'; ctx.lineWidth=1.2;
      for(let p=0;p<3;p++){
        ctx.beginPath(); ctx.moveTo(win.x,win.y+win.h*((p+1)/4)); ctx.lineTo(win.x+win.w,win.y+win.h*((p+1)/4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(win.x+win.w/2,win.y); ctx.lineTo(win.x+win.w/2,win.y+win.h); ctx.stroke();
      }
    } else {
      // Warm interior glow
      const winGrd = ctx.createRadialGradient(win.x+win.w/2, win.y+win.h*0.4, 0, win.x+win.w/2, win.y+win.h/2, win.w*0.8);
      winGrd.addColorStop(0,'rgba(255,220,130,0.95)');
      winGrd.addColorStop(0.5,'rgba(255,190,80,0.80)');
      winGrd.addColorStop(1,'rgba(200,130,40,0.60)');
      ctx.fillStyle = winGrd;
      ctx.fillRect(win.x, win.y, win.w, win.h);

      // Interior scene hints
      if(win.label==='KITCHEN'){
        ctx.fillStyle='rgba(180,100,40,0.6)';
        ctx.fillRect(win.x+win.w*0.1,win.y+win.h*0.55,win.w*0.8,win.h*0.1);
      }

      // Window frame
      ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=2;
      ctx.strokeRect(win.x,win.y,win.w,win.h);
      // Mullion
      ctx.beginPath(); ctx.moveTo(win.x+win.w/2,win.y); ctx.lineTo(win.x+win.w/2,win.y+win.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(win.x,win.y+win.h/2); ctx.lineTo(win.x+win.w,win.y+win.h/2); ctx.stroke();

      // Exterior light spill on ground
      const spill = ctx.createLinearGradient(win.x,win.y+win.h,win.x,GY);
      spill.addColorStop(0,'rgba(255,200,80,0.12)'); spill.addColorStop(1,'transparent');
      ctx.fillStyle=spill;
      ctx.fillRect(win.x,win.y+win.h,win.w,GY-(win.y+win.h));
    }

    // Room labels
    if(win.label) {
      ctx.save();
      ctx.font=`bold ${Math.max(8,W*0.009)}px Segoe UI`;
      ctx.fillStyle='rgba(255,255,255,0.75)';
      ctx.textAlign='center';
      ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=4;
      ctx.fillText(win.label, win.x+win.w/2, win.y-5);
      ctx.restore();
    }
  });

  // House outline
  ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1.5;
  ctx.strokeRect(hL, hTop+hH*0.18, hW, hH*0.82);
}

function drawSoil(ctx, W, H, GY) {
  // Base soil gradient
  const soilGrd = ctx.createLinearGradient(0, GY, 0, H);
  soilGrd.addColorStop(0,   '#2a1a0a');
  soilGrd.addColorStop(0.15,'#221508');
  soilGrd.addColorStop(0.45,'#1a1005');
  soilGrd.addColorStop(0.8, '#120c03');
  soilGrd.addColorStop(1,   '#0a0702');
  ctx.fillStyle = soilGrd;
  ctx.fillRect(0, GY, W, H-GY);

  // Soil texture particles
  dirtParticles.forEach(p=>{
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle=p.c;
    ctx.globalAlpha=p.a; ctx.fill(); ctx.globalAlpha=1;
  });

  // Rock patches
  [[W*0.1,GY+H*0.12,18,10],[W*0.35,GY+H*0.25,12,7],[W*0.65,GY+H*0.18,22,12],[W*0.82,GY+H*0.28,14,8]].forEach(([rx,ry,rw,rh])=>{
    ctx.fillStyle='#2d2318'; ctx.globalAlpha=0.5;
    ctx.beginPath(); ctx.ellipse(rx,ry,rw,rh,0.2,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
  });

  // Subtle horizontal soil strata lines
  for(let s=0;s<5;s++){
    const sy = GY + (H-GY)*(0.15+s*0.17);
    ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(W,sy);
    ctx.strokeStyle=`rgba(50,30,10,${0.08+s*0.02})`; ctx.lineWidth=1.5; ctx.stroke();
  }

  // Depth shadow vignette
  const vig = ctx.createLinearGradient(0,GY,0,H);
  vig.addColorStop(0,'transparent'); vig.addColorStop(1,'rgba(0,0,0,0.6)');
  ctx.fillStyle=vig; ctx.fillRect(0,GY,W,H-GY);
}

// ─── 3D PIPE DRAWING ─────────────────────────────────────────
function drawPipeSegment(ctx, x1,y1, x2,y2, leaking, highP, W) {
  const dx=x2-x1, dy=y2-y1;
  const len=Math.hypot(dx,dy); if(len<1) return;
  const nx=-dy/len, ny=dx/len;
  const thick = W*0.015;   // pipe radius in px

  // ─ Outer light glow ─
  const glowColor = leaking ? 'rgba(239,68,68,0.25)' : highP ? 'rgba(245,158,11,0.18)' : 'rgba(30,80,160,0.14)';
  const glowW = thick * (leaking ? 2.8 : 1.8);
  ctx.save(); ctx.filter=`blur(${leaking?6:3}px)`;
  ctx.beginPath();
  ctx.moveTo(x1+nx*glowW,y1+ny*glowW); ctx.lineTo(x2+nx*glowW,y2+ny*glowW);
  ctx.lineTo(x2-nx*glowW,y2-ny*glowW); ctx.lineTo(x1-nx*glowW,y1-ny*glowW);
  ctx.closePath(); ctx.fillStyle=glowColor; ctx.fill();
  ctx.restore();

  // ─ Drop shadow ─
  const so=thick*0.7;
  ctx.beginPath();
  ctx.moveTo(x1+nx*thick+so,y1+ny*thick+so*2);
  ctx.lineTo(x2+nx*thick+so,y2+ny*thick+so*2);
  ctx.lineTo(x2-nx*thick+so,y2-ny*thick+so*2);
  ctx.lineTo(x1-nx*thick+so,y1-ny*thick+so*2);
  ctx.closePath(); ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fill();

  // ─ Pipe body — layered gradients for a 3D tube look ─
  // Bottom dark layer
  ctx.beginPath();
  ctx.moveTo(x1+nx*thick,y1+ny*thick); ctx.lineTo(x2+nx*thick,y2+ny*thick);
  ctx.lineTo(x2-nx*thick,y2-ny*thick); ctx.lineTo(x1-nx*thick,y1-ny*thick);
  ctx.closePath();
  const bodyGrd = ctx.createLinearGradient(x1+nx*thick,y1+ny*thick,x1-nx*thick,y1-ny*thick);
  bodyGrd.addColorStop(0,   '#0e1a28');
  bodyGrd.addColorStop(0.18,'#243d5a');
  bodyGrd.addColorStop(0.5, '#1a3050');
  bodyGrd.addColorStop(0.82,'#243d5a');
  bodyGrd.addColorStop(1,   '#0a1420');
  ctx.fillStyle=bodyGrd; ctx.fill();

  // ─ Top specular highlight ─
  const hOff = thick*0.52, hW = thick*0.22;
  ctx.beginPath();
  ctx.moveTo(x1+nx*hOff+nx*hW,y1+ny*hOff+ny*hW);
  ctx.lineTo(x2+nx*hOff+nx*hW,y2+ny*hOff+ny*hW);
  ctx.lineTo(x2+nx*hOff-nx*hW,y2+ny*hOff-ny*hW);
  ctx.lineTo(x1+nx*hOff-nx*hW,y1+ny*hOff-ny*hW);
  ctx.closePath();
  const hiGrd=ctx.createLinearGradient(x1,y1,x2,y2);
  hiGrd.addColorStop(0,'rgba(150,200,255,0.0)');
  hiGrd.addColorStop(0.25,'rgba(150,200,255,0.35)');
  hiGrd.addColorStop(0.75,'rgba(150,200,255,0.35)');
  hiGrd.addColorStop(1,'rgba(150,200,255,0.0)');
  ctx.fillStyle=hiGrd; ctx.fill();

  // ─ Animated rust/leak pulse overlay ─
  if(leaking){
    const t=(Math.sin(Date.now()/220)+1)/2;
    ctx.beginPath();
    ctx.moveTo(x1+nx*thick,y1+ny*thick); ctx.lineTo(x2+nx*thick,y2+ny*thick);
    ctx.lineTo(x2-nx*thick,y2-ny*thick); ctx.lineTo(x1-nx*thick,y1-ny*thick);
    ctx.closePath();
    ctx.fillStyle=`rgba(239,68,68,${0.10+t*0.30})`; ctx.fill();
  }

  // ─ Pipe end caps (round flanges) ─
  const capR = thick * 1.15;
  [[x1,y1],[x2,y2]].forEach(([cx,cy])=>{
    ctx.save(); ctx.filter='none';
    // Flange shadow
    ctx.beginPath(); ctx.arc(cx+so*0.5,cy+so,capR,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fill();
    // Flange body
    const fg=ctx.createRadialGradient(cx-capR*0.3,cy-capR*0.3,capR*0.05,cx,cy,capR);
    fg.addColorStop(0,'#3d5f80'); fg.addColorStop(0.5,'#1e3a5a'); fg.addColorStop(1,'#0a1828');
    ctx.beginPath(); ctx.arc(cx,cy,capR,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill();
    // Flange ring
    ctx.beginPath(); ctx.arc(cx,cy,capR,0,Math.PI*2);
    ctx.strokeStyle='#2a4a6a'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.restore();
  });
}

// ─── SENSOR LED / BADGE ─────────────────────────────────────
const SENSOR_COLORS = { pressure:'#3b9eff', acoustic:'#22c55e', flow:'#f59e0b' };
const SENSOR_STATUS_COLORS = { normal:null, highpressure:'#f59e0b', leak:'#ef4444', offline:'#475569' };

function sensorColor(s) {
  if(s.status==='offline') return '#475569';
  if(s.status==='leak') return '#ef4444';
  if(s.status==='highpressure') return '#f59e0b';
  return SENSOR_COLORS[s.type] || '#22c55e';
}

function drawSensor(ctx, s, x, y, W) {
  const col = sensorColor(s);
  const r   = W * (s.featured ? 0.024 : 0.017);

  // Leak: expanding pulse rings
  if(s.status==='leak'){
    for(let i=0;i<3;i++){
      const phase=((Date.now()/800)+i*0.33)%1;
      ctx.beginPath(); ctx.arc(x,y,r+phase*r*3.5,0,Math.PI*2);
      ctx.strokeStyle=`rgba(239,68,68,${(1-phase)*0.75})`; ctx.lineWidth=2; ctx.stroke();
    }
    // Red hot ground glow
    const glow=ctx.createRadialGradient(x,y+r*2,0,x,y+r*2,r*5);
    glow.addColorStop(0,`rgba(239,68,68,${0.25+Math.sin(Date.now()/200)*0.12})`);
    glow.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(x,y+r*2,r*5,0,Math.PI*2); ctx.fillStyle=glow; ctx.fill();
  }

  // High pressure pulse
  if(s.status==='highpressure'){
    const ph=(Math.sin(Date.now()/350)+1)/2;
    ctx.beginPath(); ctx.arc(x,y,r*2.4,0,Math.PI*2);
    ctx.strokeStyle=`rgba(245,158,11,${0.15+ph*0.35})`; ctx.lineWidth=1.5; ctx.stroke();
  }

  // Outer glow halo
  const gldR=ctx.createRadialGradient(x,y,0,x,y,r*3.5);
  gldR.addColorStop(0,col+'88'); gldR.addColorStop(0.4,col+'33'); gldR.addColorStop(1,'transparent');
  ctx.beginPath(); ctx.arc(x,y,r*3.5,0,Math.PI*2); ctx.fillStyle=gldR; ctx.fill();

  // Dark surround ring
  ctx.beginPath(); ctx.arc(x,y,r+3,0,Math.PI*2); ctx.fillStyle='#050a12'; ctx.fill();

  // White ring (like reference image)
  ctx.beginPath(); ctx.arc(x,y,r+1.5,0,Math.PI*2);
  ctx.strokeStyle='rgba(200,220,255,0.6)'; ctx.lineWidth=1.5; ctx.stroke();

  // LED body
  const lg=ctx.createRadialGradient(x-r*0.3,y-r*0.35,r*0.05,x,y,r);
  lg.addColorStop(0,lightenHex(col,70)); lg.addColorStop(0.45,col); lg.addColorStop(1,darkenHex(col,55));
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=lg; ctx.fill();

  // Inner type ring (to distinguish type visually)
  ctx.beginPath(); ctx.arc(x,y,r*0.5,0,Math.PI*2);
  ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=1.2; ctx.stroke();

  // Specular
  ctx.beginPath(); ctx.arc(x-r*0.28,y-r*0.30,r*0.26,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fill();

  // Label
  if(s.status==='leak' || s.featured || s===tooltipSensor){
    ctx.save();
    ctx.font=`bold ${Math.max(9,W*0.011)}px Segoe UI`;
    ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=6;
    ctx.fillStyle=s.status==='leak'?'#ff6060':'#ffffff';
    ctx.textAlign='center';
    ctx.fillText(s.label, x, y-r-6);
    ctx.restore();
  }
}

function lightenHex(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+a)},${Math.min(255,g+a)},${Math.min(255,b+a)})`;
}
function darkenHex(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,r-a)},${Math.max(0,g-a)},${Math.max(0,b-a)})`;
}

// ─── LEAK EFFECT (dripping water) ───────────────────────────
function drawLeakEffects(ctx, W, H) {
  state.sensors.filter(s=>s.status==='leak').forEach(s=>{
    const x=s.nx*W, y=s.ny*H;
    const t=Date.now();

    // Water drips
    for(let d=0;d<6;d++){
      const prog=((t/500+d*0.16)%1);
      const dx=(Math.sin(d*1.4)*W*0.008)*(0.5+prog*0.5);
      const dy=prog*H*0.08;
      const alpha=Math.max(0,(1-prog*1.2)*0.9);
      const dr=W*(0.004*(1-prog*0.6));
      if(alpha>0.05){
        ctx.beginPath(); ctx.arc(x+dx,y+dy,dr,0,Math.PI*2);
        ctx.fillStyle=`rgba(80,160,240,${alpha})`; ctx.fill();
        // Teardrop tail
        if(prog>0.1){
          ctx.beginPath(); ctx.moveTo(x+dx,y+dy-dr); ctx.lineTo(x+dx,y+dy-dr*3.5);
          ctx.strokeStyle=`rgba(80,160,240,${alpha*0.5})`; ctx.lineWidth=dr*1.2; ctx.lineCap='round'; ctx.stroke();
        }
      }
    }

    // Puddle / splash
    const rProg=((t/600)%1);
    const pudR=W*0.012+rProg*W*0.022;
    ctx.beginPath(); ctx.ellipse(x,y+H*0.08,pudR,pudR*0.3,0,0,Math.PI*2);
    ctx.strokeStyle=`rgba(80,160,240,${(1-rProg)*0.55})`; ctx.lineWidth=1.5; ctx.stroke();

    // Mud stain
    const mudGrd=ctx.createRadialGradient(x,y+H*0.05,0,x,y+H*0.05,W*0.025);
    mudGrd.addColorStop(0,'rgba(60,30,10,0.4)'); mudGrd.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(x,y+H*0.05,W*0.025,0,Math.PI*2);
    ctx.fillStyle=mudGrd; ctx.fill();
  });
}

// ─── OVERLAY LABELS ──────────────────────────────────────────
function drawOverlayLabels(ctx, W, H) {
  const GY=GROUND_Y*H;

  // "HOME SYSTEM OVERVIEW" top-left label
  ctx.save();
  ctx.font=`bold ${Math.max(11,W*0.013)}px Segoe UI`;
  ctx.fillStyle='rgba(255,255,255,0.85)';
  ctx.textAlign='left';
  ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=5;
  ctx.fillText('HOME SYSTEM OVERVIEW', W*0.01, GY+H*0.055);
  ctx.restore();

  // Water main in arrow (left)
  drawArrowLabel(ctx,'WATER\nMAIN IN', W*0.005, GY+H*0.18, 'right', W);
  // Water main out arrow (right)
  drawArrowLabel(ctx,'WATER\nMAIN OUT', W*0.995, GY+H*0.18, 'left', W);

  // Irrigation label
  const irrSensor = state.sensors[13]; // S14
  if(irrSensor){
    const ix=irrSensor.nx*W, iy=irrSensor.ny*H;
    ctx.save();
    ctx.strokeStyle='rgba(80,150,80,0.6)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.rect(ix-W*0.055, iy-H*0.015, W*0.11, H*0.05);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.font=`${Math.max(8,W*0.009)}px Segoe UI`;
    ctx.fillStyle='rgba(180,255,180,0.8)'; ctx.textAlign='center';
    ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=4;
    ctx.fillText('IRRIGATION', ix, iy+H*0.06);
    ctx.fillText('SYSTEM', ix, iy+H*0.075);
    ctx.restore();
  }
}

function drawArrowLabel(ctx, text, x, y, dir, W) {
  ctx.save();
  ctx.font=`bold ${Math.max(8,W*0.009)}px Segoe UI`;
  ctx.fillStyle='rgba(255,255,255,0.80)';
  ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=5;
  ctx.textAlign=dir==='right'?'left':'right';
  const arrLen=W*0.035;
  const ax=dir==='right'?x+arrLen:x-arrLen;
  // Arrow
  ctx.beginPath(); ctx.moveTo(x,y);
  ctx.lineTo(dir==='right'?x+arrLen*0.8:x-arrLen*0.8,y);
  ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1.5;
  ctx.stroke();
  ctx.beginPath();
  if(dir==='right'){ ctx.moveTo(x+arrLen,y); ctx.lineTo(x+arrLen*0.6,y-4); ctx.lineTo(x+arrLen*0.6,y+4); }
  else { ctx.moveTo(x-arrLen,y); ctx.lineTo(x-arrLen*0.6,y-4); ctx.lineTo(x-arrLen*0.6,y+4); }
  ctx.closePath(); ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.fill();
  // Text
  const lines=text.split('\n');
  lines.forEach((l,i)=>{
    ctx.fillText(l, dir==='right'?x+arrLen+6:x-arrLen-6, y-5+i*13);
  });
  ctx.restore();
}

// ─── LEAK ANNOTATION BUBBLE ──────────────────────────────────
function drawLeakBubbles(ctx, W, H) {
  state.sensors.filter(s=>s.status==='leak').forEach(s=>{
    const x=s.nx*W, y=s.ny*H;
    const bW=W*0.18, bH=H*0.12;
    let bx=x+W*0.02, by=y-H*0.16;
    if(bx+bW>W*0.95) bx=x-bW-W*0.02;
    if(by<H*0.02) by=y+H*0.04;

    // Box background
    ctx.save();
    ctx.fillStyle='rgba(8,12,20,0.92)';
    ctx.strokeStyle='#ef4444';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.roundRect(bx,by,bW,bH,8);
    ctx.fill(); ctx.stroke();

    // Red glow on border
    ctx.shadowColor='#ef4444'; ctx.shadowBlur=10;
    ctx.strokeStyle='#ef4444'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(bx+2,by+2,bW-4,bH-4,6); ctx.stroke();
    ctx.shadowBlur=0;

    // Title
    ctx.font=`bold ${Math.max(9,W*0.011)}px Segoe UI`;
    ctx.fillStyle='#ef4444'; ctx.textAlign='left';
    ctx.fillText('LEAK DETECTED', bx+10, by+18);

    // Details
    ctx.font=`${Math.max(8,W*0.009)}px Segoe UI`;
    ctx.fillStyle='#ffaaaa';
    ctx.fillText(`Location: ${s.pipe}`, bx+10, by+bH*0.50);
    ctx.fillStyle='#ff8888';
    ctx.fillText(`Probability: ${(s.leakProb*100).toFixed(0)}%`, bx+10, by+bH*0.75);

    // Connector line
    const cx2=bx<x?bx+bW:bx, cy2=by+bH/2;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(cx2,cy2);
    ctx.strokeStyle='rgba(239,68,68,0.7)'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });
}

// ─── SENSOR TYPE LEGEND ──────────────────────────────────────
function drawLegendPanel(ctx, W, H) {
  const GY=GROUND_Y*H;
  const lx=W*0.01, ly=GY-H*0.44;
  const lW=W*0.14, lH=H*0.27;
  const pad=H*0.025;

  ctx.save();
  ctx.fillStyle='rgba(5,12,25,0.82)';
  ctx.strokeStyle='rgba(40,80,130,0.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(lx,ly,lW,lH,8); ctx.fill(); ctx.stroke();

  ctx.font=`bold ${Math.max(8,W*0.009)}px Segoe UI`;
  ctx.fillStyle='rgba(200,220,255,0.9)'; ctx.textAlign='left';
  ctx.fillText('SENSOR TYPES', lx+pad, ly+pad*1.6);

  const types=[
    {col:'#3b9eff', label:'Pressure Sensor'},
    {col:'#22c55e', label:'Acoustic Sensor'},
    {col:'#f59e0b', label:'Flow Sensor'},
  ];
  types.forEach((t,i)=>{
    const ty=ly+pad*2.8+i*pad*1.6;
    // Mini LED
    const lg=ctx.createRadialGradient(lx+pad+6,ty,0,lx+pad+6,ty,6);
    lg.addColorStop(0,lightenHex(t.col,60)); lg.addColorStop(1,t.col);
    ctx.beginPath(); ctx.arc(lx+pad+6,ty,5.5,0,Math.PI*2); ctx.fillStyle=lg; ctx.fill();
    ctx.beginPath(); ctx.arc(lx+pad+6,ty,5.5,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=1; ctx.stroke();
    ctx.font=`${Math.max(7,W*0.008)}px Segoe UI`;
    ctx.fillStyle='rgba(180,210,255,0.85)';
    ctx.fillText(t.label, lx+pad+15, ty+4);
  });
  ctx.restore();
}

// ─── MAIN DRAW ───────────────────────────────────────────────
function drawPipe() {
  const W=pipeCanvas.width, H=pipeCanvas.height;
  const ctx=pipeCtx;
  ctx.clearRect(0,0,W,H);

  // 1. Background (sky + house + soil)
  drawBackground(ctx,W,H);

  // 2. Pipe segments (behind sensors)
  // Sort: draw segments connected to deeper sensors first
  const sortedSegs=[...VALID_SEGS].sort(([a1,b1],[a2,b2])=>{
    const avgY1=(state.sensors[a1]?.ny||0)+(state.sensors[b1]?.ny||0);
    const avgY2=(state.sensors[a2]?.ny||0)+(state.sensors[b2]?.ny||0);
    return avgY1-avgY2;
  });
  sortedSegs.forEach(([ai,bi])=>{
    const a=state.sensors[ai], b=state.sensors[bi];
    if(!a||!b) return;
    const leaking=a.status==='leak'||b.status==='leak';
    const highP=a.status==='highpressure'||b.status==='highpressure';
    drawPipeSegment(ctx,a.nx*W,a.ny*H,b.nx*W,b.ny*H,leaking,highP,W);
  });

  // 3. Leak water effects
  drawLeakEffects(ctx,W,H);

  // 4. Sensors on top of pipes
  [...state.sensors].sort((a,b)=>a.ny-b.ny).forEach(s=>{
    drawSensor(ctx,s,s.nx*W,s.ny*H,W);
  });

  // 5. Leak annotation bubbles
  drawLeakBubbles(ctx,W,H);

  // 6. Labels / overlays
  drawOverlayLabels(ctx,W,H);

  // 7. Sensor type legend
  drawLegendPanel(ctx,W,H);
}

function animationLoop(){ drawPipe(); requestAnimationFrame(animationLoop); }

// Canvas click
pipeCanvas.addEventListener('click',(e)=>{
  const rect=pipeCanvas.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const W=pipeCanvas.width, H=pipeCanvas.height;
  let closest=null, best=24;
  state.sensors.forEach(s=>{
    const d=Math.hypot(s.nx*W-mx,s.ny*H-my);
    if(d<best){best=d;closest=s;}
  });
  tooltipSensor=closest;
  if(closest) showSensorTooltip(closest,e.clientX,e.clientY);
  else document.getElementById('leakTooltip').style.display='none';
});

function showSensorTooltip(s,cx,cy){
  const tip=document.getElementById('leakTooltip');
  const rect=pipeCanvas.getBoundingClientRect();
  const body=document.getElementById('tooltipContent');
  const col=sensorColor(s);
  body.innerHTML=`
    <div>Status: <strong style="color:${col}">${s.status.toUpperCase()}</strong></div>
    <div>Sensor: <strong>${s.id} (${s.label})</strong></div>
    <div>Type: <strong style="color:${SENSOR_COLORS[s.type]||'#fff'}">${s.type.toUpperCase()}</strong></div>
    <div>Location: ${s.loc}</div>
    <div>Pressure: <strong>${s.psi.toFixed(1)} PSI</strong></div>
    <div>Noise: <strong>${(s.noise*100).toFixed(0)}%</strong></div>
    ${s.status==='leak'?`<div>Leak Prob: <strong style="color:#ef4444">${(s.leakProb*100).toFixed(0)}%</strong></div>`:''}
  `;
  tip.style.display='block'; tip.style.borderColor=col;
  const titEl=tip.querySelector('.leak-tooltip-title');
  if(s.status==='leak'){titEl.textContent='🔴 LEAK DETECTED';titEl.style.color='#ef4444';}
  else{const ico=s.status==='normal'?'🟢':s.status==='highpressure'?'🟡':'⚫';titEl.textContent=`${ico} SENSOR ${s.id}`;titEl.style.color=col;}
  const px2=cx-rect.left, py2=cy-rect.top;
  tip.style.left=Math.min(px2+14,rect.width-200)+'px';
  tip.style.top=Math.max(py2-90,4)+'px';
}

// ─── GAUGE ───────────────────────────────────────────────────
const gaugeCanvas=document.getElementById('gaugeCanvas');
const gaugeCtx=gaugeCanvas.getContext('2d');
function drawGauge(prob){
  const W=gaugeCanvas.width,H=gaugeCanvas.height,cx=W/2,cy=H-14,r=Math.min(W,H*2)*0.40;
  gaugeCtx.clearRect(0,0,W,H);
  gaugeCtx.beginPath();gaugeCtx.arc(cx,cy,r,Math.PI,2*Math.PI);
  gaugeCtx.strokeStyle='#1f2d45';gaugeCtx.lineWidth=16;gaugeCtx.lineCap='round';gaugeCtx.stroke();
  const grad=gaugeCtx.createLinearGradient(cx-r,cy,cx+r,cy);
  grad.addColorStop(0,'#22c55e');grad.addColorStop(0.5,'#f59e0b');grad.addColorStop(1,'#ef4444');
  gaugeCtx.beginPath();gaugeCtx.arc(cx,cy,r,Math.PI,Math.PI+Math.PI*Math.min(prob,1));
  gaugeCtx.strokeStyle=grad;gaugeCtx.lineWidth=16;gaugeCtx.lineCap='round';gaugeCtx.stroke();
  const angle=Math.PI+Math.PI*Math.min(prob,1);
  gaugeCtx.beginPath();gaugeCtx.moveTo(cx,cy);gaugeCtx.lineTo(cx+r*Math.cos(angle),cy+r*Math.sin(angle));
  gaugeCtx.strokeStyle='#fff';gaugeCtx.lineWidth=2.5;gaugeCtx.stroke();
  gaugeCtx.beginPath();gaugeCtx.arc(cx,cy,5,0,Math.PI*2);gaugeCtx.fillStyle='#fff';gaugeCtx.fill();
  const pct=Math.round(prob*100);
  const color=prob<0.4?'#22c55e':prob<0.7?'#f59e0b':'#ef4444';
  const lbl=prob<0.4?'Low Risk':prob<0.7?'Monitoring':'High Probability';
  document.getElementById('gaugePct').textContent=pct+'%';
  document.getElementById('gaugePct').style.color=color;
  document.getElementById('gaugeLabel').textContent=lbl;
  document.getElementById('gaugeLabel').style.color=color;
  document.getElementById('gaugeNote').textContent=prob<0.4
    ?'All sensors reading normal. System monitoring continuously.'
    :prob<0.7?'Elevated pressure detected. AI analyzing patterns.'
    :'AI analysis indicates a possible leak in the highlighted area.';
}

// ─── PRESSURE CHART ──────────────────────────────────────────
const pressureCanvas=document.getElementById('pressureChart');
const pressCtx=pressureCanvas.getContext('2d');
const MAX_PDATA=60;
function initPressureData(){for(let i=0;i<MAX_PDATA;i++)state.pressureData.push(40+Math.random()*8);}
function drawPressureChart(highlight){
  const W=pressureCanvas.offsetWidth||260,H=80;
  pressureCanvas.width=W;pressureCanvas.height=H;
  pressCtx.clearRect(0,0,W,H);
  for(let g=0;g<=4;g++){const y=H-(g/4)*H;pressCtx.beginPath();pressCtx.moveTo(0,y);pressCtx.lineTo(W,y);pressCtx.strokeStyle='#1f2d45';pressCtx.lineWidth=1;pressCtx.stroke();}
  const data=state.pressureData,step=W/(data.length-1),toY=v=>H-(v/80)*H;
  pressCtx.beginPath();
  data.forEach((v,i)=>{i===0?pressCtx.moveTo(0,toY(v)):pressCtx.lineTo(i*step,toY(v));});
  pressCtx.lineTo(W,H);pressCtx.lineTo(0,H);pressCtx.closePath();
  const ag=pressCtx.createLinearGradient(0,0,0,H);
  ag.addColorStop(0,highlight?'rgba(239,68,68,0.25)':'rgba(59,158,255,0.18)');ag.addColorStop(1,'rgba(0,0,0,0)');
  pressCtx.fillStyle=ag;pressCtx.fill();
  pressCtx.beginPath();
  data.forEach((v,i)=>{i===0?pressCtx.moveTo(0,toY(v)):pressCtx.lineTo(i*step,toY(v));});
  pressCtx.strokeStyle=highlight?'#ef4444':'#3b9eff';pressCtx.lineWidth=1.8;pressCtx.stroke();
}

// ─── WAVEFORM ────────────────────────────────────────────────
const waveCanvas=document.getElementById('waveCanvas');
const waveCtx=waveCanvas.getContext('2d');
let wavePhase=0,isLeakWave=false,leakAmplitude=0;
function drawWave(){
  const W=waveCanvas.offsetWidth||260,H=60;
  waveCanvas.width=W;waveCanvas.height=H;waveCtx.clearRect(0,0,W,H);
  const cy=H/2;waveCtx.beginPath();
  for(let x=0;x<W;x++){
    const amp=isLeakWave?(8+leakAmplitude*18+Math.random()*10)*Math.abs(Math.sin(x/12)):(4+Math.random()*3)*Math.abs(Math.sin(x/25));
    const y=cy+amp*Math.sin((x/W)*Math.PI*(isLeakWave?5:1.5)*2+wavePhase);
    x===0?waveCtx.moveTo(x,y):waveCtx.lineTo(x,y);
  }
  waveCtx.strokeStyle=isLeakWave?'#ef4444':'#3b9eff';waveCtx.lineWidth=1.5;waveCtx.stroke();
  wavePhase+=isLeakWave?0.12:0.04;
  const conf=isLeakWave?Math.round(85+leakAmplitude*10):Math.round(5+Math.random()*10);
  document.getElementById('aiConfidence').textContent=`AI Confidence: ${conf}%`;
  document.getElementById('acousticStatus').textContent=isLeakWave?'🔴 Leak noise signature detected':'🟢 No leak signatures detected';
  document.getElementById('acousticStatus').style.color=isLeakWave?'#ef4444':'#22c55e';
}

// ─── SCAN SIMULATION ────────────────────────────────────────
function runScan(){
  state.totalScans++;
  const timeStr=new Date().toLocaleTimeString();
  document.getElementById('lastScan').textContent=timeStr;
  state.sensors.forEach(s=>{
    if(s.status==='leak'&&!s.keepLeak){s.status='normal';s.leakProb=0;s.noise=0.05+Math.random()*0.1;}
    s.keepLeak=false;
    if(Math.random()<0.07){s.status='highpressure';s.psi=68+Math.random()*12;}
    else if(s.status==='highpressure'&&Math.random()<0.5){s.status='normal';s.psi=40+Math.random()*8;}
  });
  let newLeaks=[];
  state.sensors.forEach(s=>{
    if(Math.random()<(1/LEAK_CHANCE)){s.status='leak';s.psi=20+Math.random()*18;s.noise=0.65+Math.random()*0.35;s.leakProb=0.72+Math.random()*0.28;newLeaks.push(s);}
    if(s.status==='normal'){s.psi=Math.max(30,Math.min(70,s.psi+(Math.random()-0.5)*3));s.noise=0.05+Math.random()*0.1;}
    s.lastPing=timeStr;
  });
  const leakSensors=state.sensors.filter(s=>s.status==='leak');
  const avgPsi=state.sensors.reduce((a,s)=>a+s.psi,0)/state.sensors.length;
  const newPsi=leakSensors.length>0?avgPsi*0.7+Math.random()*15:avgPsi+(Math.random()-0.5)*4;
  state.pressureData.push(newPsi);if(state.pressureData.length>MAX_PDATA)state.pressureData.shift();
  isLeakWave=leakSensors.length>0;leakAmplitude=leakSensors.length>0?leakSensors[0].leakProb:0;
  newLeaks.forEach(s=>{
    state.leaksFound++;
    const alert={time:timeStr,type:'leak',text:`High leak probability detected at ${s.pipe}`,sensor:s};
    state.alerts.unshift(alert);if(state.alerts.length>100)state.alerts.pop();
    addAlertRow(alert);showLeakModal(s);setDot(false);
    setTimeout(()=>{if(!hasLeaks())setDot(true);},SCAN_INTERVAL);
  });
  state.sensors.filter(s=>s.status==='highpressure').forEach(s=>{
    if(Math.random()<0.3){const a={time:timeStr,type:'high',text:`Pressure spike detected at ${s.pipe}`,sensor:s};state.alerts.unshift(a);if(state.alerts.length>100)state.alerts.pop();addAlertRow(a);}
  });
  if(newLeaks.length===0&&Math.random()<0.3){const a={time:timeStr,type:'ok',text:'System check completed — All sensors normal',sensor:null};state.alerts.unshift(a);if(state.alerts.length>100)state.alerts.pop();addAlertRow(a);}
  updateDashboard();renderSensorTable();updateBadge();
}

function hasLeaks(){return state.sensors.some(s=>s.status==='leak');}
function setDot(green){
  document.getElementById('liveDot').style.background=green?'#22c55e':'#ef4444';
  const lbl=document.getElementById('liveLabel');lbl.textContent=green?'Live':'ALERT';lbl.style.color=green?'#22c55e':'#ef4444';
}

function updateDashboard(){
  const leaks=state.sensors.filter(s=>s.status==='leak');
  const highP=state.sensors.filter(s=>s.status==='highpressure');
  const normal=state.sensors.filter(s=>s.status==='normal');
  const offline=state.sensors.filter(s=>s.status==='offline');
  const maxProb=leaks.length>0?Math.max(...leaks.map(s=>s.leakProb)):highP.length>0?0.35+Math.random()*0.15:0.02+Math.random()*0.08;
  drawGauge(maxProb);
  document.getElementById('statTotal').textContent=state.sensors.length;
  document.getElementById('statHighP').textContent=highP.length;
  document.getElementById('statLeak').textContent=leaks.length;
  document.getElementById('statNormal').textContent=normal.length;
  document.getElementById('statOffline').textContent=offline.length;
  document.getElementById('statHighPSub').textContent=highP.length>0?'Monitoring':'Normal';
  document.getElementById('statLeakSub').textContent=leaks.length>0?'ATTENTION':'—';
  document.getElementById('statLeakSub').style.color=leaks.length>0?'#ef4444':'#64748b';
  drawPressureChart(leaks.length>0);
  updateLeakLocationPanel(leaks);
  const sysText=document.getElementById('sysStatusText');
  sysText.textContent=leaks.length>0?`⚠ ${leaks.length} Leak${leaks.length>1?'s':''} Detected!`:highP.length>0?'⚡ Elevated Pressure':'● All Systems Operational';
  sysText.style.color=leaks.length>0?'#ef4444':highP.length>0?'#f59e0b':'#22c55e';
  document.getElementById('sensorsOnline').textContent=`${state.sensors.length-offline.length} / ${state.sensors.length}`;
}

function updateLeakLocationPanel(leaks){
  const panel=document.getElementById('leakLocationBody');
  if(leaks.length===0){panel.innerHTML='<div class="no-leak-msg">✅ No leaks detected currently</div>';return;}
  const s=leaks[0];
  const miniX=Math.round(s.nx*60)+5,miniY=Math.round(s.ny*60)+5;
  panel.innerHTML=`<div class="leak-mini-map"><div class="leak-mini-dot" style="left:${miniX}px;top:${miniY}px"></div></div><div class="leak-location-title">${s.pipe}</div><div class="leak-location-detail">${s.loc}<br>${(3.2-Math.random()*1.5).toFixed(1)} meters from main line<br><span style="color:#ef4444;font-weight:600">Probability: ${(s.leakProb*100).toFixed(0)}%</span></div>`;
}

const MAX_RECENT=6;
function addAlertRow(alert){
  const icon=alert.type==='leak'?'🔴':alert.type==='high'?'🟡':'🟢';
  const html=`<div class="alert-row"><span class="alert-time">${alert.time}</span><span class="alert-dot">${icon}</span><span>${alert.text}</span></div>`;
  const recent=document.getElementById('recentAlertsList');
  if(recent.querySelector('.alert-empty'))recent.innerHTML='';
  recent.insertAdjacentHTML('afterbegin',html);
  while(recent.children.length>MAX_RECENT)recent.lastChild.remove();
  const full=document.getElementById('fullAlertsList');
  if(full.querySelector('.alert-empty'))full.innerHTML='';
  full.insertAdjacentHTML('afterbegin',html);
}
function updateBadge(){
  const cnt=state.alerts.filter(a=>a.type==='leak').length;
  ['alertBadge','alertBadge2'].forEach(id=>{const el=document.getElementById(id);el.textContent=cnt>0?cnt:'';el.style.display=cnt>0?'':'none';});
}

let modalDismissTimer=null;
function showLeakModal(s){
  if(document.getElementById('leakModal').style.display==='flex')return;
  document.getElementById('modalBody').innerHTML=`<strong>Sensor ${s.id}</strong> — ${s.pipe}<br>Location: ${s.loc}<br>Pressure drop: ${s.psi.toFixed(1)} PSI<br>Leak probability: <strong style="color:#ef4444">${(s.leakProb*100).toFixed(0)}%</strong><br>Noise level: <strong>${(s.noise*100).toFixed(0)}%</strong><br><br><em style="color:#94a3b8">Contact your plumber with this sensor location to avoid unnecessary wall openings.</em>`;
  document.getElementById('leakModal').style.display='flex';
  if(modalDismissTimer)clearTimeout(modalDismissTimer);modalDismissTimer=setTimeout(dismissModal,10000);
}
function dismissModal(){document.getElementById('leakModal').style.display='none';if(modalDismissTimer)clearTimeout(modalDismissTimer);}

function renderSensorTable(){
  const tbody=document.getElementById('sensorTableBody');if(!tbody)return;
  tbody.innerHTML=state.sensors.map(s=>`<tr><td>${s.id}</td><td>${s.loc}</td><td><span class="status-pill ${s.status==='highpressure'?'high':s.status}">${s.status.toUpperCase()}</span></td><td>${s.psi.toFixed(1)}</td><td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:5px;background:#1f2d45;border-radius:3px"><div style="width:${(s.noise*100).toFixed(0)}%;height:100%;background:${s.status==='leak'?'#ef4444':s.status==='highpressure'?'#f59e0b':'#22c55e'};border-radius:3px"></div></div><span>${(s.noise*100).toFixed(0)}%</span></div></td><td>${s.lastPing}</td></tr>`).join('');
}

function renderAnalyticsPage(){
  const avgPsi=state.pressureData.length?(state.pressureData.reduce((a,b)=>a+b,0)/state.pressureData.length).toFixed(1):'—';
  document.getElementById('aTotalScans').textContent=state.totalScans;document.getElementById('aLeaksFound').textContent=state.leaksFound;
  document.getElementById('aFalseAlarms').textContent=Math.max(0,state.leaksFound-Math.floor(state.leaksFound*0.85));document.getElementById('aAvgPSI').textContent=avgPsi;
  const ac=document.getElementById('analyticsChart'),ctx2=ac.getContext('2d'),W=ac.offsetWidth||600,H=100;
  ac.width=W;ac.height=H;ctx2.clearRect(0,0,W,H);const d=state.pressureData;if(d.length<2)return;
  const step=W/(d.length-1);ctx2.beginPath();
  d.forEach((v,i)=>{i===0?ctx2.moveTo(0,H-(v/80)*H):ctx2.lineTo(i*step,H-(v/80)*H);});
  ctx2.strokeStyle='#3b9eff';ctx2.lineWidth=2;ctx2.stroke();
}

function renderHealthPage(){
  const items=[{icon:'📡',name:'24 Acoustic Sensors',detail:'All sensors online & responding',ok:true},{icon:'🔋',name:'Battery Level',detail:'98% — Estimated 14 months remaining',ok:true},{icon:'📶',name:'Network Connection',detail:'Signal strength: Excellent',ok:true},{icon:'🧠',name:'AI Engine',detail:'Model v4.1 — Last retrained: 3 days ago',ok:true},{icon:'💾',name:'Data Storage',detail:'4.2 GB used of 50 GB',ok:true},{icon:'☁️',name:'Cloud Sync',detail:'Last synced: just now',ok:true}];
  document.getElementById('healthItems').innerHTML=items.map(it=>`<div class="health-item"><div class="health-icon">${it.icon}</div><div><div class="health-name">${it.name}</div><div class="health-detail">${it.detail}</div></div><div class="health-status" style="color:${it.ok?'#22c55e':'#ef4444'}">${it.ok?'✓ OK':'✗ Issue'}</div></div>`).join('');
}

function updateScanInterval(v){SCAN_INTERVAL=v*1000;document.getElementById('scanIntervalVal').textContent=v+'s';restartTimer();}
function updateLeakChance(v){LEAK_CHANCE=parseInt(v);document.getElementById('leakChanceVal').textContent='1 in '+v;}
function toggleTheme(){}function setView(v){state.view=v;}
function toggle3D(is3d){state.is3D=is3d;document.getElementById('btn3d').classList.toggle('active',is3d);document.getElementById('btn2d').classList.toggle('active',!is3d);}
function zoomCanvas(){}
function restartTimer(){if(scanTimer)clearInterval(scanTimer);scanTimer=setInterval(runScan,SCAN_INTERVAL);}

function downloadReport(){
  const lines=['AquaDrop Session Report','=======================',`Date: ${new Date().toLocaleString()}`,`Total Scans: ${state.totalScans}`,`Leaks Detected: ${state.leaksFound}`,'','Alert Log:',...state.alerts.map(a=>`[${a.time}] ${a.text}`)];
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const a2=document.createElement('a');a2.href=url;a2.download='aquadrop_report.txt';a2.click();URL.revokeObjectURL(url);
}

function waveLoop(){drawWave();requestAnimationFrame(waveLoop);}

window.addEventListener('DOMContentLoaded',()=>{
  initSensors();initPressureData();
  resizePipeCanvas();
  window.addEventListener('resize',resizePipeCanvas);
  drawGauge(0.03);drawPressureChart(false);
  animationLoop();waveLoop();
  updateClock();setInterval(updateClock,1000);
  runScan();restartTimer();updateDashboard();
});