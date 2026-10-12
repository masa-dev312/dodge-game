(() => {
  'use strict';

  // 論理解像度(縦長固定)。表示は画面に合わせて拡大縮小する
  const W = 360;
  const H = 640;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');

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
  };

  const COLORS = {
    player: '#4fd1ff',
    shield: '#9cff8f',
    circle: '#ff5c7a',
    triangle: '#ffb547',
    diamond: '#c77dff',
    wall: '#ff7b54',
    coin: '#ffe066',
    text: '#ffffff',
    sub: '#9aa3c7',
  };

  // ---- 画面フィット ----
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
    canvas.width = Math.floor(W * dpr * scale);
    canvas.height = Math.floor(H * dpr * scale);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- 保存(使えない環境でも動くように try/catch) ----
  function loadBest() {
    try { return Number(localStorage.getItem('dodge.best')) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('dodge.best', String(v)); } catch (e) { /* 保存できなくても続行 */ }
  }
  function loadMuted() {
    try { return localStorage.getItem('dodge.muted') === '1'; } catch (e) { return false; }
  }
  function saveMuted(v) {
    try { localStorage.setItem('dodge.muted', v ? '1' : '0'); } catch (e) { /* noop */ }
  }

  // ---- 効果音(WebAudioで生成。素材ファイル不要) ----
  let audio = null;
  let muted = loadMuted();
  muteBtn.textContent = muted ? '🔇' : '🔊';
  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur);
    } catch (e) { /* 音が出なくても続行 */ }
  }
  const sfx = {
    coin: () => { beep(880, 0.08, 'square', 0.08); setTimeout(() => beep(1320, 0.1, 'square', 0.08), 60); },
    shield: () => beep(520, 0.25, 'triangle', 0.15),
    block: () => beep(300, 0.2, 'sawtooth', 0.12),
    over: () => { beep(220, 0.3, 'sawtooth', 0.15); setTimeout(() => beep(140, 0.4, 'sawtooth', 0.15), 150); },
  };
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    muted = !muted;
    saveMuted(muted);
    muteBtn.textContent = muted ? '🔇' : '🔊';
  });
  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---- 状態 ----
  const state = {
    scene: 'title',  // title | play | over
    t: 0,
    score: 0,
    best: loadBest(),
    newBest: false,
    player: { x: W / 2, y: H - 70, shield: false },
    things: [],
    spawnTimer: 0,
    stars: [],
    flash: 0,
    overAt: 0,
  };
  for (let i = 0; i < 50; i++) {
    state.stars.push({ x: Math.random() * W, y: Math.random() * H, s: 20 + Math.random() * 60, r: Math.random() * 1.5 + 0.5 });
  }

  // ---- 入力 ----
  const keys = { left: false, right: false };
  const touches = new Map(); // pointerId -> 'left' | 'right'

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if ((e.key === ' ' || e.key === 'Enter') && state.scene !== 'play') start();
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
    if (state.scene !== 'play') { start(); return; }
    touches.set(e.pointerId, sideOf(e));
  });
  window.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, sideOf(e));
  });
  const release = (e) => touches.delete(e.pointerId);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  function inputDir() {
    let l = keys.left, r = keys.right;
    for (const side of touches.values()) {
      if (side === 'left') l = true; else r = true;
    }
    return (r ? 1 : 0) - (l ? 1 : 0);
  }

  // ---- ゲーム進行 ----
  function start() {
    // ゲームオーバー直後の誤タップで即リスタートしないよう少し待つ
    if (state.scene === 'over' && performance.now() - state.overAt < 600) return;
    state.scene = 'play';
    state.t = 0;
    state.score = 0;
    state.newBest = false;
    state.player.x = W / 2;
    state.player.shield = false;
    state.things = [];
    state.spawnTimer = 0.5;
    touches.clear();
  }

  function gameOver() {
    state.scene = 'over';
    state.overAt = performance.now();
    const s = Math.floor(state.score);
    if (s > state.best) {
      state.best = s;
      state.newBest = true;
      saveBest(s);
    }
    sfx.over();
  }

  function fallSpeed() { return TUNE.baseFall + TUNE.fallGrowth * state.t; }
  function spawnInterval() { return Math.max(TUNE.minInterval, TUNE.baseInterval - TUNE.intervalDecay * state.t); }

  function spawn() {
    const t = state.t;
    const v = fallSpeed();
    const roll = Math.random();

    if (roll < TUNE.shieldChance && !state.player.shield) {
      state.things.push({ kind: 'shield', x: 20 + Math.random() * (W - 40), y: -20, r: 12, vy: v * 0.8 });
      return;
    }
    if (roll < TUNE.shieldChance + TUNE.coinChance) {
      state.things.push({ kind: 'coin', x: 20 + Math.random() * (W - 40), y: -20, r: 10, vy: v * 0.8 });
      return;
    }

    // 時間に応じて出てくる障害物を増やす
    const pool = ['circle'];
    if (t >= 15) pool.push('triangle');
    if (t >= 30) pool.push('diamond');
    if (t >= 45) pool.push('wall');
    const kind = pool[Math.floor(Math.random() * pool.length)];

    if (kind === 'wall') {
      const gap = 90;
      const gapX = 20 + Math.random() * (W - gap - 40);
      state.things.push({ kind: 'wall', y: -16, h: 16, gapX, gap, vy: v * 0.7 });
      return;
    }
    const r = kind === 'circle' ? 14 + Math.random() * 10 : 14;
    const x = r + Math.random() * (W - r * 2);
    const o = { kind, x, y: -r, r, vy: kind === 'triangle' ? v * 1.5 : v };
    if (kind === 'diamond') { o.baseX = x; o.phase = Math.random() * Math.PI * 2; o.amp = 40 + Math.random() * 30; }
    state.things.push(o);
  }

  function hitCircle(px, py, pr, o) {
    const dx = px - o.x, dy = py - o.y;
    return dx * dx + dy * dy < (pr + o.r) * (pr + o.r);
  }

  function update(dt) {
    // 背景の星はどの画面でも流す
    for (const s of state.stars) {
      s.y += s.s * dt;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }
    if (state.flash > 0) state.flash -= dt;
    if (state.scene !== 'play') return;

    state.t += dt;
    state.score += TUNE.pointsPerSecond * dt;

    const p = state.player;
    const half = TUNE.playerSize / 2;
    p.x += inputDir() * TUNE.playerSpeed * dt;
    p.x = Math.max(half, Math.min(W - half, p.x));

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawn();
      state.spawnTimer = spawnInterval();
    }

    const pr = half * TUNE.hitboxScale;
    const keep = [];
    for (const o of state.things) {
      o.y += o.vy * dt;
      if (o.kind === 'diamond') {
        o.phase += dt * 3;
        o.x = Math.max(o.r, Math.min(W - o.r, o.baseX + Math.sin(o.phase) * o.amp));
      }

      let hit = false;
      if (o.kind === 'wall') {
        const inBand = p.y + pr > o.y && p.y - pr < o.y + o.h;
        const inGap = p.x - pr > o.gapX && p.x + pr < o.gapX + o.gap;
        hit = inBand && !inGap;
      } else {
        hit = hitCircle(p.x, p.y, pr, o);
      }

      if (hit) {
        if (o.kind === 'coin') { state.score += TUNE.coinPoints; sfx.coin(); continue; }
        if (o.kind === 'shield') { p.shield = true; sfx.shield(); continue; }
        if (p.shield) { p.shield = false; state.flash = 0.3; sfx.block(); continue; }
        gameOver();
        return;
      }
      const bottom = o.kind === 'wall' ? o.y : o.y - o.r;
      if (bottom < H + 40) keep.push(o);
    }
    state.things = keep;
  }

  // ---- 描画 ----
  function drawShape(o) {
    ctx.fillStyle = COLORS[o.kind];
    ctx.beginPath();
    if (o.kind === 'circle' || o.kind === 'coin') {
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    } else if (o.kind === 'triangle') {
      ctx.moveTo(o.x, o.y + o.r);
      ctx.lineTo(o.x - o.r, o.y - o.r);
      ctx.lineTo(o.x + o.r, o.y - o.r);
      ctx.closePath();
    } else if (o.kind === 'diamond') {
      ctx.moveTo(o.x, o.y - o.r);
      ctx.lineTo(o.x + o.r, o.y);
      ctx.lineTo(o.x, o.y + o.r);
      ctx.lineTo(o.x - o.r, o.y);
      ctx.closePath();
    } else if (o.kind === 'shield') {
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 3;
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.fill();
  }

  function text(str, x, y, size, color, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = `bold ${size}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function draw() {
    ctx.fillStyle = '#11142a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const s of state.stars) ctx.fillRect(s.x, s.y, s.r, s.r);

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(156,255,143,${state.flash})`;
      ctx.fillRect(0, 0, W, H);
    }

    for (const o of state.things) {
      if (o.kind === 'wall') {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(0, o.y, o.gapX, o.h);
        ctx.fillRect(o.gapX + o.gap, o.y, W - o.gapX - o.gap, o.h);
      } else {
        drawShape(o);
      }
    }

    const p = state.player;
    const s = TUNE.playerSize;
    if (state.scene !== 'title') {
      ctx.fillStyle = COLORS.player;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      if (p.shield) {
        ctx.strokeStyle = COLORS.shield;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (state.scene === 'play') {
      text(String(Math.floor(state.score)), W / 2, 36, 28);
      text(`${state.t.toFixed(1)}秒`, 12, 20, 14, COLORS.sub, 'left');
    } else if (state.scene === 'title') {
      text('よけゲー', W / 2, H * 0.32, 44);
      text('落ちてくる図形をよけよう', W / 2, H * 0.32 + 48, 16, COLORS.sub);
      text(`ハイスコア ${state.best}`, W / 2, H * 0.52, 18);
      text('タップ / スペースでスタート', W / 2, H * 0.68, 18, COLORS.player);
      text('PC: ← → / A D', W / 2, H * 0.80, 14, COLORS.sub);
      text('スマホ: 画面の左右をタッチ', W / 2, H * 0.80 + 22, 14, COLORS.sub);
    } else if (state.scene === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      text('ゲームオーバー', W / 2, H * 0.30, 34);
      text(`スコア ${Math.floor(state.score)}`, W / 2, H * 0.42, 26);
      text(`生存 ${state.t.toFixed(1)}秒`, W / 2, H * 0.42 + 34, 16, COLORS.sub);
      text(state.newBest ? 'ハイスコア更新！' : `ハイスコア ${state.best}`, W / 2, H * 0.56, 18, state.newBest ? COLORS.coin : COLORS.text);
      text('タップ / スペースでもう一度', W / 2, H * 0.70, 18, COLORS.player);
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
