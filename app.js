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

// ─── BACKGROUND: EXTERIOR DATA CENTER + UNDERGROUND ──────────
function drawBackground(ctx, W, H) {
  const GY = GROUND_Y * H;
  drawSky(ctx, W, GY);
  drawDataCenterExterior(ctx, W, GY);
  drawGroundSurface(ctx, W, H, GY);
  drawUnderground(ctx, W, H, GY);
}

// ── Sky with dusk gradient ────────────────────────────────────
function drawSky(ctx, W, GY) {
  const sky = ctx.createLinearGradient(0, 0, 0, GY);
  sky.addColorStop(0,   '#06090f');
  sky.addColorStop(0.35,'#0a1020');
  sky.addColorStop(0.75,'#0d1830');
  sky.addColorStop(1,   '#152540');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

  // Stars
  for (let i = 0; i < 80; i++) {
    const sx = ((i * 173.3) % W);
    const sy = ((i * 59.7) % (GY * 0.6));
    const sr = 0.4 + (i % 3) * 0.4;
    const sa = 0.3 + (i % 5) * 0.14;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2);
    ctx.fillStyle = `rgba(200,220,255,${sa})`; ctx.fill();
  }
  // Moon
  ctx.save();
  const moonX = W * 0.88, moonY = GY * 0.18, moonR = W * 0.022;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 4);
  moonGlow.addColorStop(0, 'rgba(200,220,255,0.12)');
  moonGlow.addColorStop(1, 'transparent');
  ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 4, 0, Math.PI*2);
  ctx.fillStyle = moonGlow; ctx.fill();
  const mg = ctx.createRadialGradient(moonX - moonR*0.3, moonY - moonR*0.3, moonR*0.1, moonX, moonY, moonR);
  mg.addColorStop(0, '#e8eeff'); mg.addColorStop(0.6, '#c0ccee'); mg.addColorStop(1, '#8090b0');
  ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, Math.PI*2);
  ctx.fillStyle = mg; ctx.fill();
  ctx.restore();
}

