'use strict';
/**
 * 广州城：2800年历史通关游戏 v2.0
 * 全新重制 — 45度鸟瞰等距视角，四大历史关卡
 */

// ═══════════════════════════════════════════════════════
//  Globals
// ═══════════════════════════════════════════════════════
let canvas, ctx, W, H;
let gameState = 'start';   // start | playing | modal | transition | victory
let currentLevel = 1;
let rafId = null;
let lastTs = 0;

// Camera: screen coords of iso-origin tile(0,0)
const cam = { sx: 0, sy: 0 };

// ═══════════════════════════════════════════════════════
//  Isometric constants & helpers
// ═══════════════════════════════════════════════════════
const TW = 64;   // tile diamond width  (px)
const TH = 32;   // tile diamond height (px)

/** World tile → screen pixel */
function t2s(tx, ty) {
  return {
    x: (tx - ty) * TW / 2 + cam.sx,
    y: (tx + ty) * TH / 2 + cam.sy,
  };
}

// ═══════════════════════════════════════════════════════
//  Palette
// ═══════════════════════════════════════════════════════
const COL = {
  grass:  { t:'#5a9a30', r:'#3a6a18', l:'#2a5010' },
  stone:  { t:'#8a8070', r:'#5a5048', l:'#3a3028' },
  water:  { t:'#2878c0', r:'#185090', l:'#0a3870' },
  sand:   { t:'#d0b460', r:'#a08840', l:'#786020' },
  wood:   { t:'#b07838', r:'#805820', l:'#604010' },
  road:   { t:'#8a7860', r:'#5a4840', l:'#3a2820' },
  city:   { t:'#c8b880', r:'#988858', l:'#786840' },
  modern: { t:'#607080', r:'#405060', l:'#283040' },
  dirt:   { t:'#b07848', r:'#886030', l:'#603820' },
};

// ═══════════════════════════════════════════════════════
//  History Cards (5 total)
// ═══════════════════════════════════════════════════════
const CARDS = [
  {
    title: '任嚣筑城图',
    period: '秦朝 · 公元前214年',
    image: 'assets/renxiao.png',
    desc: '秦始皇三十三年（公元前214年），南海郡尉任嚣在此筑建番禺城（俗称"任嚣城"），奠定了广州作为岭南政治、军事与商业中心的初始格局。这是广州建城史的伟大开端，距今已逾2800年。',
  },
  {
    title: '海丝起点图',
    period: '唐宋时期 · 海上丝绸之路',
    image: 'assets/maritime.png',
    desc: '唐宋时期，广州成为"广州通海夷道"的起点，是世界著名的东方大港。中国的陶瓷、丝绸、茶叶经此远销西洋，繁华码头帆樯如林，各国商旅云集，广州由此成为海上丝绸之路的黄金起点。',
  },
  {
    title: '十三行图',
    period: '清朝 · 一口通商时代',
    image: 'assets/thirteen.png',
    desc: '清乾隆二十二年（1757年），清廷下令"一口通商"，广州十三行成为全国唯一对外贸易特区。世界各国商船云集珠江，十三行行商把持中西贸易，书写了"金山珠海，天子南库"的百年传奇。',
  },
  {
    title: '黄埔军校图',
    period: '民国 · 1924年',
    image: 'assets/whampoa.png',
    desc: '1924年，孙中山在广州长洲岛创办黄埔军校。这里走出了蒋介石、叶挺、陈赓等无数爱国将领，孕育了"爱国、革命"的黄埔精神，成为近代中国革命力量的坚定摇篮。',
  },
  {
    title: '小蛮腰图',
    period: '现代 · 广州新地标',
    image: 'assets/cantontower.png',
    desc: '广州塔（小蛮腰）以600米的高度耸立于珠江南岸，与珠江新城CBD隔江相望，是现代广州繁华与科技的象征。千年商都在新时代焕发了无限生机，书写着更宏伟的未来篇章。',
  },
];

// ═══════════════════════════════════════════════════════
//  Player
// ═══════════════════════════════════════════════════════
const P = {
  tx: 12, ty: 21,   // world tile position (float)
  speed: 0.09,      // tiles per ms factor
  jumpH: 0,         // current jump height (px, negative = up)
  jumpV: 0,         // jump velocity
  onGround: true,
  walkPhase: 0,
  moving: false,
};

// ═══════════════════════════════════════════════════════
//  Input
// ═══════════════════════════════════════════════════════
const K = {};

