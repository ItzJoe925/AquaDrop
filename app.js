// ═══════════════════════════════════════════════════════════════
//  AquaDrop AI Leak Detection Simulator — app.js
//  Side-section cross-view renderer
// ═══════════════════════════════════════════════════════════════

let SCAN_INTERVAL = 20000;
let LEAK_CHANCE   = 50;
let scanTimer     = null;
//Version 3
const state = {
  sensors:[], alerts:[], totalScans:0, leaksFound:0,
  pressureData:[], is3D:true, view:'basement', startTime:Date.now(),
  insuranceEvents:[],
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
  // ── MUNICIPAL WATER ENTRY (far left, sub-floor) ──
  { id:'S01', label:'A-1', pipe:'Municipal Supply In',   loc:'West Utility Entry Point',       nx:0.07, ny:0.72, type:'pressure',  featured:false },
  // ── PRIMARY COOLING SUPPLY HEADER (upper run) ──
  { id:'S02', label:'A-2', pipe:'Primary Cooling Header',loc:'Header West Section',            nx:0.17, ny:0.63, type:'pressure',  featured:false },
  { id:'S03', label:'A-3', pipe:'Primary Cooling Header',loc:'Row A Cooling Feed',             nx:0.26, ny:0.63, type:'acoustic',  featured:false },
  { id:'S04', label:'A-4', pipe:'Primary Cooling Header',loc:'CRAC Unit 1 Supply',             nx:0.38, ny:0.63, type:'flow',      featured:false },
  { id:'S05', label:'A-5', pipe:'Primary Cooling Header',loc:'CRAC Unit 2 Supply',             nx:0.50, ny:0.63, type:'acoustic',  featured:false },
  { id:'S06', label:'B-3', pipe:'Section B-3',           loc:'Hot Aisle Containment Zone',    nx:0.60, ny:0.63, type:'acoustic',  featured:true  },
  { id:'S07', label:'A-7', pipe:'Primary Cooling Header',loc:'Row D Cooling Feed',             nx:0.71, ny:0.63, type:'flow',      featured:false },
  { id:'S08', label:'A-8', pipe:'Cooling Header Out',    loc:'Header East Section',            nx:0.86, ny:0.63, type:'pressure',  featured:false },
  // ── DISCHARGE EXIT (far right) ──
  { id:'S09', label:'K-1', pipe:'Discharge Main Out',    loc:'East Utility Exit Point',        nx:0.95, ny:0.72, type:'pressure',  featured:false },

  // ── CHILLED WATER RETURN LOOP (lower run) ──
  { id:'S10', label:'B-1', pipe:'Chilled Return West',   loc:'Return Loop West',               nx:0.17, ny:0.80, type:'pressure',  featured:false },
  { id:'S11', label:'B-2', pipe:'Chilled Return Mid',    loc:'UPS Room Branch',                nx:0.38, ny:0.80, type:'flow',      featured:false },
  { id:'S12', label:'B-4', pipe:'Chilled Return East',   loc:'Return Loop East',               nx:0.60, ny:0.80, type:'acoustic',  featured:false },
  { id:'S13', label:'B-5', pipe:'Chilled Return Far',    loc:'Return Loop Far East',           nx:0.80, ny:0.80, type:'pressure',  featured:false },

  // ── FIRE SUPPRESSION TAP ──
  { id:'S14', label:'C-1', pipe:'Fire Suppression Feed', loc:'FM200 Suppression System',       nx:0.38, ny:0.88, type:'flow',      featured:false },

  // ── VERTICAL RISERS (sub-floor up into server rooms) ──
  { id:'S15', label:'D-1', pipe:'Row A Riser Top',       loc:'Server Row A Overhead',          nx:0.26, ny:0.56, type:'acoustic',  featured:false },
  { id:'S16', label:'D-2', pipe:'CRAC-1 Riser Top',      loc:'CRAC Unit 1 Overhead',           nx:0.44, ny:0.56, type:'acoustic',  featured:false },
  { id:'S17', label:'D-3', pipe:'CRAC-2 Riser Top',      loc:'CRAC Unit 2 Overhead',           nx:0.54, ny:0.56, type:'flow',      featured:false },
  { id:'S18', label:'D-4', pipe:'Row D Riser Top',       loc:'Server Row D Overhead',          nx:0.71, ny:0.56, type:'acoustic',  featured:false },

  // ── GENERATOR COOLANT BRANCH (right side) ──
  { id:'S19', label:'E-1', pipe:'Generator Coolant Feed', loc:'Backup Generator Room',         nx:0.86, ny:0.78, type:'flow',      featured:false },
  { id:'S20', label:'E-2', pipe:'Generator Coolant Low',  loc:'Generator Floor Drain',         nx:0.86, ny:0.85, type:'acoustic',  featured:false },

  // ── MID-SECTION T-JUNCTIONS ──
  { id:'S21', label:'C-2', pipe:'Section C-2',            loc:'West Distribution Junction',    nx:0.17, ny:0.72, type:'flow',      featured:false },
  { id:'S22', label:'C-3', pipe:'Section C-3',            loc:'Central Distribution Junction', nx:0.60, ny:0.72, type:'pressure',  featured:false },
  { id:'S23', label:'C-4', pipe:'Section C-4',            loc:'East Distribution Junction',    nx:0.80, ny:0.72, type:'acoustic',  featured:false },
  { id:'S24', label:'C-5', pipe:'Section C-5',            loc:'Far East Distribution Junction',nx:0.93, ny:0.80, type:'flow',      featured:false },
];