// ── Massive data center exterior ─────────────────────────────
function drawDataCenterExterior(ctx, W, GY) {
  const bL = W * 0.02, bR = W * 0.98, bW = bR - bL;
  const bTop = GY * 0.03, bH = GY - bTop;

  // ── Foundation / base plinth ──
  const plinthH = bH * 0.05;
  const plinthGrd = ctx.createLinearGradient(0, GY - plinthH, 0, GY);
  plinthGrd.addColorStop(0, '#1a2530'); plinthGrd.addColorStop(1, '#0d161e');
  ctx.fillStyle = plinthGrd;
  ctx.fillRect(bL - W*0.005, GY - plinthH, bW + W*0.01, plinthH);

  // ── Main wall — precast concrete panels ──
  const wallGrd = ctx.createLinearGradient(bL, bTop, bL, GY);
  wallGrd.addColorStop(0, '#2a3540');
  wallGrd.addColorStop(0.4, '#222d38');
  wallGrd.addColorStop(1, '#1a2530');
  ctx.fillStyle = wallGrd;
  ctx.fillRect(bL, bTop, bW, bH - plinthH);

  // Concrete panel grid — vertical seams
  ctx.strokeStyle = 'rgba(10,20,30,0.7)'; ctx.lineWidth = 1.5;
  const panelW = bW / 12;
  for (let p = 1; p < 12; p++) {
    const px = bL + p * panelW;
    ctx.beginPath(); ctx.moveTo(px, bTop); ctx.lineTo(px, GY - plinthH); ctx.stroke();
  }
  // Horizontal seams (3 courses)
  for (let r = 1; r <= 3; r++) {
    const ry = bTop + bH * (r * 0.24);
    ctx.beginPath(); ctx.moveTo(bL, ry); ctx.lineTo(bR, ry); ctx.stroke();
  }

  // Subtle wall surface texture — slight lighter highlight on each panel
  for (let p = 0; p < 12; p++) {
    const px = bL + p * panelW;
    const panelGrd = ctx.createLinearGradient(px + 2, bTop, px + panelW - 2, bTop);
    panelGrd.addColorStop(0, 'rgba(255,255,255,0.025)');
    panelGrd.addColorStop(0.5, 'rgba(255,255,255,0.055)');
    panelGrd.addColorStop(1, 'rgba(255,255,255,0.015)');
    ctx.fillStyle = panelGrd;
    ctx.fillRect(px + 1, bTop + 1, panelW - 2, bH - plinthH - 2);
  }

  // ── Parapet / roof edge ──
  const parapetH = bH * 0.05;
  const parapetGrd = ctx.createLinearGradient(0, bTop, 0, bTop + parapetH);
  parapetGrd.addColorStop(0, '#1a222c'); parapetGrd.addColorStop(1, '#12191f');
  ctx.fillStyle = parapetGrd;
  ctx.fillRect(bL - 4, bTop, bW + 8, parapetH);
  // Parapet top highlight
  ctx.strokeStyle = 'rgba(80,120,160,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bL-4, bTop); ctx.lineTo(bR+4, bTop); ctx.stroke();
  // Parapet bottom shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bL-4, bTop+parapetH); ctx.lineTo(bR+4, bTop+parapetH); ctx.stroke();

  // ── Rooftop HVAC chillers (large rectangular units) ──
  const roofTop = bTop - GY * 0.0;
  const chillerDefs = [
    { fx: 0.08, fw: 0.13 }, { fx: 0.25, fw: 0.16 }, { fx: 0.46, fw: 0.11 },
    { fx: 0.62, fw: 0.16 }, { fx: 0.83, fw: 0.12 },
  ];
  chillerDefs.forEach(({ fx, fw }) => {
    const cx = bL + bW * fx, cw = bW * fw, ch = GY * 0.07;
    const cy = bTop - ch + parapetH * 0.6;
    // Chiller body
    const cg = ctx.createLinearGradient(cx, cy, cx, cy + ch);
    cg.addColorStop(0, '#1e2e3c'); cg.addColorStop(1, '#131e28');
    ctx.fillStyle = cg; ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = '#0a1520'; ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, cw, ch);
    // Louvre / vent slats
    ctx.strokeStyle = 'rgba(30,60,90,0.8)'; ctx.lineWidth = 1;
    const slats = 6;
    for (let s = 1; s <= slats; s++) {
      const sy = cy + ch * (s / (slats + 1));
      ctx.beginPath(); ctx.moveTo(cx + cw*0.05, sy); ctx.lineTo(cx + cw*0.95, sy); ctx.stroke();
    }
    // Status light
    ctx.beginPath(); ctx.arc(cx + cw*0.9, cy + ch*0.15, 3, 0, Math.PI*2);
    ctx.fillStyle = '#22c55e'; ctx.fill();
    const lg = ctx.createRadialGradient(cx + cw*0.9, cy + ch*0.15, 0, cx + cw*0.9, cy + ch*0.15, 8);
    lg.addColorStop(0, 'rgba(34,197,94,0.4)'); lg.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(cx + cw*0.9, cy + ch*0.15, 8, 0, Math.PI*2);
    ctx.fillStyle = lg; ctx.fill();
  });

  // ── Cooling towers / CTUs at top ──
  const towerDefs = [{ fx: 0.37 }, { fx: 0.56 }];
  towerDefs.forEach(({ fx }) => {
    const tx = bL + bW * fx, tw = bW * 0.06, th = GY * 0.11;
    const ty = bTop - th + parapetH * 0.5;
    const tg = ctx.createLinearGradient(tx, ty, tx, ty + th);
    tg.addColorStop(0, '#1a2838'); tg.addColorStop(0.5, '#152030'); tg.addColorStop(1, '#0e1820');
    ctx.fillStyle = tg; ctx.fillRect(tx - tw/2, ty, tw, th);
    ctx.strokeStyle = '#0a1520'; ctx.lineWidth = 1;
    ctx.strokeRect(tx - tw/2, ty, tw, th);
    // Circular fan grille on top
    ctx.beginPath(); ctx.ellipse(tx, ty + th * 0.25, tw*0.38, tw*0.38, 0, 0, Math.PI*2);
    ctx.strokeStyle = '#0e2030'; ctx.lineWidth = 1.5; ctx.stroke();
    // Animated rotation hint
    const angle = (Date.now() / 1200) % (Math.PI * 2);
    ctx.save();
    ctx.translate(tx, ty + th*0.25);
    ctx.rotate(angle);
    for (let b = 0; b < 4; b++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, tw*0.33);
      ctx.strokeStyle = 'rgba(40,80,120,0.7)'; ctx.lineWidth = tw*0.07; ctx.stroke();
    }
    ctx.restore();
    // Steam plume
    const t2 = Date.now() / 1000;
    for (let pl = 0; pl < 4; pl++) {
      const py = ty - pl * th * 0.18 - ((t2 * 0.5 + pl * 0.25) % 1) * th * 0.5;
      const pa = 0.06 - pl * 0.013;
      const pr = tw * (0.25 + pl * 0.12);
      if (pa > 0) {
        ctx.beginPath(); ctx.ellipse(tx + Math.sin(t2 + pl)*3, py, pr, pr*0.5, 0, 0, Math.PI*2);
        ctx.fillStyle = `rgba(180,200,220,${pa})`; ctx.fill();
      }
    }
  });

  // ── Pipes on building exterior wall (supply & return visible outside) ──
  drawExteriorWallPipes(ctx, W, GY, bL, bR, bH, bTop);

  // ── Security fence ──
  const fenceY = GY - plinthH * 0.3;
  ctx.strokeStyle = 'rgba(40,70,100,0.6)'; ctx.lineWidth = 1;
  // Left fence segment
  ctx.beginPath(); ctx.moveTo(0, fenceY); ctx.lineTo(bL, fenceY); ctx.stroke();
  // Right fence segment
  ctx.beginPath(); ctx.moveTo(bR, fenceY); ctx.lineTo(W, fenceY); ctx.stroke();
  // Fence posts
  for (let fp = 0; fp < W; fp += W*0.04) {
    if (fp < bL || fp > bR) {
      ctx.beginPath(); ctx.moveTo(fp, fenceY); ctx.lineTo(fp, fenceY - GY*0.03);
      ctx.strokeStyle = 'rgba(40,70,100,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // ── Entrance / loading dock ──
  const dockW = bW * 0.08, dockH = bH * 0.18;
  const dockX = bL + bW * 0.46, dockY = GY - plinthH - dockH;
  // Dock surround
  ctx.fillStyle = '#0e1820';
  ctx.fillRect(dockX - dockW*0.1, dockY - dockH*0.05, dockW*1.2, dockH*1.05 + plinthH);
  // Steel door
  const doorG = ctx.createLinearGradient(dockX, dockY, dockX + dockW, dockY);
  doorG.addColorStop(0, '#1a2838'); doorG.addColorStop(0.5, '#1e3048'); doorG.addColorStop(1, '#1a2838');
  ctx.fillStyle = doorG; ctx.fillRect(dockX, dockY, dockW, dockH);
  // Door panel ribs
  ctx.strokeStyle = '#0e1a28'; ctx.lineWidth = 1.2;
  for (let rib = 1; rib < 5; rib++) {
    const ry = dockY + dockH * (rib / 5);
    ctx.beginPath(); ctx.moveTo(dockX, ry); ctx.lineTo(dockX + dockW, ry); ctx.stroke();
  }
  ctx.strokeStyle = '#0a1520'; ctx.lineWidth = 2;
  ctx.strokeRect(dockX, dockY, dockW, dockH);
  // Security light above door
  ctx.beginPath(); ctx.arc(dockX + dockW*0.5, dockY - 6, 4, 0, Math.PI*2);
  ctx.fillStyle = '#f59e0b'; ctx.fill();
  const secGlow = ctx.createRadialGradient(dockX+dockW*0.5, dockY-6, 0, dockX+dockW*0.5, dockY-6, 30);
  secGlow.addColorStop(0, 'rgba(245,158,11,0.25)'); secGlow.addColorStop(1, 'transparent');
  ctx.beginPath(); ctx.arc(dockX+dockW*0.5, dockY-6, 30, 0, Math.PI*2);
  ctx.fillStyle = secGlow; ctx.fill();
  // "DATA CENTER" label on building
  ctx.save();
  ctx.font = `bold ${Math.max(13, W*0.018)}px Segoe UI, monospace`;
  ctx.fillStyle = 'rgba(160,200,240,0.55)';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '3px';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
  ctx.fillText('DATA CENTER  DC-01', bL + bW*0.5, bTop + bH*0.38);
  ctx.font = `${Math.max(9, W*0.010)}px Segoe UI`;
  ctx.fillStyle = 'rgba(100,150,180,0.40)';
  ctx.fillText('TIER III  ·  RESTRICTED ACCESS  ·  24/7 MONITORING', bL + bW*0.5, bTop + bH*0.46);
  ctx.restore();

  // Building outer shadow / edge
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2.5;
  ctx.strokeRect(bL, bTop, bW, bH - plinthH);
}

// ── Pipes visible on exterior wall (surface-mounted supply/return) ──
function drawExteriorWallPipes(ctx, W, GY, bL, bR, bH, bTop) {
  // Two large-diameter pipes run along the base of the building exterior
  // before going underground — supply (cold, blue) and return (warm, orange)
  const pipeY1 = GY - bH * 0.08; // chilled supply
  const pipeY2 = GY - bH * 0.04; // warm return
  const pR1 = W * 0.018; // supply pipe radius
  const pR2 = W * 0.013; // return pipe radius

  [[pipeY1, pR1, '#1a4a7a', '#3b9eff', false],
   [pipeY2, pR2, '#5a2800', '#f59e0b', true]].forEach(([py, pr, dark, light, isWarm]) => {
    // Pipe shadow
    ctx.save(); ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bL, py - pr + pr*0.5, bR - bL, pr * 2.2);
    ctx.restore();

    // Pipe body gradient (top-lit cylinder)
    const pg = ctx.createLinearGradient(0, py - pr, 0, py + pr);
    pg.addColorStop(0,   'rgba(255,255,255,0.25)');
    pg.addColorStop(0.15, light);
    pg.addColorStop(0.5,  dark);
    pg.addColorStop(0.85, dark);
    pg.addColorStop(1,   'rgba(0,0,0,0.6)');
    ctx.fillStyle = pg;
    ctx.fillRect(bL, py - pr, bR - bL, pr * 2);

    // Specular highlight strip
    const sg = ctx.createLinearGradient(0, py - pr, 0, py - pr*0.3);
    sg.addColorStop(0, 'rgba(255,255,255,0.55)');
    sg.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = sg;
    ctx.fillRect(bL, py - pr, bR - bL, pr * 0.7);

    // Pipe thermal insulation wrap seams (every ~80px)
    ctx.strokeStyle = `rgba(0,0,0,0.35)`; ctx.lineWidth = 1.5;
    for (let sx = bL; sx < bR; sx += W * 0.06) {
      ctx.beginPath(); ctx.moveTo(sx, py - pr); ctx.lineTo(sx, py + pr); ctx.stroke();
    }

    // Label badge on pipe
    const lx = bL + (bR - bL) * 0.12;
    const label = isWarm ? 'RETURN  +12°C' : 'SUPPLY  +7°C';
    const lColor = isWarm ? '#f59e0b' : '#3b9eff';
    ctx.save();
    ctx.fillStyle = 'rgba(10,15,25,0.8)';
    const tw = ctx.measureText(label).width + 16;
    ctx.fillRect(lx - tw/2, py - 9, tw, 18);
    ctx.strokeStyle = lColor; ctx.lineWidth = 1;
    ctx.strokeRect(lx - tw/2, py - 9, tw, 18);
    ctx.fillStyle = lColor;
    ctx.font = `bold ${Math.max(8, W*0.009)}px Segoe UI, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, lx, py + 4);
    ctx.restore();
  });
}

// ── Ground surface (asphalt / concrete apron) ─────────────────
function drawGroundSurface(ctx, W, H, GY) {
  // Concrete apron
  const gGrd = ctx.createLinearGradient(0, GY - 3, 0, GY + 10);
  gGrd.addColorStop(0, '#1e2c3a');
  gGrd.addColorStop(0.5, '#141f28');
  gGrd.addColorStop(1, 'transparent');
  ctx.fillStyle = gGrd;
  ctx.fillRect(0, GY - 3, W, 14);

  // Ground label dashed line
  ctx.save();
  ctx.setLineDash([8, 5]);
  ctx.strokeStyle = 'rgba(60,100,140,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(W, GY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Underground — soil + bedrock cross-section ────────────────
function drawUnderground(ctx, W, H, GY) {
  // Main soil body
  const sGrd = ctx.createLinearGradient(0, GY, 0, H);
  sGrd.addColorStop(0,   '#1c1208');
  sGrd.addColorStop(0.12,'#16100a');
  sGrd.addColorStop(0.35,'#110e0a');
  sGrd.addColorStop(0.65,'#0d0c0a');
  sGrd.addColorStop(1,   '#08090a');
  ctx.fillStyle = sGrd; ctx.fillRect(0, GY, W, H - GY);

  // Soil strata bands
  const strata = [
    { y: 0.10, h: 0.06, c: 'rgba(28,18,8,0.7)' },   // topsoil
    { y: 0.22, h: 0.04, c: 'rgba(35,25,12,0.5)' },   // clay seam
    { y: 0.45, h: 0.08, c: 'rgba(14,12,10,0.6)' },   // hardpan
    { y: 0.72, h: 0.10, c: 'rgba(10,9,9,0.8)' },     // bedrock
  ];
  strata.forEach(({ y, h, c }) => {
    const sy = GY + (H - GY) * y;
    const sh = (H - GY) * h;
    ctx.fillStyle = c; ctx.fillRect(0, sy, W, sh);
    // Stratum edge line
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
  });

  // Aggregate / gravel particles
  dirtParticles.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fillStyle = p.r > 2.5 ? '#1a1208' : '#22180a';
    ctx.globalAlpha = p.a * 0.55; ctx.fill(); ctx.globalAlpha = 1;
  });

  // Rock inclusions
  const rocks = [
    [W*0.08, GY+(H-GY)*0.18, 14, 9], [W*0.22, GY+(H-GY)*0.32, 10, 6],
    [W*0.41, GY+(H-GY)*0.52, 18, 10],[W*0.58, GY+(H-GY)*0.24, 12, 7],
    [W*0.73, GY+(H-GY)*0.41, 16, 9], [W*0.87, GY+(H-GY)*0.30, 11, 6],
  ];
  rocks.forEach(([rx, ry, rw, rh]) => {
    const rg = ctx.createRadialGradient(rx - rw*0.2, ry - rh*0.2, 0, rx, ry, rw);
    rg.addColorStop(0, '#2a2420'); rg.addColorStop(1, '#14100e');
    ctx.beginPath(); ctx.ellipse(rx, ry, rw, rh, 0.3, 0, Math.PI*2);
    ctx.fillStyle = rg; ctx.fill();
  });

  // Depth vignette
  const vig = ctx.createLinearGradient(0, GY, 0, H);
  vig.addColorStop(0, 'transparent'); vig.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = vig; ctx.fillRect(0, GY, W, H - GY);
}







// ─── REALISTIC INDUSTRIAL PIPE DRAWING ───────────────────────
function drawPipeSegment(ctx, x1,y1, x2,y2, leaking, highP, W) {
  const dx=x2-x1, dy=y2-y1;
  const len=Math.hypot(dx,dy); if(len<1) return;
  const ux=dx/len, uy=dy/len;       // unit along pipe
  const nx=-uy,   ny=ux;            // unit normal (perpendicular)

  const thick = W * 0.018;          // pipe outer radius
  const insR  = thick * 1.28;       // insulation wrap radius

  // ── Outer ambient glow (leak = red, highP = amber, normal = blue) ──
  const glowCol = leaking ? 'rgba(239,68,68,0.30)' : highP ? 'rgba(245,158,11,0.22)' : 'rgba(30,100,200,0.12)';
  const glowR   = insR * (leaking ? 3.2 : 2.0);
  ctx.save(); ctx.filter = `blur(${leaking ? 8 : 4}px)`;
  ctx.beginPath();
  ctx.moveTo(x1+nx*glowR, y1+ny*glowR); ctx.lineTo(x2+nx*glowR, y2+ny*glowR);
  ctx.lineTo(x2-nx*glowR, y2-ny*glowR); ctx.lineTo(x1-nx*glowR, y1-ny*glowR);
  ctx.closePath(); ctx.fillStyle = glowCol; ctx.fill();
  ctx.restore();

  // ── Cast shadow ──
  const shOff = thick * 0.65;
  ctx.beginPath();
  ctx.moveTo(x1+nx*insR+shOff, y1+ny*insR+shOff*1.8);
  ctx.lineTo(x2+nx*insR+shOff, y2+ny*insR+shOff*1.8);
  ctx.lineTo(x2-nx*insR+shOff, y2-ny*insR+shOff*1.8);
  ctx.lineTo(x1-nx*insR+shOff, y1-ny*insR+shOff*1.8);
  ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();

  // ── Insulation jacket (fibreglass / foam wrap) ──
  // Outer jacket — slightly textured grey-beige
  ctx.beginPath();
  ctx.moveTo(x1+nx*insR, y1+ny*insR); ctx.lineTo(x2+nx*insR, y2+ny*insR);
  ctx.lineTo(x2-nx*insR, y2-ny*insR); ctx.lineTo(x1-nx*insR, y1-ny*insR);
  ctx.closePath();
  const jacketG = ctx.createLinearGradient(x1+nx*insR,y1+ny*insR, x1-nx*insR,y1-ny*insR);
  jacketG.addColorStop(0,   '#0e1418');
  jacketG.addColorStop(0.10,'#1c2830');
  jacketG.addColorStop(0.30,'#243040');
  jacketG.addColorStop(0.50,'#1e2a38');
  jacketG.addColorStop(0.70,'#162030');
  jacketG.addColorStop(0.88,'#0e1828');
  jacketG.addColorStop(1,   '#080e14');
  ctx.fillStyle = jacketG; ctx.fill();

  // Jacket specular sheen (top edge glint)
  const jShine = insR * 0.55;
  ctx.beginPath();
  ctx.moveTo(x1+nx*insR,    y1+ny*insR);    ctx.lineTo(x2+nx*insR,    y2+ny*insR);
  ctx.lineTo(x2+nx*jShine,  y2+ny*jShine);  ctx.lineTo(x1+nx*jShine,  y1+ny*jShine);
  ctx.closePath();
  const shineG = ctx.createLinearGradient(x1+nx*insR,y1+ny*insR, x1+nx*jShine,y1+ny*jShine);
  shineG.addColorStop(0, 'rgba(140,190,240,0.30)');
  shineG.addColorStop(1, 'rgba(80,130,180,0.05)');
  ctx.fillStyle = shineG; ctx.fill();

  // Insulation spiral wrap lines (visual texture)
  const wrapSpacing = thick * 2.8;
  const wrapCount = Math.ceil(len / wrapSpacing);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 1.2;
  for (let w = 0; w <= wrapCount; w++) {
    const t = w / wrapCount;
    const wx = x1 + dx*t, wy = y1 + dy*t;
    ctx.beginPath();
    ctx.moveTo(wx + nx*insR, wy + ny*insR);
    ctx.lineTo(wx - nx*insR, wy - ny*insR);
    ctx.stroke();
  }
  ctx.restore();

  // ── Steel pipe body beneath insulation (visible at flanges) ──
  ctx.beginPath();
  ctx.moveTo(x1+nx*thick, y1+ny*thick); ctx.lineTo(x2+nx*thick, y2+ny*thick);
  ctx.lineTo(x2-nx*thick, y2-ny*thick); ctx.lineTo(x1-nx*thick, y1-ny*thick);
  ctx.closePath();
  const steelG = ctx.createLinearGradient(x1+nx*thick,y1+ny*thick, x1-nx*thick,y1-ny*thick);
  steelG.addColorStop(0,   '#06080a');
  steelG.addColorStop(0.12,'#1a2a3a');
  steelG.addColorStop(0.40,'#2a4a6a');
  steelG.addColorStop(0.55,'#1e3858');
  steelG.addColorStop(0.78,'#1a2a3a');
  steelG.addColorStop(1,   '#060810');
  ctx.fillStyle = steelG; ctx.fill();

  // Steel top specular streak
  const sOff = thick * 0.55, sW = thick * 0.18;
  ctx.beginPath();
  ctx.moveTo(x1+nx*(sOff+sW), y1+ny*(sOff+sW)); ctx.lineTo(x2+nx*(sOff+sW), y2+ny*(sOff+sW));
  ctx.lineTo(x2+nx*(sOff-sW), y2+ny*(sOff-sW)); ctx.lineTo(x1+nx*(sOff-sW), y1+ny*(sOff-sW));
  ctx.closePath();
  const streakG = ctx.createLinearGradient(x1,y1,x2,y2);
  streakG.addColorStop(0,    'rgba(180,220,255,0.0)');
  streakG.addColorStop(0.15, 'rgba(180,220,255,0.45)');
  streakG.addColorStop(0.85, 'rgba(180,220,255,0.45)');
  streakG.addColorStop(1,    'rgba(180,220,255,0.0)');
  ctx.fillStyle = streakG; ctx.fill();

  // ── Leak pulse colour overlay ──
  if (leaking) {
    const t = (Math.sin(Date.now()/200)+1)/2;
    ctx.beginPath();
    ctx.moveTo(x1+nx*insR, y1+ny*insR); ctx.lineTo(x2+nx*insR, y2+ny*insR);
    ctx.lineTo(x2-nx*insR, y2-ny*insR); ctx.lineTo(x1-nx*insR, y1-ny*insR);
    ctx.closePath();
    ctx.fillStyle = `rgba(239,68,68,${0.08 + t*0.25})`; ctx.fill();
  }

  // ── Weld seams (every ~120px along pipe) ──
  const weldSpacing = W * 0.10;
  const weldCount = Math.ceil(len / weldSpacing);
  for (let w = 1; w < weldCount; w++) {
    const t = w / weldCount;
    const wx = x1 + dx*t, wy = y1 + dy*t;
    // Weld bead ridge
    ctx.save();
    ctx.strokeStyle = 'rgba(50,80,110,0.65)'; ctx.lineWidth = insR * 0.28;
    ctx.beginPath();
    ctx.moveTo(wx + nx*(insR*0.9), wy + ny*(insR*0.9));
    ctx.lineTo(wx - nx*(insR*0.9), wy - ny*(insR*0.9));
    ctx.stroke();
    // Weld highlight
    ctx.strokeStyle = 'rgba(100,160,220,0.18)'; ctx.lineWidth = insR * 0.10;
    ctx.beginPath();
    ctx.moveTo(wx + nx*(insR*0.72), wy + ny*(insR*0.72));
    ctx.lineTo(wx - nx*(insR*0.72), wy - ny*(insR*0.72));
    ctx.stroke();
    ctx.restore();
  }

  // ── Bolted flanges at both ends ──
  [[x1,y1],[x2,y2]].forEach(([cx,cy]) => {
    const fR = insR * 1.35;   // flange face outer radius
    const fW = insR * 0.55;   // flange axial thickness

    // Flange shadow
    ctx.save(); ctx.filter = 'blur(2px)';
    ctx.beginPath();
    ctx.moveTo(cx + ux*fW + nx*fR, cy + uy*fW + ny*fR);
    ctx.lineTo(cx - ux*fW + nx*fR, cy - uy*fW + ny*fR);
    ctx.lineTo(cx - ux*fW - nx*fR, cy - uy*fW - ny*fR);
    ctx.lineTo(cx + ux*fW - nx*fR, cy + uy*fW - ny*fR);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.restore();

    // Flange body
    ctx.beginPath();
    ctx.moveTo(cx + ux*fW + nx*fR, cy + uy*fW + ny*fR);
    ctx.lineTo(cx - ux*fW + nx*fR, cy - uy*fW + ny*fR);
    ctx.lineTo(cx - ux*fW - nx*fR, cy - uy*fW - ny*fR);
    ctx.lineTo(cx + ux*fW - nx*fR, cy + uy*fW - ny*fR);
    ctx.closePath();
    const fg = ctx.createLinearGradient(cx+nx*fR,cy+ny*fR, cx-nx*fR,cy-ny*fR);
    fg.addColorStop(0,   '#060a0e');
    fg.addColorStop(0.15,'#1a2e42');
    fg.addColorStop(0.42,'#2e4e6e');
    fg.addColorStop(0.58,'#233d5a');
    fg.addColorStop(0.82,'#16263a');
    fg.addColorStop(1,   '#040810');
    ctx.fillStyle = fg; ctx.fill();

    // Flange face edges
    ctx.strokeStyle = 'rgba(80,130,180,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx+ux*fW+nx*fR, cy+uy*fW+ny*fR);
    ctx.lineTo(cx+ux*fW-nx*fR, cy+uy*fW-ny*fR); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx-ux*fW+nx*fR, cy-uy*fW+ny*fR);
    ctx.lineTo(cx-ux*fW-nx*fR, cy-uy*fW-ny*fR); ctx.stroke();

    // Bolt holes (6 bolts around flange)
    const boltCount = 6;
    const boltR = fR * 0.80;
    const boltDotR = insR * 0.10;
    for (let b = 0; b < boltCount; b++) {
      const ang = (b / boltCount) * Math.PI; // half circle facing up/normal direction
      // Map angle to perpendicular + axial offset
      const bx = cx + nx*(boltR * Math.cos(ang * 1 - Math.PI/2))
                     + ux*(fW * 0.2 * (b % 2 === 0 ? 1 : -1));
      const by = cy + ny*(boltR * Math.cos(ang * 1 - Math.PI/2))
                     + uy*(fW * 0.2 * (b % 2 === 0 ? 1 : -1));
      // Bolt dot
      const bg = ctx.createRadialGradient(bx - boltDotR*0.3, by - boltDotR*0.3, 0, bx, by, boltDotR);
      bg.addColorStop(0, '#3a5a7a'); bg.addColorStop(0.6, '#1a2e42'); bg.addColorStop(1, '#080e14');
      ctx.beginPath(); ctx.arc(bx, by, boltDotR, 0, Math.PI*2);
      ctx.fillStyle = bg; ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by, boltDotR, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(80,130,180,0.4)'; ctx.lineWidth = 0.7; ctx.stroke();
    }

    // Flange highlight rim
    ctx.beginPath();
    ctx.moveTo(cx+ux*fW+nx*fR, cy+uy*fW+ny*fR);
    ctx.lineTo(cx-ux*fW+nx*fR, cy-uy*fW+ny*fR);
    ctx.strokeStyle = 'rgba(130,190,240,0.25)'; ctx.lineWidth = 1.2; ctx.stroke();
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

// ─── LEAK EFFECT (coolant drip) ─────────────────────────────
function drawLeakEffects(ctx, W, H) {
  state.sensors.filter(s=>s.status==='leak').forEach(s=>{
    const x=s.nx*W, y=s.ny*H;
    const t=Date.now();

    // Coolant drips (blue-green tint instead of water)
    for(let d=0;d<6;d++){
      const prog=((t/500+d*0.16)%1);
      const dx=(Math.sin(d*1.4)*W*0.008)*(0.5+prog*0.5);
      const dy=prog*H*0.08;
      const alpha=Math.max(0,(1-prog*1.2)*0.9);
      const dr=W*(0.004*(1-prog*0.6));
      if(alpha>0.05){
        ctx.beginPath(); ctx.arc(x+dx,y+dy,dr,0,Math.PI*2);
        ctx.fillStyle=`rgba(40,200,180,${alpha})`; ctx.fill();
        // Teardrop tail
        if(prog>0.1){
          ctx.beginPath(); ctx.moveTo(x+dx,y+dy-dr); ctx.lineTo(x+dx,y+dy-dr*3.5);
          ctx.strokeStyle=`rgba(40,200,180,${alpha*0.5})`; ctx.lineWidth=dr*1.2; ctx.lineCap='round'; ctx.stroke();
        }
      }
    }

    // Coolant pool / splash
    const rProg=((t/600)%1);
    const pudR=W*0.012+rProg*W*0.022;
    ctx.beginPath(); ctx.ellipse(x,y+H*0.08,pudR,pudR*0.3,0,0,Math.PI*2);
    ctx.strokeStyle=`rgba(40,200,180,${(1-rProg)*0.55})`; ctx.lineWidth=1.5; ctx.stroke();

    // Stain on concrete
    const stainGrd=ctx.createRadialGradient(x,y+H*0.05,0,x,y+H*0.05,W*0.025);
    stainGrd.addColorStop(0,'rgba(20,80,80,0.4)'); stainGrd.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(x,y+H*0.05,W*0.025,0,Math.PI*2);
    ctx.fillStyle=stainGrd; ctx.fill();
  });
}

// ─── OVERLAY LABELS ──────────────────────────────────────────
function drawOverlayLabels(ctx, W, H) {
  const GY=GROUND_Y*H;

  // Section label
  ctx.save();
  ctx.font=`bold ${Math.max(10,W*0.012)}px Segoe UI, monospace`;
  ctx.fillStyle='rgba(140,190,230,0.85)';
  ctx.textAlign='left';
  ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=5;
  ctx.fillText('UNDERGROUND PIPE CROSS-SECTION', W*0.01, GY+H*0.058);
  ctx.restore();

  // Ground / underground divider annotation
  ctx.save();
  ctx.font=`${Math.max(8,W*0.009)}px Segoe UI`;
  ctx.fillStyle='rgba(90,140,180,0.55)';
  ctx.textAlign='right';
  ctx.fillText('▲ SURFACE  /  SUBGRADE ▼', W*0.985, GY + H*0.040);
  ctx.restore();

  // Municipal supply in arrow (left)
  drawArrowLabel(ctx,'MUNICIPAL\nSUPPLY IN', W*0.005, GY+H*0.18, 'right', W);
  // Discharge out arrow (right)
  drawArrowLabel(ctx,'DISCHARGE\nOUT', W*0.995, GY+H*0.18, 'left', W);

  // Fire suppression label
  const fireSensor = state.sensors[13]; // S14
  if(fireSensor){
    const ix=fireSensor.nx*W, iy=fireSensor.ny*H;
    ctx.save();
    ctx.strokeStyle='rgba(200,60,60,0.55)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.rect(ix-W*0.065, iy-H*0.015, W*0.13, H*0.05);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.font=`${Math.max(8,W*0.009)}px Segoe UI`;
    ctx.fillStyle='rgba(255,160,160,0.80)'; ctx.textAlign='center';
    ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=4;
    ctx.fillText('FIRE SUPPRESSION', ix, iy+H*0.06);
    ctx.fillText('(FM200)', ix, iy+H*0.075);
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
