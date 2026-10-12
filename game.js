(() => {
  'use strict';

  // 論理解像度(縦長固定)。表示は画面に合わせて拡大縮小する
  const W = 360;
  const H = 640;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');
  const pauseBtn = document.getElementById('pause');

  // ---- 調整用パラメータ(初期値。試遊して調整する) ----
  const TUNE = {
    playerSpeed: 300,      // px/秒
    playerSize: 28,
    hitboxScale: 0.7,      // 当たり判定を見た目より小さくする割合
    baseFall: 160,         // 落下速度の初期値 px/秒
    fallGrowth: 4,         // 1秒ごとに増える落下速度
    baseInterval: 0.9,     // 出現間隔の初期値 秒
    minInterval: 0.28,
    intervalDecay: 0.012,  // 1秒ごとに縮む出現間隔
    coinChance: 0.12,
    shieldChance: 0.03,
    pointsPerSecond: 10,
    coinPoints: 50,
    nearMissDist: 16,      // 当たり判定の外側この距離以内をかすめたらニアミス
    nearMissPoints: 5,     // ニアミス1回の基本点(コンボ倍率がかかる)
    comboWindow: 2.0,      // この秒数以内に次のニアミスでコンボ継続
    maxCombo: 5,
    levelSeconds: 15,      // この秒数ごとにレベルが上がる
    warnTime: 0.6,         // 速い障害物と壁の予告表示の秒数
    ranks: [               // スコアに応じた評価(しきい値は仮)
      { min: 1000, label: 'S', color: '#ffe066' },
      { min: 600, label: 'A', color: '#ff8fd8' },
      { min: 300, label: 'B', color: '#4fd1ff' },
      { min: 0, label: 'C', color: '#9aa3c7' },
    ],
  };

  const COLORS = {
    bg: '#11142a',
    player: '#4fd1ff',
    shield: '#9cff8f',
    circle: '#ff5c7a',
    triangle: '#ffb547',
    diamond: '#c77dff',
    wall: '#ff7b54',
    hexagon: '#4dffd2',
    coin: '#ffe066',
    text: '#ffffff',
    sub: '#9aa3c7',
    warn: '#ff4d4d',
  };

  // 図形図鑑(タイトルとレベルアップ表示で使う)
  const SHAPES = [
    { kind: 'circle', name: 'ボール', desc: 'まっすぐ落ちる', from: 0 },
    { kind: 'triangle', name: 'トゲ', desc: '速い。上に予告が出る', from: 15 },
    { kind: 'diamond', name: 'ゆらゆら', desc: '左右にゆれる', from: 30 },
    { kind: 'wall', name: 'カベ', desc: 'すき間を通る', from: 45 },
    { kind: 'hexagon', name: 'ブンレツ', desc: '途中で2つに割れる', from: 60 },
  ];

  // ---- 画面フィット ----
  let viewScale = 1;
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    viewScale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * viewScale) + 'px';
    canvas.style.height = Math.floor(H * viewScale) + 'px';
    canvas.width = Math.floor(W * dpr * viewScale);
    canvas.height = Math.floor(H * dpr * viewScale);
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- 保存(使えない環境でも動くように try/catch) ----
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, String(v)); } catch (e) { /* 保存できなくても続行 */ }
  }

  // 書き換えられた値(負の数・巨大な数・文字列)はハイスコアとして使わない
  function loadBest() {
    const v = Math.floor(Number(load('dodge.best', 0)));
    return Number.isFinite(v) && v >= 0 && v < 1e7 ? v : 0;
  }

  // ---- 効果音(WebAudioで生成。素材ファイル不要) ----
  let audio = null;
  let muted = load('dodge.muted', '0') === '1';
  function beep(freq, dur, type, vol, slideTo) {
    if (muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator();
      const g = audio.createGain();
      const now = audio.currentTime;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, now);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      g.gain.setValueAtTime(vol || 0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(now + dur);
    } catch (e) { /* 音が出なくても続行 */ }
  }
  const later = (ms, fn) => setTimeout(fn, ms);
  const sfx = {
    coin: () => { beep(880, 0.08, 'square', 0.07); later(60, () => beep(1320, 0.1, 'square', 0.07)); },
    shield: () => beep(400, 0.3, 'triangle', 0.15, 900),
    block: () => beep(500, 0.25, 'sawtooth', 0.12, 150),
    near: (combo) => beep(600 + combo * 120, 0.06, 'sine', 0.08),
    level: () => { beep(523, 0.1, 'square', 0.08); later(100, () => beep(659, 0.1, 'square', 0.08)); later(200, () => beep(784, 0.18, 'square', 0.08)); },
    count: () => beep(440, 0.12, 'square', 0.1),
    go: () => beep(880, 0.25, 'square', 0.1),
    hit: () => beep(300, 0.5, 'sawtooth', 0.18, 40),
    over: () => { beep(330, 0.25, 'triangle', 0.12); later(200, () => beep(247, 0.25, 'triangle', 0.12)); later(400, () => beep(196, 0.5, 'triangle', 0.12)); },
    best: () => { [523, 659, 784, 1047].forEach((f, i) => later(i * 90, () => beep(f, 0.15, 'square', 0.08))); },
  };
  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* noop */ }
  }

  // index.html が古いままキャッシュされていてボタンが無くても動くようにする
  function refreshButtons() {
    if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
    if (pauseBtn) {
      pauseBtn.textContent = state.scene === 'paused' ? '▶' : 'Ⅱ';
      pauseBtn.style.visibility = (state.scene === 'play' || state.scene === 'paused') ? 'visible' : 'hidden';
    }
  }
  for (const btn of [muteBtn, pauseBtn]) {
    if (btn) btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  function toggleMute() {
    muted = !muted;
    save('dodge.muted', muted ? '1' : '0');
    refreshButtons();
  }
  if (muteBtn) muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMute();
  });
  if (pauseBtn) pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePause();
  });

  // ---- 状態 ----
  const state = {
    scene: 'title',  // title | countdown | play | paused | dying | over
    sceneT: 0,       // 今のシーンに入ってからの秒数
    t: 0,
    score: 0,
    best: loadBest(),
    newBest: false,
    level: 1,
    coins: 0,
    nearMisses: 0,
    combo: 0,
    maxCombo: 0,
    comboTimer: 0,
    player: { x: W / 2, y: H - 70, shield: false, tilt: 0 },
    trail: [],
    things: [],
    particles: [],
    popups: [],
    banner: null,     // { title, sub, t }
    spawnTimer: 0,
    shake: 0,
    flash: 0,
    overAt: 0,
    deco: [],         // タイトル画面で漂う図形
    stars: [],
  };
  refreshButtons();

  for (let i = 0; i < 60; i++) {
    state.stars.push({ x: Math.random() * W, y: Math.random() * H, s: 15 + Math.random() * 70, r: Math.random() * 1.5 + 0.5 });
  }
  for (let i = 0; i < 9; i++) {
    const sh = SHAPES[i % SHAPES.length];
    state.deco.push({
      kind: sh.kind === 'wall' ? 'circle' : sh.kind,
      x: Math.random() * W, y: Math.random() * H,
      r: 10 + Math.random() * 14, vy: 20 + Math.random() * 30,
      rot: Math.random() * 6, spin: (Math.random() - 0.5) * 2,
    });
  }

  function setScene(s) {
    state.scene = s;
    state.sceneT = 0;
    refreshButtons();
  }

  // ---- 入力 ----
  const keys = { left: false, right: false };
  const touches = new Map(); // pointerId -> 'left' | 'right'

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return; }
    if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state.scene === 'paused') togglePause();
      else if (state.scene === 'title' || state.scene === 'over') start();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  function sideOf(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
  }
  window.addEventListener('pointerdown', (e) => {
    if (state.scene === 'title' || state.scene === 'over') { start(); return; }
    if (state.scene === 'paused') { togglePause(); return; }
    touches.set(e.pointerId, sideOf(e));
  });
  window.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, sideOf(e));
  });
  const release = (e) => touches.delete(e.pointerId);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // タブを離れたら自動で一時停止
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.scene === 'play') togglePause();
  });
  window.addEventListener('blur', () => { keys.left = keys.right = false; touches.clear(); });

  function inputDir() {
    let l = keys.left, r = keys.right;
    for (const side of touches.values()) {
      if (side === 'left') l = true; else r = true;
    }
    return (r ? 1 : 0) - (l ? 1 : 0);
  }

  function togglePause() {
    if (state.scene === 'play') { setScene('paused'); touches.clear(); }
    else if (state.scene === 'paused') { state.scene = 'play'; refreshButtons(); }
  }

  // ---- ゲーム進行 ----
  function start() {
    // ゲームオーバー直後の誤タップで即リスタートしないよう少し待つ
    if (state.scene === 'over' && performance.now() - state.overAt < 600) return;
    Object.assign(state, {
      t: 0, score: 0, newBest: false, level: 1, coins: 0, nearMisses: 0,
      combo: 0, maxCombo: 0, comboTimer: 0, things: [], particles: [], popups: [],
      trail: [], banner: null, spawnTimer: 0.4, shake: 0, flash: 0,
    });
    state.player.x = W / 2;
    state.player.y = H - 70;
    state.player.tilt = 0;
    state.player.shield = false;
    touches.clear();
    setScene('countdown');
    sfx.count();
  }

  function die() {
    setScene('dying');
    state.shake = 0.5;
    state.flash = 0.5;
    burst(state.player.x, state.player.y, COLORS.player, 40, 260);
    sfx.hit();
    vibrate(200);
  }

  function gameOver() {
    setScene('over');
    state.overAt = performance.now();
    const s = Math.floor(state.score);
    if (s > state.best) {
      state.best = s;
      state.newBest = true;
      save('dodge.best', s);
      later(500, sfx.best);
    } else {
      sfx.over();
    }
  }

  function rankOf(score) {
    return TUNE.ranks.find((r) => score >= r.min);
  }

  function fallSpeed() { return TUNE.baseFall + TUNE.fallGrowth * state.t; }
  function spawnInterval() { return Math.max(TUNE.minInterval, TUNE.baseInterval - TUNE.intervalDecay * state.t); }

  function spawn() {
    const t = state.t;
    const v = fallSpeed();
    const roll = Math.random();
    const rx = (r) => r + Math.random() * (W - r * 2);

    if (roll < TUNE.shieldChance && !state.player.shield) {
      state.things.push({ kind: 'shield', x: rx(14), y: -20, r: 12, vy: v * 0.75, rot: 0 });
      return;
    }
    if (roll < TUNE.shieldChance + TUNE.coinChance) {
      state.things.push({ kind: 'coin', x: rx(12), y: -20, r: 10, vy: v * 0.8, rot: 0 });
      return;
    }

    // 時間に応じて出てくる障害物を増やす
    const pool = SHAPES.filter((s) => t >= s.from).map((s) => s.kind);
    const kind = pool[Math.floor(Math.random() * pool.length)];

    if (kind === 'wall') {
      const gap = 90;
      const vy = v * 0.7;
      // 予告表示の時間ぶん画面の上から始める
      state.things.push({ kind: 'wall', y: -16 - vy * TUNE.warnTime, h: 16, gapX: 20 + Math.random() * (W - gap - 40), gap, vy });
      return;
    }
    const r = kind === 'circle' ? 13 + Math.random() * 11 : kind === 'hexagon' ? 18 : 14;
    const o = { kind, x: rx(r), y: -r, r, vy: v, vx: 0, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 4 };
    if (kind === 'triangle') { o.vy = v * 1.5; o.y = -r - o.vy * TUNE.warnTime; o.spin = 0; }
    if (kind === 'diamond') { o.baseX = o.x; o.phase = Math.random() * Math.PI * 2; o.amp = 40 + Math.random() * 30; o.spin = 3; }
    if (kind === 'hexagon') { o.vy = v * 0.8; o.splitY = H * (0.3 + Math.random() * 0.15); }
    state.things.push(o);
  }

  // ---- 演出 ----
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3 });
    }
  }
  function popup(x, y, str, color, size) {
    state.popups.push({ x, y, str, color: color || COLORS.text, size: size || 16, life: 0.9 });
  }
  function levelUp(level) {
    const unlocked = SHAPES.find((s) => s.from === (level - 1) * TUNE.levelSeconds && s.from > 0);
    state.banner = {
      title: `LEVEL ${level}`,
      sub: unlocked ? `新しい図形「${unlocked.name}」 ${unlocked.desc}` : 'スピードアップ！',
      kind: unlocked ? unlocked.kind : null,
      t: 0,
    };
    sfx.level();
  }

  function hitCircle(px, py, pr, o, extra) {
    const dx = px - o.x, dy = py - o.y;
    const d = pr + o.r + (extra || 0);
    return dx * dx + dy * dy < d * d;
  }

  // ---- 更新 ----
  function update(dt) {
    state.sceneT += dt;

    // 背景はどの画面でも流す
    const bgSpeed = state.scene === 'play' ? 1 + state.t / 40 : 1;
    for (const s of state.stars) {
      s.y += s.s * dt * bgSpeed;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }
    if (state.scene === 'title') {
      for (const d of state.deco) {
        d.y += d.vy * dt; d.rot += d.spin * dt;
        if (d.y > H + 30) { d.y = -30; d.x = Math.random() * W; }
      }
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    updateEffects(dt);

    if (state.scene === 'countdown') {
      const before = Math.floor(state.sceneT - dt);
      const now = Math.floor(state.sceneT);
      if (now !== before && now >= 1 && now <= 2) sfx.count();
      if (state.sceneT >= 3) { setScene('play'); sfx.go(); popup(W / 2, H * 0.4, 'GO!', COLORS.shield, 48); }
      movePlayer(dt);
      return;
    }
    if (state.scene === 'dying') {
      // スローモーションで障害物を流す
      moveThings(dt * 0.2);
      if (state.sceneT > 0.9) gameOver();
      return;
    }
    if (state.scene !== 'play') return;

    state.t += dt;
    state.score += TUNE.pointsPerSecond * dt;

    const lv = 1 + Math.floor(state.t / TUNE.levelSeconds);
    if (lv > state.level) { state.level = lv; levelUp(lv); }

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    movePlayer(dt);

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawn();
      state.spawnTimer = spawnInterval();
    }

    moveThings(dt);
    collide();
  }

  function movePlayer(dt) {
    const p = state.player;
    const half = TUNE.playerSize / 2;
    const dir = inputDir();
    p.x += dir * TUNE.playerSpeed * dt;
    p.x = Math.max(half, Math.min(W - half, p.x));
    p.tilt += (dir * 0.25 - p.tilt) * Math.min(1, dt * 12);
    state.trail.push({ x: p.x, y: p.y, life: 0.25 });
  }

  function moveThings(dt) {
    const out = [];
    for (const o of state.things) {
      o.y += o.vy * dt;
      if (o.vx) o.x += o.vx * dt;
      if (o.spin) o.rot += o.spin * dt;
      if (o.kind === 'coin' || o.kind === 'shield') o.rot += dt * 4;
      if (o.kind === 'diamond') {
        o.phase += dt * 3;
        o.x = Math.max(o.r, Math.min(W - o.r, o.baseX + Math.sin(o.phase) * o.amp));
      }
      if (o.kind === 'hexagon' && o.y >= o.splitY) {
        // 2つの小さなボールに割れて斜めに広がる
        burst(o.x, o.y, COLORS.hexagon, 10, 120);
        for (const s of [-1, 1]) {
          out.push({ kind: 'circle', x: o.x, y: o.y, r: 11, vy: o.vy, vx: s * (70 + Math.random() * 50), rot: 0, spin: 0, split: true });
        }
        beep(700, 0.08, 'triangle', 0.06, 300);
        continue;
      }
      if (o.kind === 'circle' && o.vx && (o.x < o.r || o.x > W - o.r)) {
        o.vx = -o.vx;
        o.x = Math.max(o.r, Math.min(W - o.r, o.x));
      }
      const top = o.kind === 'wall' ? o.y : o.y - o.r;
      if (top < H + 40) out.push(o);
    }
    state.things = out;
  }

  function collide() {
    const p = state.player;
    const pr = (TUNE.playerSize / 2) * TUNE.hitboxScale;
    const keep = [];
    for (const o of state.things) {
      let hit = false;
      let near = false;
      if (o.kind === 'wall') {
        const inBand = p.y + pr > o.y && p.y - pr < o.y + o.h;
        const inGap = p.x - pr > o.gapX && p.x + pr < o.gapX + o.gap;
        hit = inBand && !inGap;
        near = inBand && inGap && (p.x - pr - o.gapX < TUNE.nearMissDist || o.gapX + o.gap - p.x - pr < TUNE.nearMissDist);
      } else {
        hit = hitCircle(p.x, p.y, pr, o);
        near = !hit && hitCircle(p.x, p.y, pr, o, TUNE.nearMissDist);
      }

      if (hit) {
        if (o.kind === 'coin') {
          state.score += TUNE.coinPoints; state.coins++;
          burst(o.x, o.y, COLORS.coin, 12, 140);
          popup(o.x, o.y - 10, `+${TUNE.coinPoints}`, COLORS.coin);
          sfx.coin();
          continue;
        }
        if (o.kind === 'shield') {
          p.shield = true;
          burst(o.x, o.y, COLORS.shield, 14, 140);
          popup(o.x, o.y - 10, 'シールド！', COLORS.shield);
          sfx.shield();
          continue;
        }
        if (p.shield) {
          p.shield = false;
          state.flash = 0.3; state.shake = 0.25;
          burst(p.x, p.y, COLORS.shield, 24, 200);
          if (o.kind !== 'wall') burst(o.x, o.y, COLORS[o.kind], 12, 160);
          popup(p.x, p.y - 30, 'ガード！', COLORS.shield);
          sfx.block();
          vibrate(60);
          continue; // ぶつかった障害物は消す
        }
        die();
        return;
      }

      if (near && !o.nearDone && o.kind !== 'coin' && o.kind !== 'shield') {
        o.nearDone = true;
        state.combo = Math.min(TUNE.maxCombo, state.combo + 1);
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.comboTimer = TUNE.comboWindow;
        state.nearMisses++;
        const pts = TUNE.nearMissPoints * state.combo;
        state.score += pts;
        popup(p.x, p.y - 34, state.combo > 1 ? `ニアミス x${state.combo} +${pts}` : `ニアミス +${pts}`, '#ff8fd8', 14);
        sfx.near(state.combo);
      }
      keep.push(o);
    }
    state.things = keep;
  }

  function updateEffects(dt) {
    for (const q of state.particles) {
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 0.96; q.vy *= 0.96;
      q.life -= dt;
    }
    state.particles = state.particles.filter((q) => q.life > 0);
    for (const q of state.popups) { q.y -= 40 * dt; q.life -= dt; }
    state.popups = state.popups.filter((q) => q.life > 0);
    for (const q of state.trail) q.life -= dt;
    state.trail = state.trail.filter((q) => q.life > 0);
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t > 2.2) state.banner = null;
    }
  }

  // ---- 描画 ----
  function polygon(x, y, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawShape(o, alpha) {
    const color = COLORS[o.kind];
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    const rot = o.rot || 0;
    if (o.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      // つや
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === 'triangle') {
      // 下向きのトゲ
      ctx.beginPath();
      ctx.moveTo(o.x, o.y + o.r * 1.2);
      ctx.lineTo(o.x - o.r, o.y - o.r);
      ctx.lineTo(o.x + o.r, o.y - o.r);
      ctx.closePath();
      ctx.fill();
    } else if (o.kind === 'diamond') {
      polygon(o.x, o.y, o.r * 1.1, 4, rot);
      ctx.fill();
    } else if (o.kind === 'hexagon') {
      polygon(o.x, o.y, o.r, 6, rot);
      ctx.fill();
      // 割れ目
      ctx.shadowBlur = 0;
      ctx.strokeStyle = COLORS.bg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - o.r);
      ctx.lineTo(o.x + 3, o.y);
      ctx.lineTo(o.x - 2, o.y + o.r);
      ctx.stroke();
    } else if (o.kind === 'coin') {
      // 回転して見えるよう横幅を変える
      const sx = Math.abs(Math.cos(rot)) * 0.8 + 0.2;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.r * sx, o.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(o.x - 1.5 * sx, o.y - o.r * 0.5, 3 * sx, o.r);
    } else if (o.kind === 'shield') {
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 3;
      polygon(o.x, o.y, o.r, 6, rot * 0.5);
      ctx.stroke();
      ctx.globalAlpha *= 0.35;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWall(o) {
    ctx.save();
    ctx.shadowColor = COLORS.wall;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(0, o.y, o.gapX, o.h);
    ctx.fillRect(o.gapX + o.gap, o.y, W - o.gapX - o.gap, o.h);
    // しま模様
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = -20; x < W; x += 20) {
      if (x + 10 > o.gapX && x < o.gapX + o.gap) continue;
      ctx.beginPath();
      ctx.moveTo(x, o.y + o.h); ctx.lineTo(x + 10, o.y); ctx.lineTo(x + 18, o.y); ctx.lineTo(x + 8, o.y + o.h);
      ctx.fill();
    }
    ctx.restore();
  }

  // 画面外から来る速い障害物と壁の予告
  function drawWarnings() {
    const blink = Math.floor(performance.now() / 120) % 2 === 0;
    for (const o of state.things) {
      if (o.kind === 'triangle' && o.y + o.r < 0) {
        ctx.fillStyle = blink ? COLORS.warn : 'rgba(255,77,77,0.4)';
        ctx.beginPath();
        ctx.moveTo(o.x, 26); ctx.lineTo(o.x - 9, 10); ctx.lineTo(o.x + 9, 10);
        ctx.closePath();
        ctx.fill();
        text('!', o.x, 40, 14, COLORS.warn);
      } else if (o.kind === 'wall' && o.y < 0) {
        ctx.fillStyle = blink ? 'rgba(255,77,77,0.55)' : 'rgba(255,77,77,0.2)';
        ctx.fillRect(0, 4, o.gapX, 4);
        ctx.fillRect(o.gapX + o.gap, 4, W - o.gapX - o.gap, 4);
      }
    }
  }

  function drawPlayer(alpha) {
    const p = state.player;
    const s = TUNE.playerSize;
    for (const q of state.trail) {
      ctx.fillStyle = `rgba(79,209,255,${(q.life / 0.25) * 0.25})`;
      const k = s * (0.4 + q.life * 2);
      ctx.fillRect(q.x - k / 2, q.y - k / 2 + 6, k, k);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.tilt);
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLORS.player;
    roundRect(-s / 2, -s / 2, s, s, 6);
    ctx.fill();
    // 目
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.bg;
    const look = p.tilt * 12;
    ctx.fillRect(-7 + look, -4, 4, 6);
    ctx.fillRect(3 + look, -4, 4, 6);
    ctx.restore();
    if (p.shield) {
      ctx.save();
      ctx.strokeStyle = COLORS.shield;
      ctx.shadowColor = COLORS.shield;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      polygon(p.x, p.y, s * 0.95, 6, performance.now() / 600);
      ctx.stroke();
      ctx.restore();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(str, x, y, size, color, align, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color || COLORS.text;
    ctx.font = `bold ${size}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function button(label, y, color) {
    const w = 200, h = 52, x = W / 2 - w / 2;
    const pulse = 1 + Math.sin(performance.now() / 300) * 0.03;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(pulse, pulse);
    ctx.translate(-W / 2, -y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    roundRect(x, y - h / 2, w, h, 26);
    ctx.fill();
    ctx.restore();
    text(label, W / 2, y + 1, 20, COLORS.bg);
  }

  function drawTitle() {
    for (const d of state.deco) drawShape(d, 0.15);

    // ロゴ: 文字ごとに少し跳ねる
    const logo = 'よけゲー';
    const now = performance.now() / 1000;
    for (let i = 0; i < logo.length; i++) {
      const x = W / 2 + (i - (logo.length - 1) / 2) * 50;
      const y = 150 + Math.sin(now * 3 + i * 0.7) * 6;
      text(logo[i], x + 3, y + 3, 52, 'rgba(79,209,255,0.35)');
      text(logo[i], x, y, 52, COLORS.text);
    }
    text('落ちてくる図形をよけつづけろ！', W / 2, 205, 15, COLORS.sub);

    // デモ: 自機が左右にゆれる
    state.player.x = W / 2 + Math.sin(now * 1.6) * 60;
    state.player.tilt = Math.cos(now * 1.6) * 0.2;
    state.player.y = 262;
    drawPlayer(1);

    button('スタート', 335, COLORS.player);
    text(state.best > 0 ? `ハイスコア  ${state.best}` : 'ハイスコア  ―', W / 2, 385, 16, COLORS.coin);

    // 図形図鑑
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(24, 410, W - 48, 150, 12);
    ctx.fill();
    text('図形ずかん', W / 2, 428, 13, COLORS.sub);
    SHAPES.forEach((s, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const cx = 70 + col * 110 - (row === 1 ? -55 : 0);
      const cy = 465 + row * 58;
      if (s.kind === 'wall') {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(cx - 18, cy - 4, 12, 8);
        ctx.fillRect(cx + 6, cy - 4, 12, 8);
      } else {
        drawShape({ kind: s.kind, x: cx, y: cy, r: 11, rot: now }, 1);
      }
      text(s.name, cx, cy + 22, 11, COLORS.text);
    });
    const items = [['coin', 'コイン +50'], ['shield', 'シールド']];
    text('アイテム', W / 2, 578, 12, COLORS.sub);
    items.forEach(([k, name], i) => {
      const cx = W / 2 - 60 + i * 120;
      drawShape({ kind: k, x: cx - 30, y: 600, r: 9, rot: now * 2 }, 1);
      text(name, cx + 6, 600, 12, COLORS.text);
    });

    text('PC: ← →  /  スマホ: 画面の左右をタッチ', W / 2, 628, 11, COLORS.sub);
  }

  function drawHud() {
    text(String(Math.floor(state.score)), W / 2, 36, 30);
    text(`LV ${state.level}`, 12, 20, 13, COLORS.sub, 'left');
    text(`${state.t.toFixed(1)}秒`, 12, 38, 13, COLORS.sub, 'left');
    if (state.combo > 1) {
      text(`コンボ x${state.combo}`, W / 2, 64, 14, '#ff8fd8', 'center', Math.min(1, state.comboTimer));
    }
    // タッチ中の側をうっすら光らせる
    for (const side of touches.values()) {
      const g = ctx.createLinearGradient(side === 'left' ? 0 : W, 0, W / 2, 0);
      g.addColorStop(0, 'rgba(79,209,255,0.15)');
      g.addColorStop(1, 'rgba(79,209,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(side === 'left' ? 0 : W / 2, 0, W / 2, H);
    }
  }

  function drawBanner() {
    const b = state.banner;
    if (!b) return;
    const inOut = Math.min(1, b.t / 0.25, (2.2 - b.t) / 0.4);
    const slide = (1 - Math.min(1, b.t / 0.25)) * -W;
    ctx.save();
    ctx.globalAlpha = Math.max(0, inOut);
    ctx.translate(slide, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, H * 0.3 - 40, W, 80);
    ctx.restore();
    text(b.title, W / 2 + slide, H * 0.3 - 10, 30, COLORS.coin, 'center', Math.max(0, inOut));
    // 新しい図形のアイコンは説明文の左に並べる
    ctx.font = 'bold 13px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
    const icon = b.kind && b.kind !== 'wall';
    const tw = ctx.measureText(b.sub).width + (icon ? 26 : 0);
    const left = W / 2 - tw / 2 + slide;
    if (icon) drawShape({ kind: b.kind, x: left + 9, y: H * 0.3 + 18, r: 9, rot: b.t * 3 }, Math.max(0, inOut));
    text(b.sub, left + (icon ? 26 : 0), H * 0.3 + 18, 13, COLORS.text, 'left', Math.max(0, inOut));
  }

  function drawOver() {
    const k = Math.min(1, state.sceneT / 0.3);
    ctx.fillStyle = `rgba(5,6,15,${0.7 * k})`;
    ctx.fillRect(0, 0, W, H);
    const score = Math.floor(state.score);
    const rank = rankOf(score);
    const pop = 1 + Math.max(0, 0.6 - state.sceneT) * 1.5;

    text('ゲームオーバー', W / 2, 110, 30, COLORS.text, 'center', k);

    // ランク
    ctx.save();
    ctx.translate(W / 2, 195);
    ctx.scale(pop, pop);
    ctx.shadowColor = rank.color;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = rank.color;
    ctx.lineWidth = 4;
    polygon(0, 0, 44, 6, 0);
    ctx.stroke();
    ctx.restore();
    text(rank.label, W / 2, 197, 48 * pop, rank.color, 'center', k);

    text(`${score}`, W / 2, 278, 40, COLORS.text, 'center', k);
    if (state.newBest) {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      text('★ ハイスコア更新！ ★', W / 2, 315, 17, blink ? COLORS.coin : '#fff3b0');
    } else {
      text(`ハイスコア ${state.best}`, W / 2, 315, 15, COLORS.sub);
    }

    // 成績
    const stats = [
      ['生存時間', `${state.t.toFixed(1)}秒`],
      ['到達レベル', `${state.level}`],
      ['コイン', `${state.coins}`],
      ['ニアミス', `${state.nearMisses}回`],
      ['最大コンボ', `x${state.maxCombo}`],
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(50, 345, W - 100, stats.length * 26 + 16, 12);
    ctx.fill();
    stats.forEach(([label, v], i) => {
      text(label, 70, 366 + i * 26, 14, COLORS.sub, 'left', k);
      text(v, W - 70, 366 + i * 26, 14, COLORS.text, 'right', k);
    });

    if (performance.now() - state.overAt > 600) button('もう一度', 548, COLORS.player);
    text('タップ / スペースでリトライ', W / 2, 590, 12, COLORS.sub);
  }

  function draw() {
    const sx = canvas.width / W, sy = canvas.height / H;
    let ox = 0, oy = 0;
    if (state.shake > 0) {
      const m = state.shake * 16;
      ox = (Math.random() - 0.5) * m;
      oy = (Math.random() - 0.5) * m;
    }
    ctx.setTransform(sx, 0, 0, sy, ox * sx, oy * sy);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const s of state.stars) ctx.fillRect(s.x, s.y, s.r, s.r);

    if (state.scene === 'title') {
      drawTitle();
    } else {
      for (const o of state.things) {
        if (o.kind === 'wall') drawWall(o); else drawShape(o);
      }
      if (state.scene === 'play' || state.scene === 'countdown' || state.scene === 'paused') drawWarnings();
      if (state.scene !== 'dying' && state.scene !== 'over') drawPlayer(1);
    }

    for (const q of state.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.6})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    if (state.scene === 'play' || state.scene === 'paused' || state.scene === 'dying') drawHud();
    for (const q of state.popups) text(q.str, q.x, q.y, q.size, q.color, 'center', Math.min(1, q.life * 2));
    drawBanner();

    if (state.scene === 'countdown') {
      const n = 3 - Math.floor(state.sceneT);
      const f = state.sceneT % 1;
      text(String(n), W / 2, H * 0.4, 90 * (1.4 - f * 0.4), COLORS.text, 'center', 1 - f * 0.6);
      text('左右に動いてよけよう', W / 2, H * 0.4 + 80, 15, COLORS.sub);
    } else if (state.scene === 'paused') {
      ctx.fillStyle = 'rgba(5,6,15,0.6)';
      ctx.fillRect(0, 0, W, H);
      text('一時停止中', W / 2, H * 0.4, 30);
      text('タップ / スペースで再開', W / 2, H * 0.4 + 44, 15, COLORS.sub);
    } else if (state.scene === 'over') {
      drawOver();
    }
  }

  // ---- ループ ----
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // タブ復帰時の大ジャンプを防ぐ
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 動作確認用
  window.__dodge = { state, TUNE, start };
})();