// ── TOP-DOWN MAP LAYOUT OVERRIDE ────────────────────────────
// Reposition all sensors onto a clean rectilinear pipe grid (top-down map),
// matching the reference "Pipe Network Map". Positions are normalised (nx,ny).
const MAP_POS = [
  /*0  S01 entry*/ [0.07, 0.18],
  /*1  S02      */ [0.20, 0.18],
  /*2  S03      */ [0.34, 0.18],
  /*3  S04      */ [0.48, 0.18],
  /*4  S05      */ [0.62, 0.18],
  /*5  S06 feat */ [0.48, 0.42],
  /*6  S07      */ [0.76, 0.18],
  /*7  S08      */ [0.90, 0.18],
  /*8  S09      */ [0.20, 0.42],
  /*9  S10      */ [0.20, 0.62],
  /*10 S11      */ [0.34, 0.62],
  /*11 S12      */ [0.48, 0.62],
  /*12 S13      */ [0.62, 0.62],
  /*13 S14      */ [0.76, 0.62],
  /*14 S15      */ [0.34, 0.42],
  /*15 S16      */ [0.62, 0.42],
  /*16 S17      */ [0.76, 0.42],
  /*17 S18      */ [0.90, 0.62],
  /*18 S19      */ [0.20, 0.84],
  /*19 S20      */ [0.34, 0.84],
  /*20 S21      */ [0.48, 0.84],
  /*21 S22      */ [0.62, 0.84],
  /*22 S23      */ [0.76, 0.84],
  /*23 S24      */ [0.90, 0.84],
];
SENSOR_DEFS.forEach((d, i) => { if (MAP_POS[i]) { d.nx = MAP_POS[i][0]; d.ny = MAP_POS[i][1]; } });

