// game.ts と render3d.ts が共有する型。どちらのファイルからも使えるよう、グローバルに宣言する

type Scene = 'title' | 'countdown' | 'play' | 'paused' | 'dying' | 'over';

/** 障害物とアイテムのうち、カベ以外のもの */
type ShapeKind = 'circle' | 'triangle' | 'sweeper' | 'diamond' | 'riser' | 'hexagon' | 'coin' | 'shield';
type Kind = ShapeKind | 'wall';

/** カベ以外の障害物とアイテム。座標はゲームの論理座標(360x640) */
interface Shape {
  kind: ShapeKind;
  x: number;
  y: number;
  r: number;
  vy: number;
  rot: number;
  vx?: number;
  spin?: number;
  /** ゆらゆら: 揺れの中心、位相、振れ幅 */
  baseX?: number;
  phase?: number;
  amp?: number;
  /** ブンレツ: この高さで2つに割れる */
  splitY?: number;
  /** ブンレツが割れてできたボール */
  split?: boolean;
  /** ニアミスを数えたら true */
  nearDone?: boolean;
}

/** 横いっぱいのカベ。gapX から gap の幅だけすき間がある */
interface Wall {
  kind: 'wall';
  y: number;
  h: number;
  gapX: number;
  gap: number;
  vy: number;
  nearDone?: boolean;
}

type Thing = Shape | Wall;

/** タイトル画面で漂う図形、図鑑やバナーのアイコン */
interface Deco {
  kind: ShapeKind;
  x: number;
  y: number;
  r: number;
  rot: number;
  vy?: number;
  vx?: number;
  spin?: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Popup { x: number; y: number; str: string; color: string; size: number; life: number }
interface TrailPoint { x: number; y: number; life: number }
interface Star { x: number; y: number; s: number; r: number }
interface Banner { title: string; sub: string; kind: Kind | null; t: number }
interface Player { x: number; y: number; shield: boolean; tilt: number }

interface GameState {
  scene: Scene;
  sceneT: number;
  t: number;
  score: number;
  best: number;
  newBest: boolean;
  level: number;
  coins: number;
  nearMisses: number;
  combo: number;
  maxCombo: number;
  comboTimer: number;
  player: Player;
  trail: TrailPoint[];
  things: Thing[];
  particles: Particle[];
  popups: Popup[];
  banner: Banner | null;
  spawnTimer: number;
  shake: number;
  flash: number;
  overAt: number;
  deco: (Deco & { vy: number; spin: number })[];
  stars: Star[];
}

interface RenderOptions {
  dt: number;
  shakeX: number;
  shakeY: number;
  playerMinY: number;
  playerSize: number;
}

/** render3d.ts が登録する3D描画 */
interface Render3D {
  render(state: GameState, opts: RenderOptions): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  project(x: number, y: number, h?: number): { x: number; y: number };
}

interface Window {
  __render3d?: Render3D;
  /** 動作確認用 */
  __dodge?: unknown;
  webkitAudioContext?: typeof AudioContext;
}
