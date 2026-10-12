# 開発の手引き(TypeScript と lint)

- 作成日: 2026-10-12
- 対象: よけゲー(リポジトリ直下)と よけうち(`shooter/`)

## しくみ

ソースは TypeScript で `src/` に置き、ビルドした JavaScript をリポジトリに入れて、GitHub Pages でそのまま配信します。

```
src/dodge/game.ts       ──tsc──▶  game.js
src/dodge/render3d.ts   ──tsc──▶  render3d.js
src/shooter/game.ts     ──tsc──▶  shooter/game.js
src/shooter/render3d.ts ──tsc──▶  shooter/render3d.js
```

- **`game.js` などを直接書き換えないでください。** 変更は `src/` の `.ts` に書き、`npm run build` で作り直します
- GitHub Pages の設定(main / root から配信)は変えていません。ビルド済みの JavaScript があるので、今までどおり動きます
- 実行時に読み込むものは変わっていません(Three.js は同梱の `vendor/three.module.min.js`)。npm のパッケージは開発用だけで、配信されるページには入りません

| ファイル | 役割 |
|---|---|
| `src/dodge/*.ts` | よけゲーのソース |
| `src/shooter/*.ts` | よけうちのソース |
| `src/*/types.d.ts` | `game.ts` と `render3d.ts` が共有する型(状態、障害物など) |
| `src/vendor/`、`src/dodge/vendor/` | 同梱の Three.js に `@types/three` の型を当てるための宣言 |
| `src/tsconfig.base.json` | 型チェックの共通設定(`strict` など) |
| `eslint.config.js` | lint の設定 |
| `package.json` | 開発用の道具とコマンド |
| `.github/workflows/check.yml` | プルリクエストごとに lint、型チェック、ビルド結果の確認を自動で行う |

## コマンド

最初に一度だけ `npm install` を実行します(Node.js 20.19 以降、または 22.13 以降)。

| コマンド | 内容 |
|---|---|
| `npm run build` | TypeScript から JavaScript を作る |
| `npm run lint` | ESLint でチェックする |
| `npm run typecheck` | 型チェックだけ行う(ファイルは作らない) |
| `npm run check` | lint と型チェックをまとめて行う |

`game.ts` などを変えたら、`index.html` の `?v=` 番号を上げてください(ブラウザのキャッシュ対策。これまでと同じ決まりです)。

## 使っている道具

| 道具 | バージョン | 用途 |
|---|---|---|
| TypeScript | 6.0.3 | 型チェックと JavaScript への変換 |
| ESLint | 10.12.0 | lint |
| typescript-eslint | 8.71.1 | ESLint で TypeScript を読む。推奨ルール(`recommended`)を使う |
| @types/three | 0.160.0 | 同梱の Three.js r160 の型 |

TypeScript は 7.0.2 も出ていますが、typescript-eslint 8.71.1 が対応しているのは 6.0 系までなので、6.0.3 にしています。

lint のルールは typescript-eslint の推奨ルールに、`eqeqeq`(`==` を使わない)、`prefer-const`、`no-var` を足しています。

## 検討した方法

| | ビルドした JS をリポジトリに入れる(採用) | GitHub Actions でビルドして配信 | JavaScript のまま JSDoc で型を書く |
|---|---|---|---|
| 言語 | TypeScript | TypeScript | JavaScript(型チェックだけ TypeScript) |
| Pages の設定変更 | 不要 | 必要(配信元を Actions に変える) | 不要 |
| リポジトリの中身 | ソースとビルド結果の両方 | ソースだけ | ソースだけ |
| 注意点 | ビルドし忘れを防ぐため、CI で確認する | 設定変更はこの作業環境からできない | 「TypeScript に変更」にはならない |

Pages の設定を変えずに今すぐ動かせることを優先して、ビルド結果を入れる方法にしました。
あとで Pages の配信元を GitHub Actions に変えれば、ビルド結果をリポジトリから外すこともできます。

## 書き換えで見つかった不具合

型チェックで、よけうちの効果音の定義に同じ名前(`hit`)が2つあり、被弾したときの音が「弾が当たった音」で上書きされていたことが分かりました。弾が当たった音を `hitShot` に分けて直しました。
それ以外の動きは、書き換え前と同じになるようにしています。