// ── Pipe segment connections (orthogonal grid, pairs of sensor indices) ──
const PIPE_SEGS = [
  // Top header run
  [0,1],[1,2],[2,3],[3,4],[4,6],[6,7],
  // Mid header run
  [8,14],[14,5],[5,15],[15,16],
  // Lower header run
  [9,10],[10,11],[11,12],[12,13],[13,17],
  // Bottom header run
  [18,19],[19,20],[20,21],[21,22],[22,23],
  // Vertical risers: top -> mid
  [1,8],[2,14],[3,5],[4,15],[6,16],
  // Vertical risers: mid -> lower
  [8,9],[14,10],[5,11],[15,12],[16,13],
  // Right edge riser
  [7,17],
  // Vertical risers: lower -> bottom
  [9,18],[10,19],[11,20],[12,21],[13,22],[17,23],
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

// ─── BACKGROUND: EXTERIOR DATA CENTER + UNDERGROUND ──────────
function drawBackground(ctx, W, H) {
  // Deep navy map base
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c1422');
  bg.addColorStop(1, '#070b14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle blueprint grid
  ctx.save();
  ctx.strokeStyle = 'rgba(60,110,170,0.07)';
  ctx.lineWidth = 1;
  const step = W * 0.045;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();

  // Zone regions
  drawZone(ctx, W, H, W*0.03,  H*0.06, W*0.55, H*0.50, 'ZONE A');
  drawZone(ctx, W, H, W*0.66,  H*0.06, W*0.31, H*0.74, 'ZONE B');
  drawZone(ctx, W, H, W*0.10,  H*0.70, W*0.50, H*0.26, 'ZONE C');

  // Soft inner vignette
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.9);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function drawZone(ctx, W, H, x, y, w, h, label) {
  ctx.save();
  ctx.fillStyle = 'rgba(40,80,130,0.05)';
  ctx.strokeStyle = 'rgba(70,120,180,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 ${Math.max(11, W*0.014)}px Segoe UI, sans-serif`;
  ctx.fillStyle = 'rgba(120,160,210,0.45)';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 12, y + h - 12);
  ctx.restore();
}

// ─── TOP-DOWN METALLIC PIPE ─────────────────────────────────
function drawPipeSegment(ctx, x1, y1, x2, y2, leaking, highP, W) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy); if (len < 1) return;
  const ux = dx / len, uy = dy / len;     // along pipe
  const nx = -uy, ny = ux;                 // perpendicular
  const t = Math.max(6, W * 0.0125);       // half thickness
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

  ctx.save();
  ctx.lineCap = 'round';

  // Drop shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = t * 2 + 5;
  ctx.beginPath(); ctx.moveTo(x1 + 2, y1 + 3); ctx.lineTo(x2 + 2, y2 + 3); ctx.stroke();

  // Dark casing outline
  ctx.strokeStyle = '#0a1018';
  ctx.lineWidth = t * 2 + 2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

  // Metallic body — cross-section gradient
  const g = ctx.createLinearGradient(mx - nx * t, my - ny * t, mx + nx * t, my + ny * t);
  if (leaking) {
    g.addColorStop(0,'#3a0c0c'); g.addColorStop(0.4,'#a83232');
    g.addColorStop(0.5,'#f06464'); g.addColorStop(0.6,'#a83232'); g.addColorStop(1,'#2c0808');
  } else if (highP) {
    g.addColorStop(0,'#5a3a08'); g.addColorStop(0.4,'#c98a22');
    g.addColorStop(0.5,'#f5c060'); g.addColorStop(0.6,'#c98a22'); g.addColorStop(1,'#3a2606');
  } else {
    g.addColorStop(0,'#222a36'); g.addColorStop(0.32,'#5d6877');
    g.addColorStop(0.5,'#aab6c6'); g.addColorStop(0.68,'#5d6877'); g.addColorStop(1,'#1b222c');
  }
  ctx.strokeStyle = g;
  ctx.lineWidth = t * 2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

  // Specular highlight stripe
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = Math.max(1, t * 0.24);
  ctx.beginPath();
  ctx.moveTo(x1 - nx * t * 0.42, y1 - ny * t * 0.42);
  ctx.lineTo(x2 - nx * t * 0.42, y2 - ny * t * 0.42);
  ctx.stroke();

  // Leak glow
  if (leaking) {
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(239,68,68,0.45)';
    ctx.lineWidth = t * 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}

