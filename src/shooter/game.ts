(() => {

  // 論理解像度(縦長固定)。表示は画面に合わせて拡大縮小する
  const W = 360;
  const H = 640;

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const muteBtn = document.getElementById('mute');
  const pauseBtn = document.getElementById('pause');

  // ---- 調整用パラメータ(初期値。試遊して調整する) ----
  const TUNE = {
    playerSpeed: 300,      // px/秒
    playerSize: 28,
    hitboxScale: 0.7,      // 当たり判定を見た目より小さくする割合
    baseFall: 175,         // 落下速度の初期値 px/秒(よけゲーは 160)
    fallGrowth: 5,         // 1秒ごとに増える落下速度(よけゲーは 4)
    baseInterval: 0.55,    // 出現間隔の初期値 秒(壊せるぶん、よけゲーより多め)
    minInterval: 0.2,
    intervalDecay: 0.012,  // 1秒ごとに縮む出現間隔
    coinChance: 0.12,
    shieldChance: 0.03,
    pointsPerSecond: 5,
    fireInterval: 0.22,    // 弾を撃つ間隔(秒)。弾は自動で撃つ
    bulletSpeed: 720,      // 弾の速さ px/秒
    bulletR: 4,            // 弾の当たり判定の半径
    powerChance: 0.02,     // パワーアップの出現確率(ブンレツを壊したときにも落ちる)
    powerTime: 6,          // パワーアップ(3方向に撃つ)が続く秒数
    hp: { circle: 1, triangle: 1, sweeper: 1, diamond: 3, riser: 2, hexagon: 6 } as Partial<Record<Kind, number>>,
    bigCircleR: 20,        // この半径以上のボールは HP 2
    killPoints: { circle: 20, triangle: 30, sweeper: 30, diamond: 40, riser: 40, hexagon: 60 } as Partial<Record<Kind, number>>,
    chainWindow: 1.2,      // この秒数以内に次を壊すと撃破チェインが続く
    maxChain: 5,           // 撃破点にかかる倍率の上限
    blastR: 46,            // 誘爆: 壊れた図形のまわりこの距離にいる図形に1ダメージ
    closeDist: 110,        // 自機からこの距離以内で壊すと「ギリギリ撃破」で点が2倍
    dropCoin: 0.12,        // 壊したときにコインを落とす確率
    wallGap: 120,          // カベのすき間の幅(よけゲーは 90)
    wallEvery: 4,          // カベとカベの間は最低この秒数あける
    wallClear: 0.6,        // カベが出た直後、この秒数は他の障害物を出さない
    wallWiden: 6,          // すき間のふち近くに弾を当てると、すき間がこの px 広がる
    wallMaxGap: 200,
    coinPoints: 50,
    nearMissDist: 16,      // 当たり判定の外側この距離以内をかすめたらニアミス
    nearMissPoints: 5,     // ニアミス1回の基本点(コンボ倍率がかかる)
    comboWindow: 2.0,      // この秒数以内に次のニアミスでコンボ継続
    maxCombo: 5,
    levelSeconds: 10,      // この秒数ごとにレベルが上がり、新しい図形が1種類増える
    playerMinY: 0.4,       // 自機が上に動ける限界(画面の高さに対する割合)
    stickRadius: 50,       // スマホのスティックをいっぱいに倒したとみなす距離
    stickDeadZone: 0.15,   // スティックの遊び(この割合以下は止まる)
    warnTime: 0.6,         // 速い障害物と壁の予告表示の秒数
    ranks: [               // スコアに応じた評価(しきい値は仮)
      { min: 3500, label: 'S', color: '#ffe066' },
      { min: 2000, label: 'A', color: '#ff8fd8' },
      { min: 1000, label: 'B', color: '#4fd1ff' },
      { min: 0, label: 'C', color: '#9aa3c7' },
    ],
  };

  // 障害物は赤、橙、桃、紫、藍の「危ない色」、アイテムは金、緑、虹色にして、色だけでも見分けられるようにする
  const COLORS: Record<Kind | 'bg' | 'player' | 'text' | 'sub' | 'warn' | 'bullet', string> = {
    bg: '#11142a',
    player: '#4fd1ff',
    shield: '#7dffa8',
    circle: '#ff5c7a',
    triangle: '#ff8a3c',
    diamond: '#c77dff',
    wall: '#ff7b54',
    hexagon: '#7d8bff',
    sweeper: '#ff6bd6',
    riser: '#ff3b4e',
    coin: '#ffe066',
    power: '#ffffff',
    bullet: '#bff4ff',
    text: '#ffffff',
    sub: '#9aa3c7',
    warn: '#ff4d4d',
  };

  // 図形図鑑(タイトルとレベルアップ表示で使う)
  const SHAPES: { kind: Kind; name: string; desc: string; from: number }[] = [
    { kind: 'circle', name: 'ボール', desc: 'まっすぐ落ちる', from: 0 },
    { kind: 'triangle', name: 'トゲ', desc: '速い。上に予告が出る', from: 10 },
    { kind: 'sweeper', name: 'ヨコギリ', desc: '横から飛んでくる', from: 20 },
    { kind: 'diamond', name: 'ゆらゆら', desc: '左右にゆれる。3発で壊れる', from: 30 },
    { kind: 'wall', name: 'カベ', desc: 'ふちを撃つとすき間が広がる', from: 40 },
    { kind: 'riser', name: 'ツキアゲ', desc: '下から来る。2発で壊れる', from: 50 },
    { kind: 'hexagon', name: 'ブンレツ', desc: '固い。壊すと3方向が出る', from: 60 },
  ];

  // ---- 画面フィット ----
  let viewScale = 1;
  const stage = document.getElementById('stage');
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    viewScale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const cssW = Math.floor(W * viewScale), cssH = Math.floor(H * viewScale);
    if (stage) { stage.style.width = cssW + 'px'; stage.style.height = cssH + 'px'; }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(W * dpr * viewScale);
    canvas.height = Math.floor(H * dpr * viewScale);
    if (window.__render3d) window.__render3d.resize(cssW, cssH, dpr);
  }
  window.addEventListener('resize', fit);
  // 3D描画(render3d.js)の準備ができたら大きさを合わせる。読み込めなければ2D描画のまま
  window.addEventListener('render3d-ready', fit);
  fit();
  const r3 = () => window.__render3d || null;

  // ---- 保存(使えない環境でも動くように try/catch) ----
  function load(key: string, fallback: string | number): string | number {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
  }
  function save(key: string, v: string | number) {
    try { localStorage.setItem(key, String(v)); } catch { /* 保存できなくても続行 */ }
  }

  // 書き換えられた値(負の数・巨大な数・文字列)はハイスコアとして使わない
  function loadBest() {
    const v = Math.floor(Number(load('shoot.best', 0)));
    return Number.isFinite(v) && v >= 0 && v < 1e7 ? v : 0;
  }

  // ---- 効果音(WebAudioで生成。素材ファイル不要) ----
  let audio: AudioContext | null = null;
  let muted = load('shoot.muted', '0') === '1';
  function beep(freq: number, dur: number, type?: OscillatorType, vol?: number, slideTo?: number) {
    if (muted) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') void audio.resume();
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
    } catch { /* 音が出なくても続行 */ }
  }
  const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
  const sfx = {
    coin: () => { beep(880, 0.08, 'square', 0.07); later(60, () => beep(1320, 0.1, 'square', 0.07)); },
    shield: () => beep(400, 0.3, 'triangle', 0.15, 900),
    block: () => beep(500, 0.25, 'sawtooth', 0.12, 150),
    near: (combo: number) => beep(600 + combo * 120, 0.06, 'sine', 0.08),
    level: () => { beep(523, 0.1, 'square', 0.08); later(100, () => beep(659, 0.1, 'square', 0.08)); later(200, () => beep(784, 0.18, 'square', 0.08)); },
    count: () => beep(440, 0.12, 'square', 0.1),
    go: () => beep(880, 0.25, 'square', 0.1),
    hit: () => beep(300, 0.5, 'sawtooth', 0.18, 40),
    over: () => { beep(330, 0.25, 'triangle', 0.12); later(200, () => beep(247, 0.25, 'triangle', 0.12)); later(400, () => beep(196, 0.5, 'triangle', 0.12)); },
    shoot: () => beep(1400, 0.03, 'square', 0.015, 900),
    // 弾が当たったが壊れなかったときの音(以前は hit と同じ名前で、被弾の音を上書きしていた)
    hitShot: () => beep(500, 0.04, 'square', 0.04),
    explode: (chain: number) => { const k = 1 + Math.min(7, (chain || 1) - 1) * 0.12; beep(180 * k, 0.25, 'sawtooth', 0.1, 50); beep(90 * k, 0.3, 'triangle', 0.1); },
    power: () => { [440, 660, 880].forEach((f, i) => later(i * 70, () => beep(f, 0.12, 'square', 0.08))); },
    best: () => { [523, 659, 784, 1047].forEach((f, i) => later(i * 90, () => beep(f, 0.15, 'square', 0.08))); },
  };
  function vibrate(ms: number) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* noop */ }
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
    save('shoot.muted', muted ? '1' : '0');
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
  const state: GameState = {
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
    bullets: [],
    fireTimer: 0,
    power: 0,        // パワーアップの残り秒数
    kills: 0,
    chain: 0,
    chainTimer: 0,
    maxChain: 0,
    blasts: 0,
    closeKills: 0,
    lastWallT: -99,
    quietT: 0,
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

  function setScene(s: Scene) {
    state.scene = s;
    state.sceneT = 0;
    refreshButtons();
  }

  // ---- 入力 ----
  type Dir = 'left' | 'right' | 'up' | 'down';
  const keys: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
  const KEYMAP: Partial<Record<string, Dir>> = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
  };
  // スマホ: 指を置いた場所を中心にした「見えないスティック」。最初の1本の指だけを使う
  const stick: { id: number | null; ox: number; oy: number; x: number; y: number } = { id: null, ox: 0, oy: 0, x: 0, y: 0 };

  window.addEventListener('keydown', (e) => {
    const dir = KEYMAP[e.key];
    if (dir) { keys[dir] = true; e.preventDefault(); }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return; }
    if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state.scene === 'paused') togglePause();
      else if (state.scene === 'title' || state.scene === 'over') start();
    }
  });
  window.addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.key];
    if (dir) keys[dir] = false;
  });

  // 画面上の位置をゲームの座標(360x640)に変換する
  function toGame(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
  }
  function releaseStick() { stick.id = null; }
  window.addEventListener('pointerdown', (e) => {
    if (state.scene === 'title' || state.scene === 'over') { start(); return; }
    if (state.scene === 'paused') { togglePause(); return; }
    if (stick.id !== null) return;
    const g = toGame(e);
    stick.id = e.pointerId;
    stick.ox = stick.x = g.x;
    stick.oy = stick.y = g.y;
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    const g = toGame(e);
    stick.x = g.x;
    stick.y = g.y;
  });
  const release = (e: PointerEvent) => { if (e.pointerId === stick.id) releaseStick(); };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // タブを離れたら自動で一時停止
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.scene === 'play') togglePause();
  });
  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.up = keys.down = false;
    releaseStick();
  });

  // 移動方向を {x, y} で返す。長さは 0〜1(スティックは倒した量に比例)
  function inputDir() {
    let x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; } // 斜めが速くならないように
    if (stick.id !== null) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
      const len = Math.hypot(dx, dy);
      const amount = Math.min(1, len / TUNE.stickRadius);
      if (amount > TUNE.stickDeadZone && len > 0) {
        x = dx / len * amount;
        y = dy / len * amount;
      }
    }
    return { x, y };
  }

  function togglePause() {
    if (state.scene === 'play') { setScene('paused'); releaseStick(); }
    else if (state.scene === 'paused') { state.scene = 'play'; refreshButtons(); }
  }

  // ---- ゲーム進行 ----
  function start() {
    // ゲームオーバー直後の誤タップで即リスタートしないよう少し待つ
    if (state.scene === 'over' && performance.now() - state.overAt < 600) return;
    Object.assign(state, {
      t: 0, score: 0, newBest: false, level: 1, coins: 0, nearMisses: 0,
      combo: 0, maxCombo: 0, comboTimer: 0, things: [], particles: [], popups: [],
      bullets: [], fireTimer: 0, power: 0, kills: 0,
      chain: 0, chainTimer: 0, maxChain: 0, blasts: 0, closeKills: 0, lastWallT: -99, quietT: 0,
      trail: [], banner: null, spawnTimer: 0.4, shake: 0, flash: 0,
    });
    state.player.x = W / 2;
    state.player.y = H - 70;
    state.player.tilt = 0;
    state.player.shield = false;
    releaseStick();
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
      save('shoot.best', s);
      later(500, sfx.best);
    } else {
      sfx.over();
    }
  }

  function rankOf(score: number) {
    // しきい値 0 の C があるので必ず見つかる
    return TUNE.ranks.find((r) => score >= r.min) ?? TUNE.ranks[TUNE.ranks.length - 1];
  }

  function fallSpeed() { return TUNE.baseFall + TUNE.fallGrowth * state.t; }
  function spawnInterval() { return Math.max(TUNE.minInterval, TUNE.baseInterval - TUNE.intervalDecay * state.t); }

  function spawn() {
    const t = state.t;
    const v = fallSpeed();
    const roll = Math.random();
    const rx = (r: number) => r + Math.random() * (W - r * 2);

    if (roll < TUNE.shieldChance && !state.player.shield) {
      state.things.push({ kind: 'shield', x: rx(14), y: -20, r: 12, vy: v * 0.75, rot: 0 });
      return;
    }
    if (roll < TUNE.shieldChance + TUNE.powerChance) {
      state.things.push({ kind: 'power', x: rx(14), y: -20, r: 12, vy: v * 0.75, rot: 0 });
      return;
    }
    if (roll < TUNE.shieldChance + TUNE.powerChance + TUNE.coinChance) {
      state.things.push({ kind: 'coin', x: rx(12), y: -20, r: 10, vy: v * 0.8, rot: 0 });
      return;
    }

    // カベの直後は他の障害物を出さず、すき間へ向かう余裕を作る
    if (state.quietT > 0) return;
    // 時間に応じて出てくる障害物を増やす。カベは続けて出ないようにする
    const wallOk = t - state.lastWallT >= TUNE.wallEvery;
    const pool = SHAPES.filter((s) => t >= s.from && (s.kind !== 'wall' || wallOk)).map((s) => s.kind);
    const kind = pool[Math.floor(Math.random() * pool.length)];

    if (kind === 'wall') {
      const gap = TUNE.wallGap;
      const vy = v * 0.7;
      state.lastWallT = t;
      state.quietT = TUNE.wallClear;
      // 予告表示の時間ぶん画面の上から始める
      state.things.push({ kind: 'wall', y: -16 - vy * TUNE.warnTime, h: 16, gapX: 20 + Math.random() * (W - gap - 40), gap, vy });
      return;
    }
    const zoneTop = H * TUNE.playerMinY;
    if (kind === 'sweeper') {
      // 自機が動ける範囲の高さを、左右どちらかから横切る
      const dir = Math.random() < 0.5 ? 1 : -1;
      const vx = dir * v * 1.1;
      const r = 14;
      const x = dir > 0 ? -r - Math.abs(vx) * TUNE.warnTime : W + r + Math.abs(vx) * TUNE.warnTime;
      const y = zoneTop + 20 + Math.random() * (H - zoneTop - 50);
      state.things.push({ kind, x, y, r, vx, vy: 0, rot: 0, spin: 0, hp: TUNE.hp.sweeper });
      return;
    }
    if (kind === 'riser') {
      // 画面の下から突き上げる。自機の近くを狙う
      const r = 14;
      const vy = -v * 0.9;
      const x = Math.max(r, Math.min(W - r, state.player.x + (Math.random() - 0.5) * 140));
      state.things.push({ kind, x, y: H + r + Math.abs(vy) * TUNE.warnTime, r, vx: 0, vy, rot: 0, spin: 0, hp: TUNE.hp.riser });
      return;
    }
    const r = kind === 'circle' ? 13 + Math.random() * 11 : kind === 'hexagon' ? 18 : 14;
    const o: Shape = { kind, x: rx(r), y: -r, r, vy: v, vx: 0, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 4, hp: TUNE.hp[kind] };
    if (kind === 'circle' && r >= TUNE.bigCircleR) o.hp = 2;
    if (kind === 'triangle') { o.vy = v * 1.5; o.y = -r - o.vy * TUNE.warnTime; o.spin = 0; }
    if (kind === 'diamond') { o.baseX = o.x; o.phase = Math.random() * Math.PI * 2; o.amp = 40 + Math.random() * 30; o.spin = 3; }
    if (kind === 'hexagon') { o.vy = v * 0.8; o.splitY = H * (0.3 + Math.random() * 0.15); }
    state.things.push(o);
  }

  // ---- 演出 ----
  function burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3 });
    }
  }
  function popup(x: number, y: number, str: string, color?: string, size?: number) {
    state.popups.push({ x, y, str, color: color || COLORS.text, size: size || 16, life: 0.9 });
  }
  // 輪になって広がる破片(誘爆の範囲を見せる)
  function ring(x: number, y: number, r: number, color: string) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      state.particles.push({ x: x + Math.cos(a) * r * 0.3, y: y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * r * 2.2, vy: Math.sin(a) * r * 2.2, life: 0.32, max: 0.32, color, size: 3 });
    }
  }
  function levelUp(level: number) {
    const unlocked = SHAPES.find((s) => s.from === (level - 1) * TUNE.levelSeconds && s.from > 0);
    state.banner = {
      title: `LEVEL ${level}`,
      sub: unlocked ? `新しい図形「${unlocked.name}」 ${unlocked.desc}` : 'スピードアップ！',
      kind: unlocked ? unlocked.kind : null,
      t: 0,
    };
    sfx.level();
  }

  function hitCircle(px: number, py: number, pr: number, o: Shape, extra?: number) {
    const dx = px - o.x, dy = py - o.y;
    const d = pr + o.r + (extra || 0);
    return dx * dx + dy * dy < d * d;
  }

  // ---- 更新 ----
  function update(dt: number) {
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
    if (state.chainTimer > 0) {
      state.chainTimer -= dt;
      if (state.chainTimer <= 0) state.chain = 0;
    }
    if (state.quietT > 0) state.quietT -= dt;

    movePlayer(dt);

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawn();
      state.spawnTimer = spawnInterval();
    }

    moveThings(dt);
    fire(dt);
    moveBullets(dt);
    collide();
  }

  // ---- 弾 ----
  function fire(dt: number) {
    if (state.power > 0) state.power = Math.max(0, state.power - dt);
    state.fireTimer -= dt;
    if (state.fireTimer > 0) return;
    state.fireTimer = TUNE.fireInterval;
    const p = state.player;
    const v = TUNE.bulletSpeed;
    const shots = state.power > 0 ? [-0.22, 0, 0.22] : [0];
    for (const a of shots) {
      state.bullets.push({ x: p.x, y: p.y - TUNE.playerSize / 2, vx: Math.sin(a) * v, vy: -Math.cos(a) * v });
    }
    sfx.shoot();
  }

  // 図形を壊す。新しく生まれる物(割れたボール、落とし物)を返す。
  // dead に入れた図形は呼び出し側で取り除く
  function destroy(o: Shape, dead: Set<Thing>, cause: 'shot' | 'blast'): Thing[] {
    dead.add(o);
    state.kills++;
    // 撃破チェイン: 続けて壊すほど倍率が上がる
    state.chain = Math.min(TUNE.maxChain, state.chain + 1);
    state.chainTimer = TUNE.chainWindow;
    state.maxChain = Math.max(state.maxChain, state.chain);
    const p = state.player;
    const close = cause === 'shot' && Math.hypot(o.x - p.x, o.y - p.y) < TUNE.closeDist;
    if (close) state.closeKills++;
    if (cause === 'blast') state.blasts++;
    const pts = (TUNE.killPoints[o.kind] || 20) * state.chain * (close ? 2 : 1);
    state.score += pts;
    burst(o.x, o.y, COLORS[o.kind] || COLORS.circle, 18, 200);
    const label = close ? `ギリギリ +${pts}` : state.chain > 1 ? `x${state.chain} +${pts}` : `+${pts}`;
    // 誘爆で同時に壊れたときは、点数表示が重ならないよう上にずらす
    const lift = cause === 'blast' ? (state.chain - 1) * 14 : 0;
    popup(o.x, o.y - 10 - lift, label, close ? '#ff8fd8' : state.chain > 1 ? COLORS.coin : COLORS.text, close || state.chain > 3 ? 16 : 14);
    sfx.explode(state.chain);
    state.shake = Math.max(state.shake, 0.08);
    let extra: Thing[] = [];
    if (o.kind === 'hexagon') {
      // 壊すと2つの小さなボールに割れ、3方向アイテムを落とす
      for (const sgn of [-1, 1]) {
        extra.push({ kind: 'circle', x: o.x, y: o.y, r: 11, vy: o.vy, vx: sgn * (70 + Math.random() * 50), rot: 0, spin: 0, split: true, hp: 1 });
      }
      extra.push({ kind: 'power', x: o.x, y: o.y, r: 12, vy: Math.max(90, o.vy * 0.6), rot: 0 });
    } else if (Math.random() < TUNE.dropCoin) {
      extra.push({ kind: 'coin', x: o.x, y: o.y, r: 10, vy: Math.max(90, o.vy * 0.6), rot: 0 });
    }
    // 誘爆: まわりの図形に1ダメージ。壊れたらさらに誘爆する
    ring(o.x, o.y, TUNE.blastR, COLORS[o.kind] || COLORS.circle);
    for (const q of state.things) {
      if (dead.has(q) || !breakable(q)) continue;
      if (Math.hypot(q.x - o.x, q.y - o.y) > TUNE.blastR + q.r) continue;
      q.maxHp ??= q.hp;
      q.hp = (q.hp || 1) - 1;
      q.hitT = 0.08;
      if (q.hp <= 0) extra = extra.concat(destroy(q, dead, 'blast'));
    }
    return extra;
  }

  function breakable(o: Thing): o is Shape {
    return o.kind !== 'wall' && o.kind !== 'coin' && o.kind !== 'shield' && o.kind !== 'power';
  }

  function moveBullets(dt: number) {
    const alive: Bullet[] = [];
    let born: Thing[] = [];
    const dead = new Set<Thing>();
    // 速い弾が1フレームで物体を飛び越えないよう、8px ずつ区切って判定する
    const steps = Math.max(1, Math.ceil(TUNE.bulletSpeed * dt / 8));
    const sdt = dt / steps;
    for (const b of state.bullets) {
      let used = false;
      for (let k = 0; k < steps && !used; k++) {
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        used = bulletHit(b, dead, (list) => { born = born.concat(list); });
      }
      if (!used && b.y >= -20 && b.x >= -20 && b.x <= W + 20) alive.push(b);
    }
    state.bullets = alive;
    if (dead.size || born.length) state.things = state.things.filter((o) => !dead.has(o)).concat(born);
    for (const o of state.things) if (o.kind !== 'wall' && o.hitT !== undefined && o.hitT > 0) o.hitT -= dt;
  }

  // 弾が何かに当たったら true を返す
  function bulletHit(b: Bullet, dead: Set<Thing>, addBorn: (list: Thing[]) => void) {
    for (const o of state.things) {
      if (dead.has(o)) continue;
      if (o.kind === 'wall') {
        // カベは壊せない。弾を止める。すき間のふち近くに当たると、すき間が広がる
        const inBand = b.y > o.y && b.y < o.y + o.h;
        const inGap = b.x > o.gapX && b.x < o.gapX + o.gap;
        if (!inBand || inGap) continue;
        burst(b.x, o.y + o.h, COLORS.wall, 3, 80);
        if (o.gap < TUNE.wallMaxGap) {
          const w = TUNE.wallWiden;
          if (b.x <= o.gapX && o.gapX - b.x < 40) { const nx = Math.max(0, o.gapX - w); o.gap += o.gapX - nx; o.gapX = nx; }
          else if (b.x >= o.gapX + o.gap && b.x - o.gapX - o.gap < 40) o.gap = Math.min(W - o.gapX, o.gap + w);
        }
        return true;
      }
      if (!breakable(o) || !hitCircle(b.x, b.y, TUNE.bulletR, o)) continue;
      o.maxHp ??= o.hp;
      o.hp = (o.hp || 1) - 1;
      o.hitT = 0.08;
      if (o.hp <= 0) {
        addBorn(destroy(o, dead, 'shot'));
      } else {
        burst(b.x, b.y, COLORS.bullet, 4, 90);
        sfx.hitShot();
      }
      return true;
    }
    return false;
  }

  function movePlayer(dt: number) {
    const p = state.player;
    const half = TUNE.playerSize / 2;
    const dir = inputDir();
    p.x += dir.x * TUNE.playerSpeed * dt;
    p.y += dir.y * TUNE.playerSpeed * dt;
    p.x = Math.max(half, Math.min(W - half, p.x));
    p.y = Math.max(H * TUNE.playerMinY, Math.min(H - half - 6, p.y));
    p.tilt += (dir.x * 0.25 - p.tilt) * Math.min(1, dt * 12);
    state.trail.push({ x: p.x, y: p.y, life: 0.25 });
  }

  function moveThings(dt: number) {
    const out: Thing[] = [];
    for (const o of state.things) {
      o.y += o.vy * dt;
      if (o.kind === 'wall') {
        // 進む向きに画面の外へ出たものだけ消す(予告のため画面外から出発するものがあるため)
        const gone = (o.vy > 0 && o.y > H + 40) || (o.vy < 0 && o.y < -40);
        if (!gone) out.push(o);
        continue;
      }
      if (o.vx) o.x += o.vx * dt;
      if (o.spin) o.rot += o.spin * dt;
      if (o.kind === 'coin' || o.kind === 'shield') o.rot += dt * 4;
      if (o.kind === 'diamond') {
        o.phase = (o.phase ?? 0) + dt * 3;
        o.x = Math.max(o.r, Math.min(W - o.r, (o.baseX ?? o.x) + Math.sin(o.phase) * (o.amp ?? 0)));
      }
      if (o.kind === 'hexagon' && o.splitY !== undefined && o.y >= o.splitY) {
        // 2つの小さなボールに割れて斜めに広がる
        burst(o.x, o.y, COLORS.hexagon, 10, 120);
        for (const s of [-1, 1]) {
          out.push({ kind: 'circle', x: o.x, y: o.y, r: 11, vy: o.vy, vx: s * (70 + Math.random() * 50), rot: 0, spin: 0, split: true, hp: 1 });
        }
        beep(700, 0.08, 'triangle', 0.06, 300);
        continue;
      }
      if (o.kind === 'circle' && o.vx && (o.x < o.r || o.x > W - o.r)) {
        o.vx = -o.vx;
        o.x = Math.max(o.r, Math.min(W - o.r, o.x));
      }
      // 進む向きに画面の外へ出たものだけ消す(予告のため画面外から出発するものがあるため)
      const r = o.r;
      const vx = o.vx ?? 0;
      const gone =
        (o.vy > 0 && o.y - r > H + 40) ||
        (o.vy < 0 && o.y + r < -40) ||
        (o.kind === 'sweeper' && ((vx > 0 && o.x - r > W + 40) || (vx < 0 && o.x + r < -40)));
      if (!gone) out.push(o);
    }
    state.things = out;
  }

  function collide() {
    const p = state.player;
    const pr = (TUNE.playerSize / 2) * TUNE.hitboxScale;
    const keep: Thing[] = [];
    for (const o of state.things) {
      let hit: boolean;
      let near: boolean;
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
        if (o.kind === 'power') {
          state.power = TUNE.powerTime;
          burst(o.x, o.y, COLORS.power, 14, 140);
          popup(o.x, o.y - 10, 'パワーアップ！', COLORS.power);
          sfx.power();
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

      if (near && !o.nearDone && o.kind !== 'coin' && o.kind !== 'shield' && o.kind !== 'power') {
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

  function updateEffects(dt: number) {
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
  function polygon(x: number, y: number, r: number, n: number, rot: number) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  const isItem = (k: Kind) => k === 'coin' || k === 'shield' || k === 'power';
  // 3方向アイテムの虹色
  const rainbow = (now: number, shift = 0) => `hsl(${(now * 240 + shift) % 360}, 100%, 65%)`;

  // 図形の輪郭だけを作る(塗りとふちの線で同じ形を使う)
  function shapePath(o: Deco) {
    const rot = o.rot || 0;
    ctx.beginPath();
    if (o.kind === 'circle') {
      // トゲのついた機雷
      for (let i = 0; i < 16; i++) {
        const a = rot + (i / 16) * Math.PI * 2;
        const rr = i % 2 === 0 ? o.r * 1.18 : o.r * 0.92;
        const px = o.x + Math.cos(a) * rr, py = o.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (o.kind === 'triangle') {
      // 下向きのトゲ
      ctx.moveTo(o.x, o.y + o.r * 1.2);
      ctx.lineTo(o.x - o.r, o.y - o.r);
      ctx.lineTo(o.x + o.r, o.y - o.r);
      ctx.closePath();
    } else if (o.kind === 'diamond') {
      polygon(o.x, o.y, o.r * 1.1, 4, rot);
    } else if (o.kind === 'hexagon') {
      polygon(o.x, o.y, o.r, 6, rot);
    } else if (o.kind === 'sweeper') {
      // 進む向きを指す矢じり
      const d = o.vx !== undefined && o.vx >= 0 ? 1 : -1;
      ctx.moveTo(o.x + d * o.r * 1.3, o.y);
      ctx.lineTo(o.x - d * o.r, o.y - o.r);
      ctx.lineTo(o.x - d * o.r * 0.4, o.y);
      ctx.lineTo(o.x - d * o.r, o.y + o.r);
      ctx.closePath();
    } else if (o.kind === 'riser') {
      // 上向きのトゲ
      ctx.moveTo(o.x, o.y - o.r * 1.2);
      ctx.lineTo(o.x + o.r, o.y + o.r);
      ctx.lineTo(o.x - o.r, o.y + o.r);
      ctx.closePath();
    }
  }

  // 障害物: 光を抑え、黒いふちと内側の暗い影で「固くて危ないもの」に見せる
  function drawObstacle(o: Deco, color: string) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    shapePath(o);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 内側の影(下半分を暗く)
    ctx.save();
    shapePath(o);
    ctx.clip();
    const grd = ctx.createLinearGradient(o.x, o.y - o.r, o.x, o.y + o.r);
    grd.addColorStop(0, 'rgba(255,255,255,0.28)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grd;
    ctx.fillRect(o.x - o.r * 1.5, o.y - o.r * 1.5, o.r * 3, o.r * 3);
    ctx.restore();
    ctx.strokeStyle = 'rgba(5,6,15,0.85)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    shapePath(o);
    ctx.stroke();
    if (o.kind === 'hexagon') {
      // 割れ目
      ctx.strokeStyle = COLORS.bg;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - o.r);
      ctx.lineTo(o.x + 3, o.y);
      ctx.lineTo(o.x - 2, o.y + o.r);
      ctx.stroke();
    }
  }

  // アイテム: 光のにじみ、回る点線の輪、きらめきで「取ると得するもの」に見せる
  function drawItem(o: Deco, color: string, now: number) {
    const rot = o.rot || 0;
    const pulse = 1 + Math.sin(now * 6 + o.x) * 0.12;
    const halo = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2.6 * pulse);
    halo.addColorStop(0, color);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r * 2.6 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -now * 30;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r * 1.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    if (o.kind === 'power') {
      // 回る虹色の星
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? o.r * 1.2 : o.r * 0.55;
        const px = o.x + Math.cos(a) * rr, py = o.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (o.kind === 'coin') {
      // 回転して見えるよう横幅を変える
      const sx = Math.abs(Math.cos(rot)) * 0.8 + 0.2;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.r * sx, o.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(o.x - 1.5 * sx, o.y - o.r * 0.5, 3 * sx, o.r);
    } else if (o.kind === 'shield') {
      ctx.globalAlpha *= 0.45;
      polygon(o.x, o.y, o.r, 6, rot * 0.5);
      ctx.fill();
      ctx.globalAlpha /= 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      // 十字のしるし
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(o.x - 1.5, o.y - o.r * 0.5, 3, o.r);
      ctx.fillRect(o.x - o.r * 0.5, o.y - 1.5, o.r, 3);
    }
    ctx.shadowBlur = 0;
    // きらめき
    for (let i = 0; i < 3; i++) {
      const a = now * 2.5 + i * (Math.PI * 2 / 3);
      const tw = 0.5 + 0.5 * Math.sin(now * 9 + i * 2);
      const px = o.x + Math.cos(a) * o.r * 1.75, py = o.y + Math.sin(a) * o.r * 1.75;
      const k = 2 + tw * 2.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(px, py - k); ctx.lineTo(px + k * 0.3, py); ctx.lineTo(px, py + k); ctx.lineTo(px - k * 0.3, py);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px - k, py); ctx.lineTo(px, py + k * 0.3); ctx.lineTo(px + k, py); ctx.lineTo(px, py - k * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawShape(o: Deco, alpha?: number) {
    const now = performance.now() / 1000;
    const color = o.kind === 'power' ? rainbow(now) : COLORS[o.kind];
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    if (isItem(o.kind)) drawItem(o, color, now); else drawObstacle(o, color);
    ctx.restore();
    if ((o.hitT ?? 0) > 0) {
      // 弾が当たった瞬間に白く光らせる
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 障害物の残り HP と、アイテムの名前を図形の近くに出す(3Dでは物体が見えている位置に合わせる)
  function drawMarkers(three: Render3D | null) {
    const now = performance.now() / 1000;
    for (const o of state.things) {
      if (o.kind === 'wall') continue;
      if (isItem(o.kind)) {
        if (o.kind === 'coin') continue;
        // 3Dでは床の輪より手前(画面の下)に出す
        const at = three ? three.project(o.x, o.y + o.r * 2.2, 0) : { x: o.x, y: o.y + o.r * 2 };
        const name = o.kind === 'shield' ? 'シールド' : '3方向';
        const a = 0.8 + Math.sin(now * 6) * 0.2;
        text(name, at.x + 1, at.y + 9, 11, 'rgba(5,6,15,0.9)', 'center', a);
        text(name, at.x, at.y + 8, 11, o.kind === 'power' ? rainbow(now) : COLORS[o.kind], 'center', a);
        continue;
      }
      const max = o.maxHp ?? o.hp ?? 1;
      const hp = o.hp ?? 1;
      if (max <= 1 || hp <= 0) continue;
      const at = three ? three.project(o.x, o.y, (o.r / 20) * 2 + 0.7) : { x: o.x, y: o.y - o.r * 1.25 - 6 };
      const gap = 6, w0 = at.x - ((max - 1) * gap) / 2;
      for (let i = 0; i < max; i++) {
        ctx.fillStyle = i < hp ? '#ffffff' : 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.arc(w0 + i * gap, at.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBullets() {
    ctx.save();
    ctx.fillStyle = COLORS.bullet;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 8;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 2.5, 7, Math.atan2(b.vx, -b.vy), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWall(o: Wall) {
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
      } else if (o.kind === 'sweeper' && (o.x + o.r < 0 || o.x - o.r > W)) {
        const left = o.x < 0;
        const ex = left ? 6 : W - 6;
        const d = left ? 1 : -1;
        ctx.fillStyle = blink ? COLORS.warn : 'rgba(255,77,77,0.4)';
        ctx.beginPath();
        ctx.moveTo(ex, o.y - 9); ctx.lineTo(ex + d * 16, o.y); ctx.lineTo(ex, o.y + 9);
        ctx.closePath();
        ctx.fill();
        text('!', ex + d * 26, o.y, 14, COLORS.warn);
      } else if (o.kind === 'riser' && o.y - o.r > H) {
        ctx.fillStyle = blink ? COLORS.warn : 'rgba(255,77,77,0.4)';
        ctx.beginPath();
        ctx.moveTo(o.x, H - 26); ctx.lineTo(o.x - 9, H - 10); ctx.lineTo(o.x + 9, H - 10);
        ctx.closePath();
        ctx.fill();
        text('!', o.x, H - 40, 14, COLORS.warn);
      } else if (o.kind === 'wall' && o.y < 0) {
        ctx.fillStyle = blink ? 'rgba(255,77,77,0.55)' : 'rgba(255,77,77,0.2)';
        ctx.fillRect(0, 4, o.gapX, 4);
        ctx.fillRect(o.gapX + o.gap, 4, W - o.gapX - o.gap, 4);
      }
    }
  }

  function drawPlayer(alpha: number) {
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

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(str: string, x: number, y: number, size: number, color?: string, align?: CanvasTextAlign, alpha?: number) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color || COLORS.text;
    ctx.font = `bold ${size}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function button(label: string, y: number, color: string) {
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
    if (!r3()) for (const d of state.deco) drawShape(d, 0.15);

    // ロゴ: 文字ごとに少し跳ねる
    const logo = 'よけうち';
    const now = performance.now() / 1000;
    for (let i = 0; i < logo.length; i++) {
      const x = W / 2 + (i - (logo.length - 1) / 2) * 50;
      const y = 150 + Math.sin(now * 3 + i * 0.7) * 6;
      text(logo[i], x + 3, y + 3, 52, 'rgba(79,209,255,0.35)');
      text(logo[i], x, y, 52, COLORS.text);
    }
    text('撃って壊して、よけつづけろ！', W / 2, 200, 15, COLORS.sub);
    text('弾は自動で発射されます', W / 2, 220, 12, COLORS.sub);

    // デモ: 自機が8の字に動く
    state.player.x = W / 2 + Math.sin(now * 1.6) * 60;
    state.player.tilt = Math.cos(now * 1.6) * 0.2;
    state.player.y = 262 + Math.sin(now * 3.2) * 12;
    if (!r3()) drawPlayer(1);

    button('スタート', 335, COLORS.player);
    text(state.best > 0 ? `ハイスコア  ${state.best}` : 'ハイスコア  ―', W / 2, 385, 16, COLORS.coin);

    // 図形図鑑
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(24, 410, W - 48, 150, 12);
    ctx.fill();
    text('ぶつかるとアウト(撃って壊せる)', W / 2, 428, 12, COLORS.warn);
    SHAPES.forEach((s, i) => {
      // 1段目に4つ、2段目に3つ並べる
      const row = i < 4 ? 0 : 1;
      const col = row === 0 ? i : i - 4;
      const cx = 24 + 78 * (col + 0.5) + (row === 1 ? 39 : 0);
      const cy = 465 + row * 58;
      if (s.kind === 'wall') {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(cx - 18, cy - 4, 12, 8);
        ctx.fillRect(cx + 6, cy - 4, 12, 8);
      } else {
        drawShape({ kind: s.kind, x: cx, y: cy, r: 11, rot: now }, 1);
      }
      text(s.name, cx, cy + 20, 11, COLORS.text);
      const hp = s.kind === 'circle' ? '1〜2' : TUNE.hp[s.kind];
      text(hp ? `HP ${hp}` : '壊せない', cx, cy + 33, 9, hp ? COLORS.sub : COLORS.warn);
    });
    const items: [ShapeKind, string][] = [['coin', 'コイン'], ['shield', 'シールド'], ['power', '3方向']];
    text('光っているのはアイテム。取ると得する', W / 2, 575, 12, COLORS.shield);
    items.forEach(([k, name], i) => {
      const cx = W / 2 - 105 + i * 105;
      drawShape({ kind: k, x: cx - 34, y: 600, r: 7, rot: now * 2 }, 1);
      text(name, cx + 8, 600, 12, COLORS.text);
    });

    text('PC: 矢印キー / WASD   スマホ: 指を置いてなぞる', W / 2, 628, 11, COLORS.sub);
  }

  function drawHud() {
    // 自機が動ける範囲の上端をうっすら示す(3D描画では床に線を引く)
    if (!r3()) {
    ctx.save();
    ctx.strokeStyle = 'rgba(79,209,255,0.12)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(0, H * TUNE.playerMinY - TUNE.playerSize / 2);
    ctx.lineTo(W, H * TUNE.playerMinY - TUNE.playerSize / 2);
    ctx.stroke();
    ctx.restore();
    }
    text(String(Math.floor(state.score)), W / 2, 36, 30);
    text(`LV ${state.level}`, 12, 20, 13, COLORS.sub, 'left');
    text(`${state.t.toFixed(1)}秒`, 12, 38, 13, COLORS.sub, 'left');
    if (state.power > 0) {
      text(`3方向 ${state.power.toFixed(1)}秒`, W - 12, 64, 13, COLORS.power, 'right');
    }
    text(`撃破 ${state.kills}`, 12, 56, 13, COLORS.sub, 'left');
    if (state.combo > 1) {
      text(`コンボ x${state.combo}`, W / 2, 64, 14, '#ff8fd8', 'center', Math.min(1, state.comboTimer));
    }
    if (state.chain > 1) {
      // 撃破チェインの倍率と、切れるまでの残り時間
      const y = state.combo > 1 ? 84 : 64;
      text(`撃破チェイン x${state.chain}`, W / 2, y, 15, COLORS.coin, 'center');
      ctx.fillStyle = COLORS.coin;
      ctx.fillRect(W / 2 - 50, y + 12, 100 * Math.max(0, state.chainTimer / TUNE.chainWindow), 3);
    }
    // 指で操作中はスティックを表示する
    if (stick.id !== null) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
      const len = Math.hypot(dx, dy);
      const k = len > TUNE.stickRadius ? TUNE.stickRadius / len : 1;
      ctx.save();
      ctx.strokeStyle = 'rgba(79,209,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stick.ox, stick.oy, TUNE.stickRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(79,209,255,0.35)';
      ctx.beginPath();
      ctx.arc(stick.ox + dx * k, stick.oy + dy * k, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
    const icon = b.kind && b.kind !== 'wall' ? b.kind : null;
    const tw = ctx.measureText(b.sub).width + (icon ? 26 : 0);
    const left = W / 2 - tw / 2 + slide;
    if (icon) drawShape({ kind: icon, x: left + 9, y: H * 0.3 + 18, r: 9, rot: b.t * 3 }, Math.max(0, inOut));
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
      ['撃破数', `${state.kills}`],
      ['最大チェイン', `x${state.maxChain}`],
      ['コイン', `${state.coins}`],
      ['ニアミス(最大コンボ)', `${state.nearMisses}回 (x${state.maxCombo})`],
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

  function draw(dt: number) {
    const sx = canvas.width / W, sy = canvas.height / H;
    let ox = 0, oy = 0;
    if (state.shake > 0) {
      const m = state.shake * 16;
      ox = (Math.random() - 0.5) * m;
      oy = (Math.random() - 0.5) * m;
    }
    const three = r3();
    if (three) {
      // 3D: 世界は WebGL で描き、この canvas には文字やボタンなどの表示だけを重ねる
      three.render(state, { dt, shakeX: ox, shakeY: oy, playerMinY: TUNE.playerMinY, playerSize: TUNE.playerSize });
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (state.scene === 'title') drawTitle(); else drawMarkers(three);
    } else {
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
        drawMarkers(null);
        drawBullets();
        if (state.scene !== 'dying' && state.scene !== 'over') drawPlayer(1);
      }

      for (const q of state.particles) {
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      ctx.globalAlpha = 1;
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.6})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    if (state.scene === 'play' || state.scene === 'paused' || state.scene === 'dying' || state.scene === 'countdown') drawHud();
    for (const q of state.popups) {
      // 3Dでは、物体が見えている位置に文字を出す
      const at = three ? three.project(q.x, q.y, 1.2) : q;
      text(q.str, at.x, at.y, q.size, q.color, 'center', Math.min(1, q.life * 2));
    }
    drawBanner();

    if (state.scene === 'countdown') {
      const n = 3 - Math.floor(state.sceneT);
      const f = state.sceneT % 1;
      text(String(n), W / 2, H * 0.4, 90 * (1.4 - f * 0.4), COLORS.text, 'center', 1 - f * 0.6);
      text('動きながら自動で撃つ。カベは壊せない', W / 2, H * 0.4 + 80, 15, COLORS.sub);
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
  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); // タブ復帰時の大ジャンプを防ぐ
    last = now;
    update(dt);
    draw(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 動作確認用
  window.__dodge = { state, TUNE, start, stick, is3D: () => !!r3() };
})();