// ═══════════════════════════════════════════════════════
//  Interaction & progress state
// ═══════════════════════════════════════════════════════
const triggered = new Set();  // IDs of already-triggered objects

// Modal state
let modalCardId    = -1;
let modalOnClose   = null;
let modalAutoMs    = 0;  // auto-close countdown (ms)

// Transition
let transAlpha = 0;
let transDir   = 0;   // 1=fade-in, -1=fade-out
let transNext  = 0;

// Unlocked collection slots
const unlockedSlots = new Set();

// ═══════════════════════════════════════════════════════
//  Interactive objects per level
// ═══════════════════════════════════════════════════════
function getObjects(lv) {
  switch (lv) {
    case 1:
      return [
        { id:'gate',     tx:12, ty:15.5, r:2,   cardId:0, nextLv:true,  label:'城门' },
      ];
    case 2:
      return [
        { id:'ceramic',  tx:7,  ty:12,   r:2,   cardId:1, nextLv:true,  label:'陶瓷' },
        { id:'silk',     tx:12, ty:10,   r:2,   cardId:1, nextLv:true,  label:'丝绸' },
        { id:'tea',      tx:17, ty:12,   r:2,   cardId:1, nextLv:true,  label:'茶叶' },
      ];
    case 3:
      return [
        { id:'shisanhang', tx:9,  ty:9,  r:3,   cardId:2, nextLv:false, label:'十三行' },
        { id:'whampoa',    tx:18, ty:14, r:2.5, cardId:3, nextLv:true,  label:'黄埔军校' },
      ];
    case 4:
      return [
        { id:'tower', tx:12, ty:10, r:3, cardId:4, nextLv:false, victory:true, label:'广州塔' },
      ];
  }
  return [];
}

// Level start positions & HUD strings
const LEVEL_INFO = {
  1: { tx:12, ty:21, tag:'第一关', name:'任嚣筑城 · 番禺立都',    tip:'走向城门，触碰进入番禺城！',         sky0:'#2a200a', sky1:'#0a0a14' },
  2: { tx:12, ty:22, tag:'第二关', name:'唐宋·海上丝绸之路',      tip:'触碰码头上的货物，了解贸易！',       sky0:'#0a1a2a', sky1:'#050a18' },
  3: { tx:12, ty:22, tag:'第三关', name:'清朝民国·十三行黄埔',    tip:'探索十三行，找到黄埔军校进入第四关！', sky0:'#1a1218', sky1:'#080610' },
  4: { tx:12, ty:20, tag:'第四关', name:'现代广州·小蛮腰',        tip:'走向广州塔，触碰完成历史旅程！',      sky0:'#050a18', sky1:'#020406' },
};

// ═══════════════════════════════════════════════════════
//  Audio
// ═══════════════════════════════════════════════════════
let audioCtx = null;
const penta = [261.63, 329.63, 392, 523.25, 659.25];
let bgmTimer = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  bgmLoop();
}

function note(freq, vol, dur, type = 'sine') {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = type; o.frequency.value = freq;
  const t = audioCtx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(); o.stop(t + dur + 0.05);
}

function sfxJump()    { note(280, 0.12, 0.15, 'triangle'); }
function sfxUnlock()  { [392,523.25,659.25,783.99].forEach((f,i)=>setTimeout(()=>note(f,0.12,0.5),i*80)); }
function sfxVictory() { [261.63,329.63,392,523.25,659.25,880].forEach((f,i)=>setTimeout(()=>note(f,0.15,0.8,'sawtooth'),i*100)); }

function bgmLoop() {
  if (!audioCtx) return;
  const f = penta[Math.floor(Math.random()*penta.length)];
  note(f, 0.035, 2);
  bgmTimer = setTimeout(bgmLoop, 1600 + Math.random() * 1800);
}

