// ═══════════════════════════════════════════════════════════════
//  AquaDrop AI Leak Detection Simulator — app.js
//  © 2025 AquaDrop (Business Camp Demo)
// ═══════════════════════════════════════════════════════════════

// ─── CONFIG ─────────────────────────────────────────────────────
let SCAN_INTERVAL = 10000;   // ms between scans
let LEAK_CHANCE   = 25;      // 1 in N chance per sensor per scan
let scanTimer     = null;

// ─── STATE ───────────────────────────────────────────────────────
const state = {
  sensors: [],
  alerts: [],
  totalScans: 0,
  leaksFound: 0,
  psiHistory: [],
  pressureData: [],    // for chart
  is3D: true,
  view: 'basement',
  startTime: Date.now(),
};

// ─── SENSOR DEFINITIONS (24 sensors, pipe grid positions) ────────
// Positions are in a normalized 0-1 coordinate, mapped to canvas
const SENSOR_DEFS = [
  // Main ring (outer)
  { id:'S01', label:'A1', pipe:'Section A1', loc:'North Wall Main',    x:0.12, y:0.22 },
  { id:'S02', label:'A2', pipe:'Section A2', loc:'North Entry Branch', x:0.30, y:0.15 },
  { id:'S03', label:'A3', pipe:'Section A3', loc:'North-East Corner',  x:0.52, y:0.12 },
  { id:'S04', label:'A4', pipe:'Section A4', loc:'East Wall Main',     x:0.75, y:0.18 },
  { id:'S05', label:'A5', pipe:'Section A5', loc:'East Branch Upper',  x:0.85, y:0.32 },
  { id:'S06', label:'A6', pipe:'Section A6', loc:'South-East Corner',  x:0.83, y:0.52 },
  { id:'S07', label:'A7', pipe:'Section A7', loc:'South Wall Main',    x:0.72, y:0.70 },
  { id:'S08', label:'A8', pipe:'Section A8', loc:'South Branch',       x:0.52, y:0.78 },
  { id:'S09', label:'B1', pipe:'Section B1', loc:'South-West Branch',  x:0.30, y:0.76 },
  { id:'S10', label:'B2', pipe:'Section B2', loc:'West Wall Main',     x:0.14, y:0.65 },
  { id:'S11', label:'B3', pipe:'Section B3', loc:'West Entry Branch',  x:0.10, y:0.47 },
  { id:'S12', label:'B4', pipe:'Section B4', loc:'North-West Corner',  x:0.12, y:0.32 },

  // Inner ring
  { id:'S13', label:'C1', pipe:'Section C1', loc:'Inner North',        x:0.28, y:0.27 },
  { id:'S14', label:'C2', pipe:'Section C2', loc:'Inner NE',           x:0.52, y:0.24 },
  { id:'S15', label:'C3', pipe:'Section C3', loc:'Inner East',         x:0.68, y:0.38 },
  { id:'S16', label:'C4', pipe:'Section C4', loc:'Inner SE',           x:0.65, y:0.56 },
  { id:'S17', label:'C5', pipe:'Section C5', loc:'Inner South',        x:0.50, y:0.62 },
  { id:'S18', label:'C6', pipe:'Section C6', loc:'Inner SW',           x:0.33, y:0.57 },
  { id:'S19', label:'C7', pipe:'Section C7', loc:'Inner West',         x:0.27, y:0.42 },

  // Cross-section T-junctions
  { id:'S20', label:'B3-7', pipe:'Section B3-7', loc:'Near Utility Room Wall', x:0.50, y:0.43, featured:true },
  { id:'S21', label:'D1',   pipe:'Section D1', loc:'Center Junction',  x:0.50, y:0.52 },
  { id:'S22', label:'D2',   pipe:'Section D2', loc:'Center North',     x:0.50, y:0.33 },
  { id:'S23', label:'D3',   pipe:'Section D3', loc:'Boiler Feed',      x:0.35, y:0.43 },
  { id:'S24', label:'D4',   pipe:'Section D4', loc:'Meter Junction',   x:0.65, y:0.43 },
];

