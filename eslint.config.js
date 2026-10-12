import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ビルドで作られる JavaScript と同梱ライブラリはチェックしない
  { ignores: ['game.js', 'render3d.js', 'shooter/**', 'vendor/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
);
