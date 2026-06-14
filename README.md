# Crystal Metamorphosis — Vite版 (v11 移行 Step 1〜4 完了)

v10 単一HTML → Vite環境へ移行。現状は **src/main.js 単一ファイル** に
v10の `<script type="module">` を無改変で移植した状態 (動作確認フェーズ)。

## 起動
```bash
npm install      # three@0.170.0 + vite を取得
npm run dev      # http://localhost:5173/
```

## ビルド (GitHub Pages配信)
```bash
npm run build    # dist/ に出力 (base:'./' 済み)
npm run preview  # ビルド結果をローカル確認
```

## この移行でやったこと
- Step 1: `npm create vite@latest -- --template vanilla` + `npm install three@0.170.0`
- Step 2: vite.config.js に `base: './'` (Pages サブディレクトリ対応)
- Step 4: v10 の script本体 (334〜1890行) を src/main.js へ丸ごとコピー
  - import文は無改変。`three/addons/*` は three の exports map で解決 (importmap不要)
  - importmap / CDN参照は削除 (node_modules経由に)
  - ロジック・GLSL・localStorageキー(crystal_v10_slots) すべて据え置き

## 検証済み (この環境, GPU無し)
- `node --check src/main.js` 構文OK
- `vite build` 成功 (17 modules transformed)
- `vite dev` 起動・index.html配信・main.jsトランスフォーム HTTP 200

## 未検証 → 4070で目視
- 実WebGLレンダリング全般 (粒子描画 / PBR / Post-Process 2パス / Dual-Layer DoF)

## 次 (Step 4-3 以降, 別作業)
- src/main.js のファイル分割 (renderer / geometry / cuts / instancing / modes / dof / passes / state / ui / env)
- GLSL を `.frag`/`.vert` に切り出して `?raw` import (Step 3)
- ※分割は動作確認が取れてから。今はまだ単一ファイルのまま