// Pipe segments to draw (pairs of sensor indices, 0-based)
const PIPE_SEGS = [
  // Outer ring
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,0],
  // Inner ring
  [12,13],[13,14],[14,15],[15,16],[16,17],[17,18],[18,12],
  // Outer to inner (spokes)
  [0,12],[3,14],[4,15],[6,16],[8,17],[9,18],[11,19-1],
  // Center cross
  [19,20],[19,21],[19,22],[19,23],
  [21,12],[21,14],[20,16],[20,17],[22,23],
];

// Initialize sensors
function initSensors() {
  state.sensors = SENSOR_DEFS.map(def => ({
    ...def,
    status: 'normal',    // normal | highpressure | leak | offline
    psi: 42 + Math.random() * 8,
    noise: 0.05 + Math.random() * 0.1,
    leakProb: 0,
    lastPing: new Date().toLocaleTimeString(),
  }));
}

// ─── PAGE NAVIGATION ────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.toLowerCase().includes(name)) n.classList.add('active');
  });
  if (name === 'sensors') renderSensorTable();
  if (name === 'analytics') renderAnalyticsPage();
  if (name === 'health') renderHealthPage();
}

// ─── CLOCK ───────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const d = now.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  document.getElementById('topbarTime').textContent = `${t} / ${d}`;
}

// ─── PIPE CANVAS ─────────────────────────────────────────────────
const pipeCanvas = document.getElementById('pipeCanvas');
const pipeCtx    = pipeCanvas.getContext('2d');
let   pipeZoom   = 1;
let   tooltipSensor = null;

function resizePipeCanvas() {
  const wrap = pipeCanvas.parentElement;
  const W = wrap.offsetWidth;
  const H = Math.min(W * 0.55, 380);
  pipeCanvas.width  = W;
  pipeCanvas.height = H;
  pipeCanvas.style.height = H + 'px';
  drawPipe();
}

function getPipeColor(sensor) {
  switch(sensor.status) {
    case 'leak':          return '#ef4444';
    case 'highpressure':  return '#f59e0b';
    case 'offline':       return '#475569';
    default:              return '#22c55e';
  }
}