// Metallic junction disc drawn at each node where pipes meet
function drawJunction(ctx, x, y, W) {
  const r = Math.max(7, W * 0.014) + 1.5;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI*2);
  ctx.fillStyle = '#0a1018'; ctx.fill();
  const g = ctx.createRadialGradient(x - r*0.35, y - r*0.4, r*0.1, x, y, r);
  g.addColorStop(0, '#b6c2d2'); g.addColorStop(0.55, '#5d6877'); g.addColorStop(1, '#222a36');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r*0.4, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(20,28,38,0.7)'; ctx.fill();
  ctx.restore();
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
  const r   = W * (s.featured ? 0.020 : 0.016);

  // Leak: expanding pulse rings
  if(s.status==='leak'){
    for(let i=0;i<3;i++){
      const phase=((Date.now()/800)+i*0.33)%1;
      ctx.beginPath(); ctx.arc(x,y,r+phase*r*3.5,0,Math.PI*2);
      ctx.strokeStyle=`rgba(239,68,68,${(1-phase)*0.7})`; ctx.lineWidth=2; ctx.stroke();
    }
  }
  if(s.status==='highpressure'){
    const ph=(Math.sin(Date.now()/350)+1)/2;
    ctx.beginPath(); ctx.arc(x,y,r*2.2,0,Math.PI*2);
    ctx.strokeStyle=`rgba(245,158,11,${0.15+ph*0.35})`; ctx.lineWidth=1.5; ctx.stroke();
  }

  // Soft outer glow
  const gldR=ctx.createRadialGradient(x,y,0,x,y,r*2.6);
  gldR.addColorStop(0,col+'66'); gldR.addColorStop(0.5,col+'22'); gldR.addColorStop(1,'transparent');
  ctx.beginPath(); ctx.arc(x,y,r*2.6,0,Math.PI*2); ctx.fillStyle=gldR; ctx.fill();

  // White pin ring
  ctx.beginPath(); ctx.arc(x,y,r+2,0,Math.PI*2);
  ctx.fillStyle='#f4f8ff'; ctx.fill();

  // Colored body
  const lg=ctx.createRadialGradient(x-r*0.3,y-r*0.35,r*0.05,x,y,r);
  lg.addColorStop(0,lightenHex(col,55)); lg.addColorStop(0.5,col); lg.addColorStop(1,darkenHex(col,45));
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=lg; ctx.fill();

  // Sensor glyph: signal dot + two arcs
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,0.92)';
  ctx.fillStyle='rgba(255,255,255,0.92)';
  ctx.lineWidth=Math.max(1, r*0.13);
  ctx.beginPath(); ctx.arc(x, y+r*0.18, r*0.16, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y+r*0.18, r*0.42, Math.PI*1.18, Math.PI*1.82); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y+r*0.18, r*0.66, Math.PI*1.1, Math.PI*1.9); ctx.stroke();
  ctx.restore();

  // Label
  if(s.status==='leak' || s.featured || s===tooltipSensor){
    ctx.save();
    ctx.font=`bold ${Math.max(9,W*0.011)}px Segoe UI`;
    ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=6;
    ctx.fillStyle=s.status==='leak'?'#ff6060':'#dbe7ff';
    ctx.textAlign='center';
    ctx.fillText(s.label, x, y-r-7);
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

// ─── LEAK EFFECT (top-down coolant burst) ──────────────────
function drawLeakEffects(ctx, W, H) {
  state.sensors.filter(s=>s.status==='leak').forEach(s=>{
    const x=s.nx*W, y=s.ny*H;
    const t=Date.now();
    // Radial spray droplets
    for(let d=0;d<10;d++){
      const ang=(d/10)*Math.PI*2 + t/1400;
      const prog=((t/600+d*0.1)%1);
      const dist=prog*W*0.045;
      const alpha=Math.max(0,(1-prog)*0.85);
      const dr=W*(0.004*(1-prog*0.5));
      if(alpha>0.05){
        ctx.beginPath();
        ctx.arc(x+Math.cos(ang)*dist, y+Math.sin(ang)*dist, dr, 0, Math.PI*2);
        ctx.fillStyle=`rgba(40,200,180,${alpha})`; ctx.fill();
      }
    }
    // Expanding ripple ring
    const rProg=((t/700)%1);
    ctx.beginPath(); ctx.arc(x,y,W*0.012+rProg*W*0.04,0,Math.PI*2);
    ctx.strokeStyle=`rgba(40,200,180,${(1-rProg)*0.5})`; ctx.lineWidth=2; ctx.stroke();
    // Coolant stain
    const stainGrd=ctx.createRadialGradient(x,y,0,x,y,W*0.04);
    stainGrd.addColorStop(0,'rgba(30,120,110,0.35)'); stainGrd.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(x,y,W*0.04,0,Math.PI*2);
    ctx.fillStyle=stainGrd; ctx.fill();
  });
}

// ─── OVERLAY LABELS ──────────────────────────────────────────
function drawOverlayLabels(ctx, W, H) {
  ctx.save();
  ctx.font=`700 ${Math.max(11,W*0.014)}px Segoe UI, sans-serif`;
  ctx.fillStyle='rgba(180,210,245,0.92)';
  ctx.textAlign='left';
  ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=5;
  ctx.fillText('PIPE NETWORK MAP', W*0.025, H*0.072);
  ctx.font=`${Math.max(8,W*0.0095)}px Segoe UI`;
  ctx.fillStyle='rgba(110,150,195,0.6)';
  ctx.fillText('Top-down facility view · live sensor telemetry', W*0.025, H*0.072 + Math.max(13,W*0.016));
  ctx.restore();
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
  const items=[
    {col:'#22c55e', label:'Normal'},
    {col:'#3b9eff', label:'Monitoring'},
    {col:'#f59e0b', label:'High Pressure'},
    {col:'#ef4444', label:'Leak Detected'},
  ];
  const pad=H*0.026;
  const lW=W*0.145, lH=pad*1.6 + items.length*pad*1.4 + pad*0.4;
  const lx=W*0.985-lW, ly=H*0.985-lH;

  ctx.save();
  ctx.fillStyle='rgba(8,14,26,0.85)';
  ctx.strokeStyle='rgba(50,90,140,0.45)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(lx,ly,lW,lH,8); ctx.fill(); ctx.stroke();

  ctx.font=`bold ${Math.max(8,W*0.009)}px Segoe UI`;
  ctx.fillStyle='rgba(200,220,255,0.9)'; ctx.textAlign='left';
  ctx.fillText('STATUS', lx+pad, ly+pad*1.3);

  items.forEach((t,i)=>{
    const ty=ly+pad*2.4+i*pad*1.4;
    ctx.beginPath(); ctx.arc(lx+pad+5,ty,5,0,Math.PI*2);
    ctx.fillStyle=t.col; ctx.fill();
    ctx.beginPath(); ctx.arc(lx+pad+5,ty,5,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.stroke();
    ctx.font=`${Math.max(7,W*0.0085)}px Segoe UI`;
    ctx.fillStyle='rgba(190,215,255,0.85)';
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

  // 2b. Metallic junction discs at every node
  state.sensors.forEach(s=> drawJunction(ctx, s.nx*W, s.ny*H, W));

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
  const items=[{icon:'📡',name:'24 Acoustic Sensors',detail:'All sensors online & responding across sub-floor plenum',ok:true},{icon:'❄️',name:'Cooling System',detail:'Primary chilled water loop nominal — 7°C supply / 12°C return',ok:true},{icon:'📶',name:'Network Connection',detail:'Signal strength: Excellent — BACnet/IP link active',ok:true},{icon:'🧠',name:'AI Engine',detail:'Model v4.1 — Last retrained: 3 days ago',ok:true},{icon:'💾',name:'Data Storage',detail:'4.2 GB used of 50 GB',ok:true},{icon:'☁️',name:'Cloud Sync',detail:'Last synced: just now',ok:true},{icon:'🔥',name:'FM200 Suppression',detail:'Pressure nominal — 98% charge remaining',ok:true},{icon:'⚡',name:'UPS / Generator',detail:'UPS online — Generator tested 6 days ago',ok:true}];
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

function downloadInsuranceReport(){
  const leakAlerts=state.alerts.filter(a=>a.type==='leak');
  const lines=[
    'AquaDrop Insurance Leak History Report',
    '======================================',
    `Generated: ${new Date().toLocaleString()}`,
    `Monitoring Started: ${new Date(state.startTime).toLocaleString()}`,
    `Total Scans: ${state.totalScans}`,
    `Total Leaks Detected: ${state.leaksFound}`,
    `Active Leaks: ${state.sensors.filter(s=>s.status==='leak').length}`,
    '',
    'Date/Time | Sensor | Location | Pipe Section | Pressure (PSI) | Confidence',
    '---------------------------------------------------------------------------',
  ];
  if(leakAlerts.length===0){
    lines.push('No leak events recorded yet. System monitoring continuously.');
  } else {
    leakAlerts.forEach(a=>{
      const s=a.sensor;
      lines.push(`${a.time} | ${s?s.id:'—'} | ${s?s.location||s.pipe:'—'} | ${s?s.pipe:'—'} | ${s?s.psi.toFixed(1):'—'} | ${s?(s.leakProb*100).toFixed(0)+'%':'—'}`);
    });
  }
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const a2=document.createElement('a');a2.href=url;a2.download='aquadrop_insurance_report.txt';a2.click();URL.revokeObjectURL(url);
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