// ═══════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════
function init() {
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  document.addEventListener('keydown', e => {
    K[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); doJump(); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  document.addEventListener('keyup', e => { K[e.code] = false; });

  document.getElementById('start-game-btn').addEventListener('click', startGame);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('replay-btn').addEventListener('click', replayGame);
  document.getElementById('audio-toggle').addEventListener('click', () => {
    if (!audioCtx) return;
    audioCtx.state === 'suspended' ? audioCtx.resume() : audioCtx.suspend();
  });
}

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  centerCam(P.tx, P.ty);
}

function centerCam(tx, ty) {
  cam.sx = W / 2 - (tx - ty) * TW / 2;
  cam.sy = H * 0.5 - (tx + ty) * TH / 2;
}

// ═══════════════════════════════════════════════════════
//  Game flow
// ═══════════════════════════════════════════════════════
function startGame() {
  initAudio();
  const ss = document.getElementById('start-screen');
  ss.style.opacity = '0'; ss.style.pointerEvents = 'none';
  setTimeout(() => { ss.style.display = 'none'; document.getElementById('game-container').style.display = 'block'; }, 700);
  loadLevel(1);
  gameState = 'playing';
  rafId = requestAnimationFrame(loop);
}

function loadLevel(lv) {
  currentLevel = lv;
  triggered.clear();
  const info = LEVEL_INFO[lv];
  P.tx = info.tx; P.ty = info.ty;
  P.jumpH = 0; P.jumpV = 0; P.onGround = true;
  centerCam(P.tx, P.ty);
  updateHUD(lv);
}

function updateHUD(lv) {
  const info = LEVEL_INFO[lv];
  const tips = { 1:'走向城门，触碰进入番禺城！', 2:'触碰码头货物，了解海上贸易！', 3:'探索十三行，再找黄埔军校进入下一关！', 4:'走向广州塔，触碰完成历史旅程！' };
  document.getElementById('hud-level-number').textContent = info.tag;
  document.getElementById('hud-level-name').textContent   = info.name;
  document.getElementById('tips-text').textContent        = tips[lv];

  const obj = document.getElementById('objective-list-container');
  const lists = {
    1: ['前往地图中心番禺城', '触碰城门解锁历史图册'],
    2: ['找到码头上三堆货物', '触碰任意货物了解海丝之路'],
    3: ['触碰十三行联排商行（收集图册）', '前往黄埔军校解锁第四关'],
    4: ['找到广州塔（小蛮腰）', '触碰广州塔完成2800年旅程'],
  };
  obj.innerHTML = (lists[lv]||[]).map(t =>
    `<li class="objective-item"><span class="objective-checkbox"></span>${t}</li>`
  ).join('');
}

function unlockSlot(cardId) {
  if (unlockedSlots.has(cardId)) return;
  unlockedSlots.add(cardId);
  const slot = document.getElementById(`slot-${cardId}`);
  if (slot) slot.classList.add('unlocked');
}

// ═══════════════════════════════════════════════════════
//  Modal
// ═══════════════════════════════════════════════════════
function showModal(cardId, onClose, autoCloseMs = 0) {
  gameState   = 'modal';
  modalCardId = cardId;
  modalOnClose = onClose;
  modalAutoMs  = autoCloseMs;

  const c = CARDS[cardId];
  document.getElementById('modal-card-title').textContent  = c.title;
  document.getElementById('modal-card-period').textContent = c.period;
  document.getElementById('modal-card-desc').textContent   = c.desc;
  document.getElementById('modal-card-img').src = c.image;
  document.getElementById('modal-card-img').alt = c.title;

  document.getElementById('history-modal').classList.add('active');
  unlockSlot(cardId);
  sfxUnlock();
}

function closeModal() {
  document.getElementById('history-modal').classList.remove('active');
  const cb = modalOnClose;
  modalOnClose = null;
  modalCardId  = -1;
  if (cb) cb();
  else gameState = 'playing';
}

// ═══════════════════════════════════════════════════════
//  Level transitions & victory
// ═══════════════════════════════════════════════════════
function goNextLevel() {
  if (currentLevel >= 4) { doVictory(); return; }
  gameState  = 'transition';
  transAlpha = 0;
  transDir   = 1;
  transNext  = currentLevel + 1;
}

function doVictory() {
  gameState = 'victory';
  sfxVictory();
  document.getElementById('victory-screen').classList.add('active');
}

function replayGame() {
  document.getElementById('victory-screen').classList.remove('active');
  unlockedSlots.forEach(id => {
    const s = document.getElementById(`slot-${id}`);
    if (s) s.classList.remove('unlocked');
  });
  unlockedSlots.clear();
  triggered.clear();
  loadLevel(1);
  gameState = 'playing';
}

// ═══════════════════════════════════════════════════════
//  Player physics
// ═══════════════════════════════════════════════════════
function doJump() {
  if (!P.onGround || gameState !== 'playing') return;
  P.jumpV = -7; P.onGround = false;
  sfxJump();
}

// ═══════════════════════════════════════════════════════
//  Update
// ═══════════════════════════════════════════════════════
function update(dt) {
  // Transition fade
  if (gameState === 'transition') {
    transAlpha += transDir * dt * 0.0025;
    if (transAlpha >= 1 && transDir === 1) {
      transDir = -1;
      loadLevel(transNext);
      gameState = 'transition'; // keep fading out
    }
    if (transAlpha <= 0 && transDir === -1) {
      transAlpha = 0; gameState = 'playing';
    }
    return;
  }

  // Modal auto-close
  if (gameState === 'modal') {
    if (modalAutoMs > 0) { modalAutoMs -= dt; if (modalAutoMs <= 0) closeModal(); }
    return;
  }

  if (gameState !== 'playing') return;

  // Movement
  let dx = 0, dy = 0;
  if (K['ArrowRight'] || K['KeyD']) dx =  1;
  if (K['ArrowLeft']  || K['KeyA']) dx = -1;
  if (K['ArrowDown']  || K['KeyS']) dy =  1;
  if (K['ArrowUp']    || K['KeyW']) dy = -1;

  P.moving = dx !== 0 || dy !== 0;
  if (P.moving) {
    P.tx += dx * P.speed * dt / 16;
    P.ty += dy * P.speed * dt / 16;
    P.walkPhase += dt * 0.006;
    P.tx = Math.max(0.5, Math.min(23.5, P.tx));
    P.ty = Math.max(0.5, Math.min(23.5, P.ty));
  }

  // Jump physics
  if (!P.onGround) {
    P.jumpH += P.jumpV * dt / 16;
    P.jumpV += 0.45 * dt / 16;
    if (P.jumpH >= 0) { P.jumpH = 0; P.jumpV = 0; P.onGround = true; }
  }

  // Smooth camera follow
  const sp = t2s(P.tx, P.ty);
  cam.sx += (W / 2   - sp.x) * 0.1;
  cam.sy += (H * 0.55 - sp.y) * 0.1;

  // Check collisions with interactables
  for (const obj of getObjects(currentLevel)) {
    if (triggered.has(obj.id)) continue;
    const dist = Math.hypot(P.tx - obj.tx, P.ty - obj.ty);
    if (dist < obj.r) {
      triggered.add(obj.id);
      if (obj.victory) {
        showModal(obj.cardId, () => { setTimeout(doVictory, 200); }, 5000);
      } else if (obj.nextLv) {
        showModal(obj.cardId, () => { goNextLevel(); });
      } else {
        showModal(obj.cardId, () => { gameState = 'playing'; });
      }
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Drawing helpers
// ═══════════════════════════════════════════════════════

/** Draw flat diamond tile */
function drawTile(tx, ty, topColor) {
  const { x, y } = t2s(tx, ty);
  const hw = TW / 2, hh = TH / 2;
  ctx.beginPath();
  ctx.moveTo(x,      y - hh);
  ctx.lineTo(x + hw, y);
  ctx.lineTo(x,      y + hh);
  ctx.lineTo(x - hw, y);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

/**
 * Draw an isometric box (building / wall).
 * tw = x-axis tiles wide, td = y-axis tiles deep, bh = height px
 * c = { top, right, left }
 */
function drawBox(tx, ty, tw, td, bh, c) {
  const ox = (tx - ty) * TW / 2 + cam.sx;
  const oy = (tx + ty) * TH / 2 + cam.sy;
  const rx = tw * TW / 2, ry = tw * TH / 2;
  const lx = -td * TW / 2, ly = td * TH / 2;

  // Right face
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + rx, oy + ry);
  ctx.lineTo(ox + rx, oy + ry - bh);
  ctx.lineTo(ox, oy - bh);
  ctx.closePath();
  ctx.fillStyle = c.right || '#888';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke();

  // Left face
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + lx, oy + ly);
  ctx.lineTo(ox + lx, oy + ly - bh);
  ctx.lineTo(ox, oy - bh);
  ctx.closePath();
  ctx.fillStyle = c.left || '#aaa';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.stroke();

  // Top face
  ctx.beginPath();
  ctx.moveTo(ox, oy - bh);
  ctx.lineTo(ox + rx, oy + ry - bh);
  ctx.lineTo(ox + rx + lx, oy + ry + ly - bh);
  ctx.lineTo(ox + lx, oy + ly - bh);
  ctx.closePath();
  ctx.fillStyle = c.top || '#ccc';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.stroke();
}

/** Draw text label floating above a tile */
function floatLabel(tx, ty, text, abovePx, color = '#FFD700', size = 13) {
  const { x, y } = t2s(tx, ty);
  ctx.save();
  ctx.font = `bold ${size}px "Noto Serif SC", serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
  ctx.fillText(text, x, y - abovePx);
  ctx.restore();
}

/** Animated glow pulse below/at a tile */
function drawGlow(tx, ty, r) {
  const { x, y } = t2s(tx, ty);
  const pulse = 0.45 + Math.sin(Date.now() * 0.004) * 0.3;
  const px = r * TW / 2;
  ctx.save();
  ctx.globalAlpha = pulse * 0.45;
  const g = ctx.createRadialGradient(x, y, 0, x, y, px);
  g.addColorStop(0, '#FFD700');
  g.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, px, px * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Tree sprite */
function drawTree(tx, ty) {
  const { x, y } = t2s(tx, ty);
  ctx.save();
  ctx.fillStyle = '#5a3010';
  ctx.fillRect(x - 3, y - 26, 6, 16);
  ctx.fillStyle = '#2a7010';
  ctx.beginPath(); ctx.moveTo(x, y - 58); ctx.lineTo(x + 14, y - 26); ctx.lineTo(x - 14, y - 26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#389018';
  ctx.beginPath(); ctx.moveTo(x, y - 68); ctx.lineTo(x + 11, y - 42); ctx.lineTo(x - 11, y - 42); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** Simple sailing ship */
function drawShip(tx, ty, hull) {
  const { x, y } = t2s(tx, ty);
  ctx.save();
  // Hull
  ctx.fillStyle = hull;
  ctx.beginPath(); ctx.ellipse(x, y - 8, 38, 13, -0.15, 0, Math.PI * 2); ctx.fill();
  // Deck
  ctx.fillStyle = '#c8a060';
  ctx.fillRect(x - 28, y - 22, 56, 10);
  // Mast
  ctx.strokeStyle = '#7a4510'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 4, y - 22); ctx.lineTo(x - 4, y - 68); ctx.stroke();
  // Sail
  ctx.fillStyle = 'rgba(225,205,155,0.88)';
  ctx.beginPath(); ctx.moveTo(x - 4, y - 64); ctx.lineTo(x + 24, y - 44); ctx.lineTo(x - 4, y - 32); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** Cargo pile — shape: 'tri'|'sq'|'cir', animated pulse */
function drawCargo(shape, tx, ty, label) {
  const { x, y } = t2s(tx, ty);
  const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.06;
  ctx.save();
  ctx.translate(x, y - 28);
  ctx.scale(pulse, pulse);

  if (shape === 'tri') {
    // Ceramic (陶瓷) — blue triangle
    ctx.fillStyle = '#4888d8'; ctx.strokeStyle = '#2868b8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(26, 0); ctx.lineTo(-26, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6aaBe8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(10, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18, -4); ctx.lineTo(18, -4); ctx.stroke();
  } else if (shape === 'sq') {
    // Silk (丝绸) — pink/magenta square
    ctx.fillStyle = '#d860a8'; ctx.strokeStyle = '#a84080'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(-20, -38, 40, 38); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,160,220,0.7)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-20, -28 + i * 8); ctx.lineTo(20, -28 + i * 8); ctx.stroke(); }
  } else {
    // Tea (茶叶) — green circle
    ctx.fillStyle = '#50a840'; ctx.strokeStyle = '#307020'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -18, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#40882a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -36); ctx.bezierCurveTo(10, -28, 10, -10, 0, -4); ctx.bezierCurveTo(-10, -10, -10, -28, 0, -36); ctx.stroke();
  }

  ctx.restore();

  // Label above
  floatLabel(tx, ty, label, 65, '#FFD700', 14);
}

/** Canton Tower (广州塔 / 小蛮腰) */
function drawCantonTower(tx, ty) {
  const { x, y } = t2s(tx, ty);
  ctx.save();

  // Base ring
  ctx.fillStyle = '#4a6070';
  ctx.beginPath(); ctx.ellipse(x, y - 4, 32, 16, 0, 0, Math.PI * 2); ctx.fill();

  // Tower body — pinched waist shape
  const grad = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
  grad.addColorStop(0, '#90b8d0'); grad.addColorStop(0.5, '#c8e8f8'); grad.addColorStop(1, '#90b8d0');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x - 13, y - 8);
  ctx.bezierCurveTo(x - 22, y - 80, x - 4, y - 125, x - 7, y - 190);
  ctx.bezierCurveTo(x - 3, y - 230, x + 3, y - 230, x + 7, y - 190);
  ctx.bezierCurveTo(x + 4, y - 125, x + 22, y - 80, x + 13, y - 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#708aaa'; ctx.lineWidth = 1; ctx.stroke();

  // Lattice lines
  ctx.strokeStyle = 'rgba(160,220,255,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const frac = i / 12;
    const hy = y - 14 - frac * 215;
    const hw = 3 + 10 * Math.sin(frac * Math.PI);
    ctx.beginPath(); ctx.moveTo(x - hw - 3, hy); ctx.lineTo(x + hw + 3, hy); ctx.stroke();
  }

  // Antenna
  ctx.strokeStyle = '#80a0c0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y - 230); ctx.lineTo(x, y - 280); ctx.stroke();

  // Top light
  ctx.fillStyle = '#ffe060';
  ctx.beginPath(); ctx.arc(x, y - 280, 4, 0, Math.PI * 2); ctx.fill();

  // Label
  floatLabel(tx, ty, '广州塔 · 小蛮腰', 288, '#FFD700', 15);
  ctx.restore();
}

/** HUD banner at top center */
function drawBanner(period, title) {
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,10,0.7)';
  roundRect(ctx, W / 2 - 210, 10, 420, 60, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(226,192,141,0.45)'; ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c8a060'; ctx.font = '12px "Noto Serif SC",serif';
  ctx.fillText(period, W / 2, 30);
  ctx.fillStyle = '#FFE080'; ctx.font = 'bold 22px "Noto Serif SC",serif';
  ctx.shadowColor = 'rgba(255,200,0,0.4)'; ctx.shadowBlur = 8;
  ctx.fillText(title, W / 2, 57);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ═══════════════════════════════════════════════════════
//  Player drawing
// ═══════════════════════════════════════════════════════
function drawPlayer() {
  const { x, y } = t2s(P.tx, P.ty);
  const py = y + P.jumpH;

  // Shadow
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, 0.28 + P.jumpH / 80);
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const wa = P.moving ? Math.sin(P.walkPhase) * 0.45 : 0;
  ctx.save();
  ctx.translate(x, py);

  // Body
  ctx.fillStyle = '#FFD700'; ctx.strokeStyle = '#B8960A'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, -21, 6, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Head
  ctx.fillStyle = '#FFD700';
  ctx.beginPath(); ctx.arc(0, -36, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Eyes
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(-3, -37, 1.5, 0, Math.PI * 2); ctx.arc(3, -37, 1.5, 0, Math.PI * 2); ctx.fill();

  // Smile
  ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, -35, 4, 0.25, Math.PI - 0.25); ctx.stroke();

  // Legs
  ctx.strokeStyle = '#B8960A'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-3, -12); ctx.lineTo(-5 + wa * 8, 0);
  ctx.moveTo(3, -12);  ctx.lineTo(5 - wa * 8, 0);
  ctx.stroke();

  // Arms
  ctx.beginPath();
  ctx.moveTo(-5, -28); ctx.lineTo(-11 - wa * 6, -19);
  ctx.moveTo(5, -28);  ctx.lineTo(11 + wa * 6, -19);
  ctx.stroke();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════
//  Level 1 – 秦朝番禺
// ═══════════════════════════════════════════════════════
function drawLevel1() {
  const S = 25;
  // Ground
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      let col = COL.grass.t;
      if (r >= 15 && r <= 17 && c >= 9 && c <= 15) col = COL.stone.t;   // path
      if (r >= 6  && r <= 14 && c >= 7  && c <= 17) col = COL.city.t;   // city interior
      drawTile(c, r, col);
    }
  }

  // Outer walls — top
  for (let c = 7; c <= 17; c++) drawBox(c, 5, 1, 1, 32, { top:'#b0a070', right:'#706030', left:'#504020' });
  // Bottom wall (gate gap at c=11-13)
  for (let c = 7; c <= 17; c++) {
    if (c < 11 || c > 13) drawBox(c, 15, 1, 1, 32, { top:'#b0a070', right:'#706030', left:'#504020' });
  }
  // Side walls
  for (let r = 5; r <= 15; r++) {
    drawBox(7,  r, 1, 1, 32, { top:'#b0a070', right:'#706030', left:'#504020' });
    drawBox(17, r, 1, 1, 32, { top:'#b0a070', right:'#706030', left:'#504020' });
  }

  // Gate towers
  drawBox(10, 14.5, 1, 1.5, 52, { top:'#d0b878', right:'#907038', left:'#705020' });
  drawBox(13, 14.5, 1, 1.5, 52, { top:'#d0b878', right:'#907038', left:'#705020' });

  // Inner buildings
  drawBox(9,  7, 2, 2, 38, { top:'#d8c880', right:'#a09050', left:'#806830' });
  drawBox(13, 7, 2, 2, 38, { top:'#d8c880', right:'#a09050', left:'#806830' });
  drawBox(10, 11, 2, 2, 28, { top:'#c8b870', right:'#988848', left:'#786828' });

  // Trees
  [[3,3],[21,3],[3,20],[21,20],[5,12],[19,10],[2,17],[22,8]].forEach(([tx,ty])=>drawTree(tx,ty));

  // Glow on gate
  drawGlow(12, 15.5, 2.2);
  floatLabel(12, 14, '城 门', 56, '#FFD700', 15);

  drawBanner('秦朝 · 公元前214年', '任嚣筑城 · 番禺立都');
}

// ═══════════════════════════════════════════════════════
//  Level 2 – 唐宋海上丝绸之路
// ═══════════════════════════════════════════════════════
function drawLevel2() {
  const S = 25;
  // Ground
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      let col;
      if (c < 4 || c > 20 || r < 3) col = COL.water.t;
      else if (r < 7)                col = COL.sand.t;
      else                           col = COL.wood.t;
      drawTile(c, r, col);
    }
  }

  // Dock planks
  for (let r = 3; r <= 6; r++) {
    for (let c = 4; c <= 20; c++) {
      drawBox(c, r, 1, 1, 4, { top:'#7a5528', right:'#4a3210', left:'#2a1800' });
    }
  }

  // Ships
  drawShip(3.5,  4, '#7a3808');
  drawShip(11.5, 2.5, '#5a3210');
  drawShip(18,   4.5, '#7a4510');

  // City buildings background
  for (let i = 0; i < 5; i++) {
    drawBox(5 + i * 3, 9, 2, 2, 30, { top:'#c8b880', right:'#988858', left:'#786840' });
  }

  // Cargo piles + glows
  drawGlow(7, 12, 2);  drawCargo('tri', 7, 12, '陶瓷');
  drawGlow(12, 10, 2); drawCargo('sq', 12, 10, '丝绸');
  drawGlow(17, 12, 2); drawCargo('cir', 17, 12, '茶叶');

  // Faint shimmer on water
  ctx.save();
  ctx.globalAlpha = 0.12 + Math.sin(Date.now() * 0.002) * 0.05;
  ctx.fillStyle = '#aaddff';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.restore();

  drawBanner('唐宋时期 · 海上丝绸之路', '海上贸易 · 四海繁华');
}

// ═══════════════════════════════════════════════════════
//  Level 3 – 清朝民国·十三行·黄埔
// ═══════════════════════════════════════════════════════
function drawLevel3() {
  const S = 25;
  // Ground
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      let col;
      if (r >= 20 && r <= 23)          col = COL.water.t;
      else if (c % 5 === 0 || r % 5 === 0) col = COL.road.t;
      else                               col = COL.dirt.t;
      drawTile(c, r, col);
    }
  }

  // 十三行 row houses — 6 connected buildings
  const shColors = [
    { top:'#d8a870', right:'#9a6840', left:'#784820' },
    { top:'#c89858', right:'#886030', left:'#684018' },
  ];
  for (let i = 0; i < 6; i++) {
    drawBox(4 + i * 2, 7, 2, 2, 44, shColors[i % 2]);
    // Window cutout
    const {x, y} = t2s(5 + i * 2, 8);
    ctx.save();
    ctx.fillStyle = 'rgba(255,220,120,0.3)';
    ctx.beginPath(); ctx.rect(x - 5, y - 36, 10, 12); ctx.fill();
    ctx.restore();
  }
  floatLabel(9, 7, '十三行商行', 50, '#FFE080', 14);

  // Wu mansion (伍秉鉴)
  drawBox(5, 12, 4, 3, 52, { top:'#e0c878', right:'#a88040', left:'#806020' });
  drawBox(6, 11, 2, 1, 22, { top:'#c8a850', right:'#907030', left:'#685010' }); // roof ornament
  floatLabel(7, 12, '伍氏大宅', 58, '#FFD700', 13);

  // Whampoa Military Academy
  drawBox(15, 11, 6, 5, 46, { top:'#7a8a78', right:'#4a5848', left:'#283828' });
  drawBox(17, 10, 2, 1, 22, { top:'#6a7860', right:'#3a4840', left:'#182820' }); // gatehouse
  // Flag pole
  const { x: fx, y: fy } = t2s(18, 11);
  ctx.save();
  ctx.strokeStyle = '#8a9878'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(fx, fy - 46); ctx.lineTo(fx, fy - 80); ctx.stroke();
  ctx.fillStyle = '#d83020';
  ctx.beginPath(); ctx.rect(fx, fy - 80, 18, 12); ctx.fill();
  ctx.restore();
  floatLabel(18, 12, '黄埔军校', 52, '#FFE080', 15);

  // Trees
  [[2,3],[23,3],[2,18],[23,16]].forEach(([tx,ty])=>drawTree(tx,ty));

  // Glows
  if (!triggered.has('shisanhang')) drawGlow(9, 9, 3);
  drawGlow(18, 14, 2.5);

  drawBanner('清朝 · 民国时期', '十三行 · 黄埔军校');
}

// ═══════════════════════════════════════════════════════
//  Level 4 – 现代广州·小蛮腰
// ═══════════════════════════════════════════════════════
function drawLevel4() {
  const S = 25;
  // Ground
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      let col;
      if (r >= 9 && r <= 12)   col = COL.water.t;   // Pearl River
      else if (r < 3 || r > 21) col = COL.modern.t;
      else                       col = COL.modern.t;
      drawTile(c, r, col);
    }
  }

  // North bank — CBD towers
  const northTowers = [[1,1,2,2,75],[5,1,2,2,90],[9,1,2,2,65],[13,1,2,2,100],[17,1,2,2,80],[21,1,2,2,70]];
  for (const [tx,ty,tw,td,bh] of northTowers) {
    drawBox(tx,ty,tw,td,bh, { top:'#7090a0', right:'#405870', left:'#283848' });
    // Lit windows
    const {x,y} = t2s(tx+tw/2, ty+td/2);
    ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(Date.now()*0.001 + tx)*0.1;
    ctx.fillStyle = '#aaddff';
    ctx.beginPath(); ctx.rect(x-6, y-bh+8, 12, bh-12); ctx.fill();
    ctx.restore();
  }

  // South bank buildings
  const southTowers = [[1,14,2,2,60],[5,14,2,2,55],[9,14,2,2,70],[17,14,2,2,65],[21,14,2,2,58]];
  for (const [tx,ty,tw,td,bh] of southTowers) {
    drawBox(tx,ty,tw,td,bh, { top:'#607888', right:'#384858', left:'#182838' });
  }

  // Pearl River shimmer
  ctx.save();
  ctx.globalAlpha = 0.18 + Math.sin(Date.now() * 0.0015) * 0.06;
  ctx.fillStyle = '#88ccff';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Canton Tower
  drawCantonTower(12, 10);
  drawGlow(12, 10, 3);

  drawBanner('现代广州 · 新世纪新地标', '广州塔 · 小蛮腰');
}

// ═══════════════════════════════════════════════════════
//  Main render
// ═══════════════════════════════════════════════════════
function render() {
  ctx.clearRect(0, 0, W, H);

  // Sky gradient
  const info = LEVEL_INFO[currentLevel];
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, info.sky0);
  sky.addColorStop(1, info.sky1 || '#050510');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars (levels 2-4)
  if (currentLevel >= 2) {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137.5) % W;
      const sy = ((i * 97 + 30) % (H * 0.4));
      const alpha = 0.3 + Math.sin(Date.now() * 0.001 + i) * 0.2;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Level scene
  switch (currentLevel) {
    case 1: drawLevel1(); break;
    case 2: drawLevel2(); break;
    case 3: drawLevel3(); break;
    case 4: drawLevel4(); break;
  }

  // Player
  drawPlayer();

  // Transition fade-to-black
  if (gameState === 'transition' && transAlpha > 0) {
    ctx.fillStyle = `rgba(0,0,0,${transAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ═══════════════════════════════════════════════════════
//  Game loop
// ═══════════════════════════════════════════════════════
function loop(ts) {
  const dt = Math.min(ts - lastTs, 50);
  lastTs = ts;
  update(dt);
  render();
  rafId = requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════
//  Boot
// ═══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', init);
