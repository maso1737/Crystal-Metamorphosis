# CLAUDE.md — Crystal Metamorphosis (Vite)

> このファイルは Claude が**最初に読む地図**。行番号は変動するので**シンボル名 / セクション名で grep** すること。
> 目的: 毎回フルスキャンせずに状況把握 → 作業 → 検証 を最短化する。

---

## 0. プロジェクト概要

宝石パーティクルの WebGL ビジュアライザ兼 VJ 素材ジェネレータ。Three.js r170 + EffectComposer。
**単一HTML完結が Animation Paint 系の基本方針だが、本プロジェクトは規模(PostProcess + 複数GLSL)ゆえ Vite を採用する例外。**
GitHub Pages に GitHub Actions で自動デプロイ。公開: https://maso1737.github.io/Crystal-Metamorphosis/

- PC 先行 / iPad 優先度低
- 表現追求(エンタメ性・アート性)が主役。教材性は「面白さの発見」として。ワクワク第一。
- リポジトリ: `maso1737/Crystal-Metamorphosis`

---

## 1. ファイル / モジュール構成

```
index.html              DOM(全UI) + CSS。<script type="module" src="/src/main.js">
vite.config.js          base:'./' (Pages サブディレクトリ配信)
package.json            three@0.170.0 / vite / jszip
.github/workflows/      deploy.yml — push で build → Pages 公開

src/
  main.js               オーケストレータ(残り): renderer / instancing / post-process /
                        DoF / UI配線 / loop / export。下記モジュールを import して束ねる。
  state.js              【純データ・依存ゼロ】 state(実行時パラメータ) と PRESETS。
  modes.js              【純関数・依存ゼロ】 modePosition(Rise/Slow/Burst/Rain振付) / lerp / hashDir(内部)
  geometry/cuts.js      【依存: three のみ】 宝石カット9種。export: CUTS / CUT_IDS / cutGeometry
  camera-controls.js    setupCameraControls(camera,host,state) → {update,setMode,setDist,setFov,resetTarget}
  env.js                setupEnvironment(renderer,scene,state) → {applyBackground,setRotation}
                        PMREM / 手続きenv / HDRI読込 / 背景切替
  shaders/*.frag        GLSL fragment(?raw import): bg / env / streak / dof / nearExtract / nearBlur
                        ※ vertex shader は全部フルスクリーン一行なのでインライン(切り出さない)
```

**main.js の責務(まだ分離していない最後の塊):** instancing(rebuildGeometry/updateInstances)、
2-pass post-process、Physical DoF + Near-field(Dual-Layer)、**UI層**(slider配線/syncUI/applyPreset/slots)、
export(captureAt/exportSequence)、animation loop(renderFrame/animate)。

---

## 2. main.js セクション地図(`★` で grep)

```
★ Renderer                       renderer / scene / camera 生成。bgグラデmesh(scene.userData.bgMesh)
★ Environment → ./env.js         const env = setupEnvironment(...)
★ Geometry builders → cuts.js    import 済み
★ Instanced meshes               gemMat / makeMeshForCut / reassignCuts / rebuildGeometry / PARTICLE_COUNT
★ Per-particle data              seeds 配列
★ Mode positions → ./modes.js    import 済み
★ Camera ... → ./camera-controls const cam = setupCameraControls(...)
★ Main update — instances        updateInstances(t,dt) ← modeTime += dt*rate(決定論的)。カメラ近接フェード有
★ Post-Processing                composer / copyPass / bloomPass / streakPass / dofPass / sceneRT
★ PHYSICAL ... HEXAGONAL DoF     dofShader 定義(uniforms)。frag は dof.frag
★ Near-field (Dual-Layer DoF)    nearRTA/B / runNearField / nearExtractMat / nearBlurMat
★ State                          slider() ヘルパ / 全スライダー・トグル配線 / setMode / refreshCutUI
★ Save PNG                       renderOnce / EXPORT_RES / captureAt(単発) / save-png ハンドラ
★ PNG連番書き出し                exportSequence(async, 固定dt, JSZip) / capturing フラグ / setSeqProgress
★ Presets                        applyPreset / syncUI / preset ボタン
★ Copy / Paste params            paramsToObj / copy-params / paste-params
★ Save / Load Slots              localStorage 'crystal_v10_slots' / renderSlots
★ Keyboard                       keydown(1-4 mode / Space burst / R reset / S save / H hide / P post)
★ Animation loop                 renderFrame(t,dt) / animate() / 初回 animate() 呼び出し
```

---

## 3. 検証スタック(配信前に必ず実行)— このプロジェクトの鉄則

```bash
# JS 構文
node --check src/main.js
node --check src/<changed>.js

# GLSL 構文(?raw はコンパイルされない → 実行時まで誤りが出ない。事前検証必須)
npm install --no-save @shaderfrog/glsl-parser
node -e "const {parser}=require('@shaderfrog/glsl-parser');parser.parse('precision highp float;\n'+require('fs').readFileSync('src/shaders/<x>.frag','utf8'),{quiet:true});console.log('GLSL OK')"

# フルビルド(import解決 + バンドル)。modules 数とバンドルサイズで増減を確認
npx vite build 2>&1 | grep -E "modules transformed|built in|error"

# 分割(リファクタ)時は byte 等価チェック: 移動した関数本体が原本と一致するか
#   → 関数本体を空白正規化して比較。GLSL文字列内の {} はブレース計数を誤らせるので diff 併用。
```

