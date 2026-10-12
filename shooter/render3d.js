// 3D描画。ゲームのルールと当たり判定は game.js の2D座標のまま動かし、ここでは見た目だけを3Dにする。
// 読み込みや WebGL の初期化に失敗した場合は何も登録せず、game.js は2D描画のまま動く。
import * as THREE from '../vendor/three.module.min.js'; // よけゲーと同じファイルを使う
const W = 360; // game.js の論理座標の幅
const H = 640; // game.js の論理座標の高さ
const S = 20; // 論理座標 20 = 3D空間の 1
const FIELD_W = W / S; // 床の幅(18)
const FIELD_D = H / S; // 床の奥行き(32)
// game.ts の COLORS と同じ色。障害物は「危ない色」、アイテムは金、緑、虹色(power は毎フレーム色を変える)
const COLORS = {
    player: 0x4fd1ff, shield: 0x7dffa8, circle: 0xff5c7a, triangle: 0xff8a3c,
    diamond: 0xc77dff, wall: 0xff7b54, hexagon: 0x7d8bff, sweeper: 0xff6bd6,
    riser: 0xff3b4e, coin: 0xffe066, power: 0xffffff, bullet: 0xbff4ff, warn: 0xff4d4d, bg: 0x11142a,
};
const ITEMS = ['coin', 'shield', 'power'];
const isItem = (k) => k === 'coin' || k === 'shield' || k === 'power';
// 中心ほど明るい丸い光。加算合成の板に貼って、アイテムの光のにじみにする
function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (g) {
        const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.3, 'rgba(255,255,255,0.5)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
}
// 2D座標(x: 左右、y: 画面の上ほど奥)を3D座標に変換する
const toX = (x) => (x - W / 2) / S;
const toZ = (y) => (y - H) / S;
function init() {
    const found = document.getElementById('world');
    if (!found)
        return null;
    const canvas = found;
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    }
    catch {
        return null; // WebGL が使えない環境では2D描画のまま
    }
    renderer.setClearColor(COLORS.bg);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLORS.bg, 40, 75);
    // 自機の後ろ上方から、奥へ向かって見下ろす。
    // 縦長の画面でも手前の床の両端(自機が動ける範囲)が切れないよう、高めの位置に置いている
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
    const CAM_POS = new THREE.Vector3(0, 38, 8);
    const CAM_TARGET = new THREE.Vector3(0, 0, -16);
    camera.position.copy(CAM_POS);
    camera.lookAt(CAM_TARGET);
    scene.add(new THREE.HemisphereLight(0x99aaff, 0x101020, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 20, 10);
    scene.add(sun);
    // ---- 床と枠 ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_D + 40), new THREE.MeshStandardMaterial({ color: 0x161a38, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -FIELD_D / 2 - 10);
    scene.add(floor);
    // 手前に流れる床の線(速さの手ごたえ)
    const LINE_GAP = 2;
    const WALL_H = 3;
    const lineGeo = new THREE.BufferGeometry();
    const linePts = [];
    for (let i = 0; i < 40; i++) {
        const z = -i * LINE_GAP;
        linePts.push(-FIELD_W / 2, 0.01, z, FIELD_W / 2, 0.01, z);
        // 左右の壁の縦線
        linePts.push(-FIELD_W / 2, 0, z, -FIELD_W / 2, WALL_H, z, FIELD_W / 2, 0, z, FIELD_W / 2, WALL_H, z);
    }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x33479a }));
    scene.add(lines);
    // 左右の半透明の壁と、その上下のふち
    const railMat = new THREE.MeshBasicMaterial({ color: COLORS.player });
    const sideMat = new THREE.MeshBasicMaterial({ color: COLORS.player, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
    for (const sx of [-1, 1]) {
        for (const ry of [0.06, WALL_H]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, FIELD_D + 40), railMat);
            rail.position.set(sx * (FIELD_W / 2 + 0.06), ry, -FIELD_D / 2 - 10);
            scene.add(rail);
        }
        const side = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_D + 40, WALL_H), sideMat);
        side.rotation.y = Math.PI / 2;
        side.position.set(sx * FIELD_W / 2, WALL_H / 2, -FIELD_D / 2 - 10);
        scene.add(side);
    }
    // 自機が動ける範囲の上端(奥側の限界)
    const limitLine = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, 0.08), new THREE.MeshBasicMaterial({ color: COLORS.player, transparent: true, opacity: 0.35 }));
    limitLine.rotation.x = -Math.PI / 2;
    limitLine.position.y = 0.02;
    scene.add(limitLine);
    // ---- 形と材質 ----
    // 障害物は光を抑えた金属っぽい固まり、アイテムは自分で強く光るものにして、質感でも区別する
    const mats = {};
    for (const [k, c] of Object.entries(COLORS)) {
        const item = isItem(k);
        mats[k] = new THREE.MeshStandardMaterial({
            color: c, emissive: c, emissiveIntensity: item ? 0.9 : 0.22, roughness: item ? 0.2 : 0.3, metalness: item ? 0.1 : 0.45,
        });
    }
    mats.shield.transparent = true;
    mats.shield.opacity = 0.9;
    // アイテムの演出用の材質(光のにじみ、床の輪、光の柱、まわりを回る粒)
    const glowTex = glowTexture();
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const fx = {};
    for (const k of ITEMS) {
        const c = COLORS[k];
        fx[k] = {
            glow: new THREE.SpriteMaterial({ map: glowTex, color: c, ...additive, opacity: 0.9 }),
            ring: new THREE.MeshBasicMaterial({ color: c, ...additive, opacity: 0.8, side: THREE.DoubleSide }),
            beam: new THREE.MeshBasicMaterial({ color: c, ...additive, opacity: 0.16, side: THREE.DoubleSide }),
            spark: new THREE.MeshBasicMaterial({ color: 0xffffff, ...additive }),
        };
    }
    const itemRingGeo = new THREE.RingGeometry(1.25, 1.55, 40).rotateX(-Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    const sparkGeo = new THREE.OctahedronGeometry(1);
    // 障害物の形のふちの線
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x07080f, transparent: true, opacity: 0.75 });
    const geos = {
        circle: new THREE.SphereGeometry(1, 24, 16),
        triangle: new THREE.ConeGeometry(1, 2.4, 16).rotateX(Math.PI / 2), // 手前(+Z)を向いたトゲ
        riser: new THREE.ConeGeometry(1, 2.4, 16).rotateX(-Math.PI / 2), // 奥(-Z)を向いたトゲ
        sweeper: new THREE.ConeGeometry(0.9, 2.6, 12).rotateZ(-Math.PI / 2), // 右(+X)を向いた矢じり
        diamond: new THREE.OctahedronGeometry(1.15),
        hexagon: new THREE.CylinderGeometry(1, 1, 1, 6),
        coin: new THREE.CylinderGeometry(1, 1, 0.22, 24).rotateX(0.6), // 表がカメラ側を向くよう傾ける
        shield: new THREE.TorusGeometry(1, 0.18, 8, 6).rotateX(-0.98),
        power: new THREE.DodecahedronGeometry(1.05),
        box: new THREE.BoxGeometry(1, 1, 1),
    };
    const shadowGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    // ボールのトゲ(機雷のように見せて、ぶつかると危ないことを伝える)
    const spikeGeo = new THREE.ConeGeometry(0.22, 0.55, 6);
    const spikeDirs = [];
    for (let i = 0; i < 10; i++) {
        // 球の表面にほぼ均等に並べる
        const yy = 1 - (i + 0.5) / 10 * 2, rr = Math.sqrt(1 - yy * yy), a = i * 2.39996;
        spikeDirs.push(new THREE.Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr));
    }
    const up = new THREE.Vector3(0, 1, 0);
    function makeThing(o) {
        const g = new THREE.Group();
        const extras = []; // g とは別に床の高さに置くもの
        const sh = new THREE.Mesh(shadowGeo, shadowMat);
        sh.renderOrder = -1;
        extras.push(sh);
        if (o.kind === 'wall') {
            for (let i = 0; i < 2; i++) {
                const m = new THREE.Mesh(geos.box, mats.wall);
                m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geos.box), edgeMat));
                g.add(m);
            }
        }
        else {
            const geo = geos[o.kind] || geos.circle;
            const core = new THREE.Mesh(geo, mats[o.kind] || mats.circle);
            g.add(core);
            if (isItem(o.kind)) {
                const f = fx[o.kind];
                const glow = new THREE.Sprite(f.glow);
                g.add(glow);
                const sparks = [];
                for (let i = 0; i < 3; i++) {
                    const sp = new THREE.Mesh(sparkGeo, f.spark);
                    g.add(sp);
                    sparks.push(sp);
                }
                const ring = new THREE.Mesh(itemRingGeo, f.ring);
                const beam = new THREE.Mesh(beamGeo, f.beam);
                extras.push(ring, beam);
                g.userData.item = { glow, sparks, ring, beam };
            }
            else {
                if (o.kind !== 'circle')
                    core.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat));
                if (o.kind === 'circle') {
                    for (const d of spikeDirs) {
                        const sp = new THREE.Mesh(spikeGeo, mats.circle);
                        sp.position.copy(d).multiplyScalar(1.05);
                        sp.quaternion.setFromUnitVectors(up, d);
                        core.add(sp);
                    }
                }
            }
        }
        g.userData.shadow = sh;
        g.userData.extras = extras;
        for (const e of extras)
            scene.add(e);
        scene.add(g);
        return g;
    }
    function placeThing(g, o, hidden, now) {
        const sh = g.userData.shadow;
        g.visible = !hidden;
        for (const e of g.userData.extras)
            e.visible = !hidden;
        if (hidden)
            return;
        if (o.kind === 'wall') {
            const depth = o.h / S, hgt = 1.4, z = toZ(o.y + o.h / 2);
            const [l, r] = g.children;
            const lw = o.gapX / S, rw = (W - o.gapX - o.gap) / S;
            l.scale.set(Math.max(0.01, lw), hgt, depth);
            l.position.set(-FIELD_W / 2 + lw / 2, hgt / 2, z);
            r.scale.set(Math.max(0.01, rw), hgt, depth);
            r.position.set(FIELD_W / 2 - rw / 2, hgt / 2, z);
            sh.visible = false;
            return;
        }
        const item = isItem(o.kind);
        // アイテムは少し大きく、高く浮かべて上下にゆらす
        const r = o.r / S * (item ? 1.3 : 1);
        const m = g.children[0];
        const lift = item ? 0.9 : 0.35;
        const y = r + lift + (item ? Math.sin(now / 260 + o.x) * 0.2 : 0);
        g.position.set(toX(o.x), y, toZ(o.y));
        // 弾が当たった瞬間は少しふくらませる
        const pop = (o.hitT ?? 0) > 0 ? 1.25 : 1;
        m.scale.setScalar(r * pop);
        if (o.kind === 'hexagon')
            m.scale.set(r * pop, r * 1.3 * pop, r * pop);
        m.rotation.set(0, 0, 0);
        const rot = o.rot || 0;
        if (o.kind === 'diamond') {
            m.rotation.y = rot;
            m.rotation.x = rot * 0.5;
        }
        else if (o.kind === 'hexagon')
            m.rotation.y = rot;
        else if (o.kind === 'circle')
            m.rotation.y = rot;
        else if (o.kind === 'coin' || o.kind === 'shield')
            m.rotation.y = rot;
        else if (o.kind === 'power') {
            m.rotation.y = rot;
            m.rotation.x = rot * 0.7;
        }
        else if (o.kind === 'sweeper')
            m.rotation.y = o.vx !== undefined && o.vx < 0 ? Math.PI : 0;
        sh.position.set(g.position.x, 0.02, g.position.z);
        sh.scale.setScalar(r * 1.05);
        const fxItem = g.userData.item;
        if (fxItem) {
            const pulse = 1 + Math.sin(now / 180) * 0.12;
            fxItem.glow.scale.setScalar(r * 4.2 * pulse);
            fxItem.sparks.forEach((sp, i) => {
                const a = now / 400 + i * (Math.PI * 2 / 3);
                sp.position.set(Math.cos(a) * r * 1.9, Math.sin(now / 300 + i) * r * 0.6, Math.sin(a) * r * 1.9);
                sp.scale.setScalar(r * 0.18 * (0.7 + 0.3 * Math.sin(now / 90 + i * 2)));
                sp.rotation.set(a, a, 0);
            });
            fxItem.ring.position.set(g.position.x, 0.03, g.position.z);
            fxItem.ring.scale.setScalar(r * pulse);
            fxItem.ring.rotation.y = now / 500;
            fxItem.beam.position.set(g.position.x, 1.6, g.position.z);
            fxItem.beam.scale.set(r * 0.75, 3.2, r * 0.75);
        }
    }
    // 画面上の図形と3Dの物体の対応表
    const things = new Map();
    const decos = new Map();
    function sync(map, list, now) {
        const alive = new Set(list);
        for (const [o, g] of map) {
            if (!alive.has(o)) {
                scene.remove(g);
                for (const e of g.userData.extras)
                    scene.remove(e);
                map.delete(o);
            }
        }
        for (const o of list) {
            let g = map.get(o);
            if (!g) {
                g = makeThing(o);
                map.set(o, g);
            }
            placeThing(g, o, false, now);
        }
    }
    // ---- 自機 ----
    const player = new THREE.Group();
    const body = new THREE.Mesh(geos.box, mats.player);
    body.scale.setScalar(1.4);
    player.add(body);
    const eyeMat = new THREE.MeshBasicMaterial({ color: COLORS.bg });
    const eyes = [];
    for (const ex of [-0.3, 0.3]) {
        const e = new THREE.Mesh(geos.box, eyeMat);
        e.scale.set(0.2, 0.3, 0.05);
        e.position.set(ex, 0.25, -0.71); // 進む向き(奥)の面に目を付ける
        player.add(e);
        eyes.push(e);
    }
    // 上から見えるよう、上の面にも目を付ける
    for (const ex of [-0.3, 0.3]) {
        const e = new THREE.Mesh(geos.box, eyeMat);
        e.scale.set(0.2, 0.05, 0.3);
        e.position.set(ex, 0.71, -0.25);
        player.add(e);
    }
    const bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), new THREE.MeshBasicMaterial({ color: COLORS.shield, wireframe: true, transparent: true, opacity: 0.7 }));
    player.add(bubble);
    scene.add(player);
    const playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    playerShadow.scale.setScalar(1);
    scene.add(playerShadow);
    // 残像
    const trailMat = new THREE.MeshBasicMaterial({ color: COLORS.player, transparent: true, opacity: 0.2, depthWrite: false });
    const trailPool = [];
    for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(geos.box, trailMat.clone());
        m.visible = false;
        scene.add(m);
        trailPool.push(m);
    }
    // ---- 弾 ----
    const bulletGeo = new THREE.SphereGeometry(1, 10, 8);
    const bulletMat = new THREE.MeshBasicMaterial({ color: COLORS.bullet });
    const bulletPool = [];
    for (let i = 0; i < 120; i++) {
        const m = new THREE.Mesh(bulletGeo, bulletMat);
        m.scale.set(0.14, 0.14, 0.45);
        m.visible = false;
        scene.add(m);
        bulletPool.push(m);
    }
    // ---- 粒子 ----
    const partPool = [];
    for (let i = 0; i < 220; i++) {
        const m = new THREE.Mesh(geos.box, new THREE.MeshBasicMaterial({ transparent: true }));
        m.visible = false;
        scene.add(m);
        partPool.push(m);
    }
    // ---- 予告の印 ----
    const warnGeo = new THREE.ConeGeometry(0.6, 1.4, 3);
    const warnPool = [];
    for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ color: COLORS.warn, transparent: true }));
        m.visible = false;
        scene.add(m);
        warnPool.push(m);
    }
    const warnBarPool = [];
    for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(geos.box, new THREE.MeshBasicMaterial({ color: COLORS.warn, transparent: true }));
        m.visible = false;
        scene.add(m);
        warnBarPool.push(m);
    }
    function drawWarnings(list, now) {
        const blink = Math.floor(now / 120) % 2 === 0 ? 0.95 : 0.35;
        let wi = 0, bi = 0;
        for (const o of list) {
            if (wi >= warnPool.length)
                break;
            if (o.kind === 'triangle' && o.y + o.r < 0) {
                const m = warnPool[wi++];
                m.position.set(toX(o.x), 0.8, toZ(0) + 0.6);
                m.rotation.set(Math.PI / 2, 0, 0); // 手前を指す
                m.material.opacity = blink;
                m.visible = true;
            }
            else if (o.kind === 'riser' && o.y - o.r > H) {
                const m = warnPool[wi++];
                m.position.set(toX(o.x), 0.8, toZ(H) - 0.9);
                m.rotation.set(-Math.PI / 2, 0, 0); // 奥を指す
                m.material.opacity = blink;
                m.visible = true;
            }
            else if (o.kind === 'sweeper' && (o.x + o.r < 0 || o.x - o.r > W)) {
                const m = warnPool[wi++];
                const left = o.x < 0;
                m.position.set(left ? -FIELD_W / 2 + 0.8 : FIELD_W / 2 - 0.8, 0.8, toZ(o.y));
                m.rotation.set(0, 0, left ? -Math.PI / 2 : Math.PI / 2);
                m.material.opacity = blink;
                m.visible = true;
            }
            else if (o.kind === 'wall' && o.y < 0 && bi + 2 <= warnBarPool.length) {
                const lw = o.gapX / S, rw = (W - o.gapX - o.gap) / S;
                const z = toZ(0) + 0.3;
                const a = warnBarPool[bi++], b = warnBarPool[bi++];
                a.scale.set(Math.max(0.01, lw), 0.06, 0.25);
                a.position.set(-FIELD_W / 2 + lw / 2, 0.05, z);
                b.scale.set(Math.max(0.01, rw), 0.06, 0.25);
                b.position.set(FIELD_W / 2 - rw / 2, 0.05, z);
                a.material.opacity = b.material.opacity = blink;
                a.visible = b.visible = true;
            }
        }
        for (; wi < warnPool.length; wi++)
            warnPool[wi].visible = false;
        for (; bi < warnBarPool.length; bi++)
            warnBarPool[bi].visible = false;
    }
    // ---- 画面サイズ ----
    function resize(cssW, cssH, dpr) {
        renderer.setPixelRatio(Math.min(2, dpr || 1));
        renderer.setSize(cssW, cssH, false);
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }
    // 2D座標の点(高さ h)が、オーバーレイ(360x640)のどこに見えるか
    const tmp = new THREE.Vector3();
    function project(x, y, h) {
        tmp.set(toX(x), h == null ? 1 : h, toZ(y)).project(camera);
        return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H };
    }
    let scroll = 0;
    function render(state, opts) {
        const dt = opts.dt || 0;
        const now = performance.now();
        const playing = state.scene === 'play' || state.scene === 'countdown';
        // 床の線を手前へ流す
        const speed = state.scene === 'play' ? (160 + 4 * state.t) / S : 3;
        scroll = (scroll + speed * dt) % LINE_GAP;
        lines.position.z = scroll;
        limitLine.visible = state.scene !== 'title';
        limitLine.position.z = toZ(H * opts.playerMinY - opts.playerSize / 2);
        // 3方向アイテムは虹色に色を変える
        const hue = (now / 1500) % 1;
        mats.power.color.setHSL(hue, 1, 0.62);
        mats.power.emissive.setHSL(hue, 1, 0.5);
        for (const m of [fx.power.glow, fx.power.ring, fx.power.beam])
            m.color.setHSL(hue, 1, 0.6);
        // 障害物とアイテム
        sync(things, state.scene === 'title' ? [] : state.things, now);
        sync(decos, state.scene === 'title' ? state.deco : [], now);
        // 自機
        const p = state.player;
        const showPlayer = state.scene !== 'dying' && state.scene !== 'over';
        player.visible = playerShadow.visible = showPlayer;
        const bob = Math.sin(now / 250) * 0.08;
        player.position.set(toX(p.x), 1.05 + bob, toZ(p.y));
        player.rotation.set(0, 0, -p.tilt);
        bubble.visible = !!p.shield;
        bubble.rotation.y = now / 600;
        bubble.rotation.x = now / 900;
        playerShadow.position.set(player.position.x, 0.02, player.position.z);
        playerShadow.scale.setScalar(0.9);
        // 残像
        const trail = showPlayer ? state.trail : [];
        for (let i = 0; i < trailPool.length; i++) {
            const q = trail[trail.length - 1 - i * 2];
            const m = trailPool[i];
            if (!q) {
                m.visible = false;
                continue;
            }
            const k = 0.5 + q.life * 2.5;
            m.visible = true;
            m.scale.setScalar(k);
            m.position.set(toX(q.x), 0.7, toZ(q.y) + 0.2);
            m.material.opacity = (q.life / 0.25) * 0.18;
        }
        // 弾
        const bullets = state.scene === 'title' ? [] : (state.bullets || []);
        for (let i = 0; i < bulletPool.length; i++) {
            const b = bullets[i];
            const m = bulletPool[i];
            if (!b) {
                m.visible = false;
                continue;
            }
            m.visible = true;
            m.position.set(toX(b.x), 1.05, toZ(b.y));
            m.rotation.y = -Math.atan2(b.vx, -b.vy);
        }
        // 粒子
        for (let i = 0; i < partPool.length; i++) {
            const q = state.particles[i];
            const m = partPool[i];
            if (!q) {
                m.visible = false;
                continue;
            }
            m.visible = true;
            const a = Math.max(0, q.life / q.max);
            m.material.color.set(q.color);
            m.material.opacity = a;
            m.scale.setScalar(q.size / S * 1.6);
            // 粒子は2Dの動きに、上へ飛び散る高さを足す
            m.position.set(toX(q.x), 0.8 + (1 - a) * 1.5 + (i % 5) * 0.12, toZ(q.y));
        }
        if (playing || state.scene === 'paused')
            drawWarnings(state.things, now);
        else
            drawWarnings([], now);
        // カメラ(揺れ)
        camera.position.set(CAM_POS.x + (opts.shakeX || 0) / S, CAM_POS.y + (opts.shakeY || 0) / S, CAM_POS.z);
        camera.lookAt(CAM_TARGET);
        renderer.render(scene, camera);
    }
    return { render, resize, project };
}
const api = init();
if (api) {
    window.__render3d = api;
    window.dispatchEvent(new Event('render3d-ready'));
}