function drawPipe() {
  const W = pipeCanvas.width;
  const H = pipeCanvas.height;
  const ctx = pipeCtx;
  ctx.clearRect(0, 0, W, H);

  // Background gradient (dark basement feel)
  const bg = ctx.createRadialGradient(W/2, H/2, 20, W/2, H/2, Math.max(W,H)*0.7);
  bg.addColorStop(0, '#0d1525');
  bg.addColorStop(1, '#060c18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 3D skew transform (isometric-ish)
  const sx = (s) => s.x * W;
  const sy = (s) => s.y * H;

  // ── Draw pipe segments ──
  PIPE_SEGS.forEach(([ai, bi]) => {
    const a = state.sensors[ai];
    const b = state.sensors[bi];
    if (!a || !b) return;

    const ax = sx(a), ay = sy(a);
    const bx = sx(b), by = sy(b);

    // Pipe body (dark steel)
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = state.is3D ? 8 : 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Inner shine
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = '#2d5a8e44';
    ctx.lineWidth = 3;
    ctx.stroke();

    // If either sensor is leaking, show red pulse on the pipe segment
    if (a.status === 'leak' || b.status === 'leak') {
      const t = (Math.sin(Date.now() / 300) + 1) / 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = `rgba(239,68,68,${0.15 + t * 0.35})`;
      ctx.lineWidth = 12;
      ctx.stroke();
    }
  });

  // ── Draw sensor nodes ──
  state.sensors.forEach((s, i) => {
    const x = sx(s);
    const y = sy(s);
    const color = getPipeColor(s);
    const r = s.featured ? 11 : 8;

    // Glow
    if (s.status !== 'offline') {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
      glow.addColorStop(0, color + '55');
      glow.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // Animated pulse ring for leaks
    if (s.status === 'leak') {
      const pt = (Date.now() % 1200) / 1200;
      ctx.beginPath();
      ctx.arc(x, y, r + pt * 22, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239,68,68,${1 - pt})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1525';
    ctx.fill();

    // Main dot
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // Label for featured / tooltip hover
    if (s.featured || s === tooltipSensor) {
      ctx.font = `bold 10px Segoe UI`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, x, y - r - 5);
    }
  });

  // Drip particles on leak sensors
  state.sensors.forEach(s => {
    if (s.status !== 'leak') return;
    const x = sx(s);
    const y = sy(s);
    for (let d = 0; d < 3; d++) {
      const prog = ((Date.now() / 600 + d * 0.33) % 1);
      const dx = Math.sin(d * 2.1) * 10;
      const dy = prog * 20;
      const alpha = 1 - prog;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(59,158,255,${alpha * 0.8})`;
      ctx.fill();
    }
  });

  // Tooltip connector line to leaking sensor
  if (tooltipSensor && tooltipSensor.status === 'leak') {
    const x = sx(tooltipSensor);
    const y = sy(tooltipSensor);
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y - 40);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Animated draw loop
function animationLoop() {
  drawPipe();
  requestAnimationFrame(animationLoop);
}

// Canvas click: show sensor info tooltip
pipeCanvas.addEventListener('click', (e) => {
  const rect = pipeCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top)  / rect.height;

  let closest = null, bestDist = 0.04;
  state.sensors.forEach(s => {
    const d = Math.hypot(s.x - mx, s.y - my);
    if (d < bestDist) { bestDist = d; closest = s; }
  });

  if (closest) {
    tooltipSensor = closest;
    showSensorTooltip(closest, e.clientX, e.clientY);
  } else {
    tooltipSensor = null;
    document.getElementById('leakTooltip').style.display = 'none';
  }
});

function showSensorTooltip(s, cx, cy) {
  const tip  = document.getElementById('leakTooltip');
  const rect = pipeCanvas.getBoundingClientRect();
  const body = document.getElementById('tooltipContent');

  body.innerHTML = `
    <div>Status: <strong style="color:${getPipeColor(s)}">${s.status.toUpperCase()}</strong></div>
    <div>Sensor: <strong>${s.id} (${s.label})</strong></div>
    <div>Location: ${s.loc}</div>
    <div>Pressure: <strong>${s.psi.toFixed(1)} PSI</strong></div>
    <div>Noise: <strong>${(s.noise * 100).toFixed(0)}%</strong></div>
    ${s.status === 'leak' ? `<div>Leak Prob: <strong style="color:#ef4444">${(s.leakProb*100).toFixed(0)}%</strong></div>` : ''}
  `;

  tip.style.display = 'block';
  const px = cx - rect.left;
  const py = cy - rect.top;
  tip.style.left = Math.min(px + 16, rect.width - 200) + 'px';
  tip.style.top  = Math.max(py - 90, 4) + 'px';

  if (s.status !== 'leak') {
    tip.style.borderColor = getPipeColor(s);
    tip.querySelector('.leak-tooltip-title').textContent = `${s.status === 'normal' ? '🟢' : s.status === 'highpressure' ? '🟡' : '⚫'} SENSOR ${s.id}`;
    tip.querySelector('.leak-tooltip-title').style.color = getPipeColor(s);
  } else {
    tip.style.borderColor = '#ef4444';
    tip.querySelector('.leak-tooltip-title').textContent = '🔴 LEAK DETECTED';
    tip.querySelector('.leak-tooltip-title').style.color = '#ef4444';
  }
}

// ─── GAUGE ───────────────────────────────────────────────────────
const gaugeCanvas = document.getElementById('gaugeCanvas');
const gaugeCtx    = gaugeCanvas.getContext('2d');

function drawGauge(prob) {
  const W = gaugeCanvas.width;
  const H = gaugeCanvas.height;
  const cx = W / 2, cy = H - 14;
  const r  = Math.min(W, H * 2) * 0.40;
  const startA = Math.PI;
  const endA   = 2 * Math.PI;

  gaugeCtx.clearRect(0, 0, W, H);

  // Track
  gaugeCtx.beginPath();
  gaugeCtx.arc(cx, cy, r, startA, endA);
  gaugeCtx.strokeStyle = '#1f2d45';
  gaugeCtx.lineWidth = 16;
  gaugeCtx.lineCap = 'round';
  gaugeCtx.stroke();

  // Gradient fill
  const grad = gaugeCtx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0,   '#22c55e');
  grad.addColorStop(0.5, '#f59e0b');
  grad.addColorStop(1,   '#ef4444');

  const fillEnd = startA + (endA - startA) * Math.min(prob, 1);
  gaugeCtx.beginPath();
  gaugeCtx.arc(cx, cy, r, startA, fillEnd);
  gaugeCtx.strokeStyle = grad;
  gaugeCtx.lineWidth = 16;
  gaugeCtx.lineCap = 'round';
  gaugeCtx.stroke();

  // Needle
  const angle = startA + (endA - startA) * Math.min(prob, 1);
  const nx = cx + r * Math.cos(angle);
  const ny = cy + r * Math.sin(angle);
  gaugeCtx.beginPath();
  gaugeCtx.moveTo(cx, cy);
  gaugeCtx.lineTo(nx, ny);
  gaugeCtx.strokeStyle = '#fff';
  gaugeCtx.lineWidth = 2.5;
  gaugeCtx.stroke();
  gaugeCtx.beginPath();
  gaugeCtx.arc(cx, cy, 5, 0, Math.PI * 2);
  gaugeCtx.fillStyle = '#fff';
  gaugeCtx.fill();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const a = startA + (endA - startA) * (i / 10);
    const os = i % 5 === 0 ? 22 : 18;
    gaugeCtx.beginPath();
    gaugeCtx.moveTo(cx + (r - os) * Math.cos(a), cy + (r - os) * Math.sin(a));
    gaugeCtx.lineTo(cx + (r - 6) * Math.cos(a),  cy + (r - 6) * Math.sin(a));
    gaugeCtx.strokeStyle = '#1f2d45';
    gaugeCtx.lineWidth = i % 5 === 0 ? 2 : 1;
    gaugeCtx.stroke();
  }

  // Update text
  const pct  = Math.round(prob * 100);
  const color = prob < 0.4 ? '#22c55e' : prob < 0.7 ? '#f59e0b' : '#ef4444';
  const lbl   = prob < 0.4 ? 'Low Risk' : prob < 0.7 ? 'Monitoring' : 'High Probability';
  document.getElementById('gaugePct').textContent   = pct + '%';
  document.getElementById('gaugePct').style.color   = color;
  document.getElementById('gaugeLabel').textContent = lbl;
  document.getElementById('gaugeLabel').style.color = color;
  document.getElementById('gaugeNote').textContent  =
    prob < 0.4 ? 'All sensors reading normal. System monitoring continuously.'
    : prob < 0.7 ? 'Elevated pressure detected. AI is analyzing for patterns.'
    : 'AI analysis indicates a possible leak in the highlighted area.';
}

// ─── PRESSURE CHART ───────────────────────────────────────────────
const pressureCanvas = document.getElementById('pressureChart');
const pressCtx       = pressureCanvas.getContext('2d');
const MAX_PDATA = 60;

function initPressureData() {
  for (let i = 0; i < MAX_PDATA; i++) {
    state.pressureData.push(40 + Math.random() * 8);
  }
}

function drawPressureChart(highlight) {
  const W = pressureCanvas.offsetWidth || 260;
  const H = 80;
  pressureCanvas.width  = W;
  pressureCanvas.height = H;
  pressCtx.clearRect(0, 0, W, H);

  // Grid lines
  for (let g = 0; g <= 4; g++) {
    const y = H - (g / 4) * H;
    pressCtx.beginPath();
    pressCtx.moveTo(0, y); pressCtx.lineTo(W, y);
    pressCtx.strokeStyle = '#1f2d45';
    pressCtx.lineWidth = 1;
    pressCtx.stroke();
  }

  const data = state.pressureData;
  const step = W / (data.length - 1);
  const minV = 0, maxV = 80;

  const toY = v => H - ((v - minV) / (maxV - minV)) * H;

  // Draw area
  pressCtx.beginPath();
  data.forEach((v, i) => {
    const x = i * step;
    const y = toY(v);
    i === 0 ? pressCtx.moveTo(x, y) : pressCtx.lineTo(x, y);
  });
  pressCtx.lineTo(W, H); pressCtx.lineTo(0, H);
  pressCtx.closePath();
  const areaGrad = pressCtx.createLinearGradient(0, 0, 0, H);
  areaGrad.addColorStop(0, highlight ? 'rgba(239,68,68,0.25)' : 'rgba(59,158,255,0.18)');
  areaGrad.addColorStop(1, 'rgba(0,0,0,0)');
  pressCtx.fillStyle = areaGrad;
  pressCtx.fill();

  // Draw line
  pressCtx.beginPath();
  data.forEach((v, i) => {
    const x = i * step;
    const y = toY(v);
    i === 0 ? pressCtx.moveTo(x, y) : pressCtx.lineTo(x, y);
  });
  pressCtx.strokeStyle = highlight ? '#ef4444' : '#3b9eff';
  pressCtx.lineWidth = 1.8;
  pressCtx.stroke();
}

// ─── ACOUSTIC WAVEFORM ────────────────────────────────────────────
const waveCanvas = document.getElementById('waveCanvas');
const waveCtx    = waveCanvas.getContext('2d');
let   wavePhase  = 0;
let   isLeakWave = false;
let   leakAmplitude = 0;

function drawWave() {
  const W = waveCanvas.offsetWidth || 260;
  const H = 60;
  waveCanvas.width  = W;
  waveCanvas.height = H;
  waveCtx.clearRect(0, 0, W, H);

  const cy = H / 2;
  waveCtx.beginPath();

  for (let x = 0; x < W; x++) {
    const freq  = isLeakWave ? 4 + Math.random() * 3 : 1.5;
    const amp   = isLeakWave
      ? (8 + leakAmplitude * 18 + Math.random() * 10) * Math.abs(Math.sin(x / 12))
      : (4 + Math.random() * 3) * Math.abs(Math.sin(x / 25));
    const y = cy + amp * Math.sin((x / W) * Math.PI * freq * 2 + wavePhase);
    x === 0 ? waveCtx.moveTo(x, y) : waveCtx.lineTo(x, y);
  }

  waveCtx.strokeStyle = isLeakWave ? '#ef4444' : '#3b9eff';
  waveCtx.lineWidth   = 1.5;
  waveCtx.stroke();

  wavePhase += isLeakWave ? 0.12 : 0.04;

  // AI Confidence
  const conf = isLeakWave ? Math.round(85 + leakAmplitude * 10) : Math.round(5 + Math.random() * 10);
  document.getElementById('aiConfidence').textContent = `AI Confidence: ${conf}%`;
  document.getElementById('acousticStatus').textContent = isLeakWave
    ? '🔴 Leak noise signature detected'
    : '🟢 No leak signatures detected';
  document.getElementById('acousticStatus').style.color = isLeakWave ? '#ef4444' : '#22c55e';
}

// ─── SCAN SIMULATION ─────────────────────────────────────────────
function runScan() {
  state.totalScans++;
  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  document.getElementById('lastScan').textContent = timeStr;

  // Recover previous non-featured leaks
  state.sensors.forEach(s => {
    if (s.status === 'leak' && !s.keepLeak) {
      s.status = 'normal';
      s.leakProb = 0;
      s.noise = 0.05 + Math.random() * 0.1;
    }
    s.keepLeak = false;
    // Occasionally elevate pressure
    if (Math.random() < 0.08) { s.status = 'highpressure'; s.psi = 68 + Math.random() * 12; }
    else if (s.status === 'highpressure' && Math.random() < 0.5) { s.status = 'normal'; s.psi = 40 + Math.random() * 8; }
  });

  // Roll leak chance for each sensor
  let newLeaks = [];
  state.sensors.forEach(s => {
    if (Math.random() < (1 / LEAK_CHANCE)) {
      s.status    = 'leak';
      s.psi       = 22 + Math.random() * 18;
      s.noise     = 0.65 + Math.random() * 0.35;
      s.leakProb  = 0.72 + Math.random() * 0.28;
      s.keepLeak  = false;
      newLeaks.push(s);
    }
    // Normal PSI drift
    if (s.status === 'normal') {
      s.psi = Math.max(30, Math.min(70, s.psi + (Math.random() - 0.5) * 3));
      s.noise = 0.05 + Math.random() * 0.1;
    }
    s.lastPing = timeStr;
  });

  // Pressure data
  const leakSensors = state.sensors.filter(s => s.status === 'leak');
  const avgPsi = state.sensors.reduce((a, s) => a + s.psi, 0) / state.sensors.length;
  const newPsi = leakSensors.length > 0
    ? avgPsi * 0.7 + Math.random() * 15
    : avgPsi + (Math.random() - 0.5) * 4;
  state.pressureData.push(newPsi);
  if (state.pressureData.length > MAX_PDATA) state.pressureData.shift();

  // Update acoustic wave
  isLeakWave     = leakSensors.length > 0;
  leakAmplitude  = leakSensors.length > 0 ? leakSensors[0].leakProb : 0;

  // Alerts
  newLeaks.forEach(s => {
    state.leaksFound++;
    const alert = {
      time: timeStr,
      type: 'leak',
      text: `High leak probability detected at ${s.pipe}`,
      sensor: s,
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > 100) state.alerts.pop();
    addAlertRow(alert);
    showLeakModal(s);
    setDot(false);
    setTimeout(() => { if (!hasLeaks()) setDot(true); }, SCAN_INTERVAL);
  });

  // High pressure alerts
  state.sensors.filter(s => s.status === 'highpressure').forEach(s => {
    if (Math.random() < 0.3) {
      const alert = { time: timeStr, type: 'high', text: `Pressure spike detected at ${s.pipe}`, sensor: s };
      state.alerts.unshift(alert);
      if (state.alerts.length > 100) state.alerts.pop();
      addAlertRow(alert);
    }
  });

  // Periodic "all clear" log
  if (newLeaks.length === 0 && Math.random() < 0.3) {
    const alert = { time: timeStr, type: 'ok', text: 'System check completed — All sensors normal', sensor: null };
    state.alerts.unshift(alert);
    if (state.alerts.length > 100) state.alerts.pop();
    addAlertRow(alert);
  }

  updateDashboard();
  renderSensorTable();
  updateBadge();
}

function hasLeaks() {
  return state.sensors.some(s => s.status === 'leak');
}
function setDot(green) {
  const dot = document.getElementById('liveDot');
  const lbl = document.getElementById('liveLabel');
  dot.style.background = green ? '#22c55e' : '#ef4444';
  lbl.textContent = green ? 'Live' : 'ALERT';
  lbl.style.color  = green ? '#22c55e' : '#ef4444';
}

// ─── DASHBOARD UPDATE ─────────────────────────────────────────────
function updateDashboard() {
  const leaks   = state.sensors.filter(s => s.status === 'leak');
  const highP   = state.sensors.filter(s => s.status === 'highpressure');
  const normal  = state.sensors.filter(s => s.status === 'normal');
  const offline = state.sensors.filter(s => s.status === 'offline');

  // Gauge: highest individual prob
  const maxProb = leaks.length > 0
    ? Math.max(...leaks.map(s => s.leakProb))
    : highP.length > 0 ? 0.35 + Math.random() * 0.15 : 0.02 + Math.random() * 0.08;
  drawGauge(maxProb);

  // Sensor counts
  document.getElementById('statTotal').textContent   = state.sensors.length;
  document.getElementById('statHighP').textContent   = highP.length;
  document.getElementById('statLeak').textContent    = leaks.length;
  document.getElementById('statNormal').textContent  = normal.length;
  document.getElementById('statOffline').textContent = offline.length;
  document.getElementById('statHighPSub').textContent = highP.length > 0 ? 'Monitoring' : 'Normal';
  document.getElementById('statLeakSub').textContent  = leaks.length > 0 ? 'ATTENTION' : '—';
  document.getElementById('statLeakSub').style.color  = leaks.length > 0 ? '#ef4444' : '#64748b';

  // Pressure chart
  drawPressureChart(leaks.length > 0);

  // Leak location panel
  updateLeakLocationPanel(leaks);

  // System status
  const sysText = document.getElementById('sysStatusText');
  sysText.textContent = leaks.length > 0
    ? `⚠ ${leaks.length} Leak${leaks.length > 1 ? 's' : ''} Detected!`
    : highP.length > 0 ? '⚡ Elevated Pressure'
    : '● All Systems Operational';
  sysText.style.color = leaks.length > 0 ? '#ef4444' : highP.length > 0 ? '#f59e0b' : '#22c55e';

  document.getElementById('sensorsOnline').textContent = `${state.sensors.length - offline.length} / ${state.sensors.length}`;
}

function updateLeakLocationPanel(leaks) {
  const panel = document.getElementById('leakLocationBody');
  if (leaks.length === 0) {
    panel.innerHTML = '<div class="no-leak-msg">✅ No leaks detected currently</div>';
    return;
  }
  const s = leaks[0];
  const miniX = Math.round(s.x * 60) + 5;
  const miniY = Math.round(s.y * 60) + 5;
  panel.innerHTML = `
    <div class="leak-mini-map">
      <div class="leak-mini-dot" style="left:${miniX}px;top:${miniY}px"></div>
    </div>
    <div class="leak-location-title">${s.pipe}</div>
    <div class="leak-location-detail">
      ${s.loc}<br>
      ${(3.2 - Math.random()).toFixed(1)} meters from main line<br>
      <span style="color:#ef4444;font-weight:600">Probability: ${(s.leakProb*100).toFixed(0)}%</span>
    </div>
  `;
}

// ─── ALERTS ───────────────────────────────────────────────────────
const MAX_RECENT = 6;
function addAlertRow(alert) {
  const icon  = alert.type === 'leak' ? '🔴' : alert.type === 'high' ? '🟡' : '🟢';
  const html  = `
    <div class="alert-row">
      <span class="alert-time">${alert.time}</span>
      <span class="alert-dot">${icon}</span>
      <span>${alert.text}</span>
    </div>`;

  // Recent (dashboard)
  const recent = document.getElementById('recentAlertsList');
  if (recent.querySelector('.alert-empty')) recent.innerHTML = '';
  recent.insertAdjacentHTML('afterbegin', html);
  while (recent.children.length > MAX_RECENT) recent.lastChild.remove();

  // Full list
  const full = document.getElementById('fullAlertsList');
  if (full.querySelector('.alert-empty')) full.innerHTML = '';
  full.insertAdjacentHTML('afterbegin', html);
}

function updateBadge() {
  const cnt = state.alerts.filter(a => a.type === 'leak').length;
  ['alertBadge','alertBadge2'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = cnt > 0 ? cnt : '';
    el.style.display = cnt > 0 ? '' : 'none';
  });
}

// ─── MODAL ────────────────────────────────────────────────────────
let modalDismissTimer = null;
function showLeakModal(s) {
  if (document.getElementById('leakModal').style.display === 'flex') return;
  document.getElementById('modalBody').innerHTML = `
    <strong>Sensor ${s.id}</strong> — ${s.pipe}<br>
    Location: ${s.loc}<br>
    Pressure drop: ${s.psi.toFixed(1)} PSI<br>
    Leak probability: <strong style="color:#ef4444">${(s.leakProb*100).toFixed(0)}%</strong><br>
    Noise level: <strong>${(s.noise*100).toFixed(0)}%</strong><br><br>
    <em style="color:#94a3b8">Contact your plumber with this sensor location to avoid unnecessary wall openings.</em>
  `;
  document.getElementById('leakModal').style.display = 'flex';
  // Auto-dismiss after 10 seconds
  if (modalDismissTimer) clearTimeout(modalDismissTimer);
  modalDismissTimer = setTimeout(dismissModal, 10000);
}
function dismissModal() {
  document.getElementById('leakModal').style.display = 'none';
  if (modalDismissTimer) clearTimeout(modalDismissTimer);
}

// ─── SENSOR TABLE ─────────────────────────────────────────────────
function renderSensorTable() {
  const tbody = document.getElementById('sensorTableBody');
  if (!tbody) return;
  tbody.innerHTML = state.sensors.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${s.loc}</td>
      <td><span class="status-pill ${s.status === 'highpressure' ? 'high' : s.status}">${s.status.toUpperCase()}</span></td>
      <td>${s.psi.toFixed(1)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:5px;background:#1f2d45;border-radius:3px">
            <div style="width:${(s.noise*100).toFixed(0)}%;height:100%;background:${s.status==='leak'?'#ef4444':s.status==='highpressure'?'#f59e0b':'#22c55e'};border-radius:3px"></div>
          </div>
          <span>${(s.noise*100).toFixed(0)}%</span>
        </div>
      </td>
      <td>${s.lastPing}</td>
    </tr>
  `).join('');
}

// ─── ANALYTICS PAGE ───────────────────────────────────────────────
function renderAnalyticsPage() {
  const avgPsi = state.pressureData.length
    ? (state.pressureData.reduce((a,b)=>a+b,0)/state.pressureData.length).toFixed(1)
    : '—';
  document.getElementById('aTotalScans').textContent  = state.totalScans;
  document.getElementById('aLeaksFound').textContent  = state.leaksFound;
  document.getElementById('aFalseAlarms').textContent = Math.max(0, state.leaksFound - Math.floor(state.leaksFound * 0.85));
  document.getElementById('aAvgPSI').textContent      = avgPsi;

  // Simple PSI line chart
  const ac = document.getElementById('analyticsChart');
  const ctx = ac.getContext('2d');
  const W = ac.offsetWidth || 600;
  const H = 100;
  ac.width = W; ac.height = H;
  ctx.clearRect(0, 0, W, H);
  const d = state.pressureData;
  if (d.length < 2) return;
  const step = W / (d.length - 1);
  ctx.beginPath();
  d.forEach((v, i) => {
    const x = i * step;
    const y = H - (v / 80) * H;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#3b9eff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ─── HEALTH PAGE ─────────────────────────────────────────────────
function renderHealthPage() {
  const items = [
    { icon:'📡', name:'24 Acoustic Sensors', detail:'All sensors online & responding', ok:true },
    { icon:'🔋', name:'Battery Level', detail:'98% — Estimated 14 months remaining', ok:true },
    { icon:'📶', name:'Network Connection', detail:'Signal strength: Excellent', ok:true },
    { icon:'🧠', name:'AI Engine', detail:'Model v4.1 — Last retrained: 3 days ago', ok:true },
    { icon:'💾', name:'Data Storage', detail:'4.2 GB used of 50 GB', ok:true },
    { icon:'☁️', name:'Cloud Sync', detail:'Last synced: just now', ok:true },
  ];
  document.getElementById('healthItems').innerHTML = items.map(it => `
    <div class="health-item">
      <div class="health-icon">${it.icon}</div>
      <div>
        <div class="health-name">${it.name}</div>
        <div class="health-detail">${it.detail}</div>
      </div>
      <div class="health-status" style="color:${it.ok?'#22c55e':'#ef4444'}">${it.ok?'✓ OK':'✗ Issue'}</div>
    </div>
  `).join('');
}

// ─── SETTINGS CALLBACKS ───────────────────────────────────────────
function updateScanInterval(v) {
  SCAN_INTERVAL = v * 1000;
  document.getElementById('scanIntervalVal').textContent = v + 's';
  restartTimer();
}
function updateLeakChance(v) {
  LEAK_CHANCE = parseInt(v);
  document.getElementById('leakChanceVal').textContent = '1 in ' + v;
}
function toggleTheme() {
  // Simplified – already dark; could extend to light mode
}
function setView(v) { state.view = v; }
function toggle3D(is3d) {
  state.is3D = is3d;
  document.getElementById('btn3d').classList.toggle('active', is3d);
  document.getElementById('btn2d').classList.toggle('active', !is3d);
}
function zoomCanvas(factor) {
  pipeZoom = Math.max(0.5, Math.min(2, pipeZoom * factor));
  pipeCanvas.style.transform = `scale(${pipeZoom})`;
  pipeCanvas.style.transformOrigin = 'center center';
}
function restartTimer() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = setInterval(runScan, SCAN_INTERVAL);
}

// ─── REPORT DOWNLOAD ─────────────────────────────────────────────
function downloadReport() {
  const lines = [
    'AquaDrop Session Report',
    '=======================',
    `Date: ${new Date().toLocaleString()}`,
    `Total Scans: ${state.totalScans}`,
    `Leaks Detected: ${state.leaksFound}`,
    '',
    'Alert Log:',
    ...state.alerts.map(a => `[${a.time}] ${a.text}`),
  ];
  const blob = new Blob([lines.join('\n')], { type:'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'aquadrop_report.txt'; a.click();
  URL.revokeObjectURL(url);
}

// ─── WAVE ANIMATION LOOP ─────────────────────────────────────────
function waveLoop() {
  drawWave();
  requestAnimationFrame(waveLoop);
}

// ─── INIT ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initSensors();
  initPressureData();

  resizePipeCanvas();
  window.addEventListener('resize', resizePipeCanvas);

  drawGauge(0.03);
  drawPressureChart(false);

  // Start animation loops
  animationLoop();
  waveLoop();

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // First scan immediately, then on interval
  runScan();
  restartTimer();

  // Initial dashboard render
  updateDashboard();
});