- HTML↔JS の ID 相互参照を必ず照合(`getElementById` ⇔ `id="..."`)。
- 分割時はバンドルサイズがほぼ不変 = ロジック無変更の証拠。機能追加時は増えてOK。

---

## 4. 触ってはいけない / 守るべき鉄則

- **`computeVertexNormals()` は全 gem geometry で禁止**(faceting が壊れる)。cuts.js は flat normal 前提。
- **2-pass render 構造は必須**: scene→sceneRT(色+深度)を独立させ、その後 composer chain。
  DoF は sceneRT.depthTexture を読む。chain は depth を書かない。
- **GLSL は `?raw` で .frag に分離**。テンプレ補間 `${}` を GLSL 内に入れない(?raw は静的文字列)。
- **state.js は純データ・依存ゼロ**を維持。
- **applyPreset / paramsToObj は renderer/DOM 密結合**ゆえ main.js に残す(UI層分離時に一緒に動かす)。
- 大きな変更はクリーンな書き換え。細切れパッチで構文を壊さない。
- **Additive halo 注意**: `THREE.AdditiveBlending` は黒ハロー。`CustomBlending`+`OneFactor`(両side)。

---

## 5. よくある作業パターン

### スライダー1個でパラメータ追加(最頻出)— 7箇所セット
1. `src/shaders/<x>.frag` … `uniform float uFoo;` 宣言 + 使用
2. `state.js` … `foo: <default>` を該当グループに追加
3. main.js `★ Post-Processing` … 対象 pass の uniforms に `uFoo:{value:<default>}`
4. main.js `★ State` … `slider('foo','foo',v=>{<pass>.uniforms.uFoo.value=v;});`
   （pass uniform を毎フレーム loop で同期している系(streak)はコールバック不要なことも）
5. main.js `paramsToObj` … `foo:state.foo,` 追加(COPY/PASTE対応)
6. main.js `applyPreset` … `if(p.foo!==undefined){s.foo=p.foo; <pass>.uniforms.uFoo.value=p.foo;}`
   と syncUI 同期ブロックに `set('foo',s.foo);`
7. `index.html` … `.row` + `<input type="range" id="foo">` + `id="foo-val"` の span
- `slider(id,key,cb)` は state[key] を読み書きし `id-val` を `toFixed(2)` 表示 + cb 実行。整数表示は cb で上書き。

### 宝石カット追加
- `geometry/cuts.js` に `make○○Geometry(N)` を書き、`CUTS` に1行追加。`computeVertexNormals` 禁止厳守。

### モーション(動き方)追加
- `modes.js` の `modePosition` に `mode===4` 分岐追加 + state.modeSpeed 配列を1つ伸ばす。純関数のまま。

---

## 6. Git / デプロイ ワークフロー

```bash
# 依存が増えた場合のみ
npm install
# 変更をコミット & push (push で Actions が build→Pages 公開)
git add <files>
git commit -m "..."
git push          # → 数十秒で https://maso1737.github.io/Crystal-Metamorphosis/ 反映
```
- Pages の Source は **GitHub Actions**(Deploy from a branch ではない)。
- `dist/` は配信物、`node_modules/` は .gitignore 済み(コミットしない)。

### Claude → Dot の受け渡し規約
- Claude は環境にGPUが無いため**目視レンダリング不可**。構文/GLSL/build まで検証し、Dot が 4070 で目視。
- 成果物は**変更ファイルだけを zip** で渡す(Dot がローカル/Webで上書き)。依存追加時は package.json + package-lock.json も同梱。

---

## 7. 現状(機能)と今後

**実装済み:** Vite移行 / 全モジュール分割(state・cuts・shaders・modes・camera-controls・env) /
六角絞りボケ(丸⇔六角 + 尖りスライダー) / streak斜めクロス可変 / CA可視化 / カメラ近接カリング /
ラベル選択コピー / BPMビートフラッシュ / 4K&プリセットPNG書き出し(Black BG) / PNG連番書き出し(JSZip)。

**残りの分割:** UI層(slider配線/applyPreset/slots)= 最難関・密結合 → 最後。

**VJパイプライン(ランキング順):** 1.4K/連番書き出し(済) → 2.平行投影+ステージモデル(Ortho cam + GLTF/OBJ) →
3.下から凍る演出(新モード) → 4.カメラワーク録画(CAMERA_RIG_SKILL.md / KF補間再生)。

**保留:** 真の透過αPNG(renderer を alpha:true で再生成が必要) / OBJ宝石アップロード(InstancedMesh設計変更) /
Obsidian連携(他プロジェクトのファイル掛け合わせ用途・トークン対策とは別軸)。

---

## 8. ハードウェア / ツール
RTX 4070 SUPER / i7-14700F / 32GB(Shinjuku)。three r170 / EffectComposer / UnrealBloomPass /
@shaderfrog/glsl-parser(GLSL検証) / jszip(連番export)。
