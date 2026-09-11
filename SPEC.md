# Holo Image Styles — 実装仕様書（v1.0 / 2026-09-10）

pokemon-cards-css（simeydotme, GPL-3.0）のホログラム・カードエフェクトを、WordPress コアの画像ブロックに「スタイル」として追加するプラグイン。1 リポジトリから **無料版（wp.org）** と **All Effects 版（$5・全部入り）** の 2 つの zip をビルドする。

この文書は、別の実装者が読んで着手できることを目的にしている。判断済みの事項は「決定」と書き、実装者に委ねる事項は「任意」と書く。

---

## 0. 決定事項の一覧

| 項目 | 決定 |
|---|---|
| 対象ブロック | `core/image` のみ（v1）。cover / gallery は v2 |
| 適用方法 | `register_block_style()` によるスタイルバリエーション。クラス `is-style-holo-{family}` |
| ファミリー（7） | `holo` `cosmos` `rainbow` `foil` `metallic` `reverse` `glare` |
| バリアント（23） | 原作の 23 エフェクト。`variants.json` が唯一の台帳。`tier: free \| all` |
| 保存マークアップ | **コアのまま変更しない。** ラッパーとレイヤーはサーバー側 `render_block_core/image` で注入 |
| エフェクト用 DOM | `figure > .holo__card > (img \| a>img) + span.holo__shine + span.holo__glare` |
| インタラクション | Interactivity API（`@wordpress/interactivity`）。namespace `holo-image-styles` |
| バネ挙動 | JS ループなし。`@property` で CSS 変数を型登録し `transition + linear()` |
| 遅延 | IntersectionObserver で `is-holo-armed` を付けるまで重いレイヤーを描かない |
| reduced-motion | 傾き 0・transition なし・自動再生なし。固定角度の光沢のみ |
| エディション | `HOLO_EDITION` 定数 `'free'` / `'all'`。差分は台帳の tier とヘッダーのみ |
| 乗り換え | All 版の有効化で無料版を自動停止。通知に「無料版を削除」ボタン |
| 有料版の配布 | **JADE Pro アカウントページ**（pro.jadeclinic.jp）からダウンロード。BCP Builder と同じ配信パイプライン（§14） |
| 有料版の更新 | `Update URI` ヘッダー ＋ `update_plugins_{host}` フィルタ。公開の静的 `update.json`（キー不要） |
| ライセンス | GPL-3.0（原作に合わせる）。原作者クレジット必須 |
| 名称 | `holo-image-styles` / `holo-image-styles-all`。**「Pokemon」を名称・スラッグ・説明冒頭に使わない**（商標で却下） |
| 要件 | WP 6.7+ 動作、7.1 で検証。PHP 8.1+ |
| 作らないもの | ライセンスキー（プラグイン側）、テレメトリ、有料版専用の管理画面、拡大ポップオーバー、ジャイロ（v2 任意）。Ko-fi 等の外部ショップも使わない（アカウントページに一本化） |

---

## 1. リポジトリ構成

```
holo-image-styles/                      ← GitHub 1 つ。公開で良い
├─ package.json                         ← @wordpress/scripts
├─ composer.json                        ← phpstan, phpcs (WordPress-Extra)
├─ src/
│  ├─ variants.json                     ← 台帳（§2）
│  ├─ plugin.php.tpl                    ← main ファイルのテンプレート（§7）
│  ├─ php/
│  │  ├─ class-plugin.php               ← 起動・スタイル登録・enqueue
│  │  ├─ class-variants.php             ← variants.php の読み込みと検証
│  │  ├─ class-render.php               ← render_block 注入（§4）
│  │  ├─ class-editor.php               ← 属性登録・エディタ用アセット
│  │  ├─ class-edition.php              ← 乗り換え・削除ボタン・更新（§7, §8）
│  │  └─ class-abilities.php            ← Abilities API（任意・§10）
│  ├─ css/
│  │  ├─ base.css                       ← @property, ラッパー, glare 既定, reduced-motion
│  │  ├─ editor.css                     ← エディタ内の簡易プレビュー
│  │  └─ families/{family}.css          ← ファミリー 1 ファイル。バリアントは属性セレクタ
│  ├─ textures/                         ← 最適化済み画像（§2.3）
│  ├─ view/index.js                     ← Interactivity API store（§5）
│  └─ editor/index.js                   ← BlockEdit HOC・ホロ効果パネル（§6）
├─ bin/
│  ├─ build.mjs                         ← `node bin/build.mjs free|all`
│  └─ check-variants.mjs                ← 台帳と実ファイルの整合チェック（CI）
├─ dist/                                ← 生成物（git 管理外）
│  ├─ holo-image-styles/
│  └─ holo-image-styles-all/
├─ languages/                           ← .pot と ja.l10n.php
├─ readme.txt                           ← wp.org 用
└─ .github/workflows/
   ├─ ci.yml                            ← lint, phpstan, check-variants, wp-env e2e
   └─ release.yml                       ← tag → 2 zip → SVN deploy → Supabase Storage（§14.6）
```

---

## 2. 台帳 `variants.json`

### 2.1 スキーマ

```json
{
  "$schema": "./variants.schema.json",
  "families": {
    "holo":     { "label": "Holo",     "default": "rare-holo",   "glow": "hsl(175 100% 90%)" },
    "cosmos":   { "label": "Cosmos",   "default": "cosmos",      "glow": "hsl(228 80% 70%)" },
    "rainbow":  { "label": "Rainbow",  "default": "rainbow-rare","glow": "hsl(323 100% 80%)" },
    "foil":     { "label": "Foil",     "default": "v-full-art",  "glow": "hsl(192 97% 60%)" },
    "metallic": { "label": "Metallic", "default": "secret-rare", "glow": "hsl(47 100% 78%)" },
    "reverse":  { "label": "Reverse",  "default": "reverse-holo","glow": "hsl(54 87% 63%)" },
    "glare":    { "label": "Glare",    "default": "basic",       "glow": "hsl(0 0% 100%)" }
  },
  "variants": {
    "rare-holo":     { "family": "holo",     "tier": "free", "label": "Holofoil Rare",        "source": "regular-holo.css",       "textures": [] },
    "amazing-rare":  { "family": "holo",     "tier": "all",  "label": "Amazing Rare",          "source": "amazing-rare.css",       "textures": [] },
    "radiant":       { "family": "holo",     "tier": "all",  "label": "Radiant Holofoil",      "source": "radiant-holo.css",       "textures": ["trainerbg.png"] },
    "tg-holo":       { "family": "holo",     "tier": "all",  "label": "Trainer Gallery Holo",  "source": "trainer-gallery-holo.css","textures": [] },
    "cosmos":        { "family": "cosmos",   "tier": "free", "label": "Galaxy / Cosmos",       "source": "cosmos-holo.css",        "textures": ["cosmos-bottom.webp","cosmos-middle.webp","cosmos-top.webp"] },
    "rainbow-rare":  { "family": "rainbow",  "tier": "free", "label": "Rainbow Rare",          "source": "rainbow-holo.css",       "textures": ["glitter.webp","illusion-mask.png"] },
    "v-alt":         { "family": "rainbow",  "tier": "all",  "label": "V Alternate Art",       "source": "rainbow-alt.css",        "textures": ["glitter.webp"] },
    "vmax-alt":      { "family": "rainbow",  "tier": "all",  "label": "VMax Alternate",        "source": "rainbow-alt.css",        "textures": ["glitter.webp"] },
    "v":             { "family": "foil",     "tier": "all",  "label": "V",                     "source": "v-regular.css",          "textures": [] },
    "v-full-art":    { "family": "foil",     "tier": "free", "label": "V Full Art",            "source": "v-full-art.css",         "textures": ["illusion.png"] },
    "vmax":          { "family": "foil",     "tier": "all",  "label": "VMax",                  "source": "v-max.css",              "textures": ["vmaxbg.webp"] },
    "vstar":         { "family": "foil",     "tier": "all",  "label": "VStar",                 "source": "v-star.css",             "textures": ["ancient.png"] },
    "trainer-full":  { "family": "foil",     "tier": "all",  "label": "Trainer Full Art",      "source": "trainer-full-art.css",   "textures": ["trainerbg.png"] },
    "tg-v":          { "family": "foil",     "tier": "all",  "label": "Trainer Gallery V",     "source": "trainer-gallery-v-regular.css", "textures": [] },
    "tg-vmax":       { "family": "foil",     "tier": "all",  "label": "Trainer Gallery VMax",  "source": "trainer-gallery-v-max.css", "textures": [] },
    "secret-rare":   { "family": "metallic", "tier": "free", "label": "Secret Rare (Gold)",    "source": "secret-rare.css",        "textures": ["geometric.png"] },
    "tg-secret":     { "family": "metallic", "tier": "all",  "label": "Trainer Gallery Secret","source": "trainer-gallery-secret-rare.css", "textures": ["geometric.png"] },
    "shiny":         { "family": "metallic", "tier": "all",  "label": "Shiny Vault",           "source": "shiny-rare.css",         "textures": ["illusion.png"] },
    "shiny-v":       { "family": "metallic", "tier": "all",  "label": "Shiny Vault V",         "source": "shiny-v.css",            "textures": ["illusion.png"] },
    "shiny-vmax":    { "family": "metallic", "tier": "all",  "label": "Shiny Vault VMax",      "source": "shiny-vmax.css",         "textures": ["illusion.png"] },
    "pikachu":       { "family": "metallic", "tier": "all",  "label": "Special Illustration",  "source": "swsh-pikachu.css",       "textures": ["illusion-mask.png"] },
    "reverse-holo":  { "family": "reverse",  "tier": "free", "label": "Reverse Holo",          "source": "reverse-holo.css",       "textures": ["illusion.png"] },
    "basic":         { "family": "glare",    "tier": "free", "label": "Glare only",            "source": "basic.css",              "textures": [] }
  }
}
```

ルール:

- `family` は `families` に存在すること。各 family の `default` は **tier: free** であること（無料版に戻したときのフォールバック先になるため）。`check-variants.mjs` が検証する。
- `source` は原作 `public/css/cards/*.css` の対応ファイル名（移植の出典を残すだけで、ビルドは使わない）。
- `textures` に書いたファイルは `src/textures/` に実在すること（CI で検証）。
- キー名は変更禁止（保存済みコンテンツの `data-holo-variant` に使われる）。追加は自由、削除は非推奨（削除するなら family default にフォールバックするので壊れはしない）。

### 2.2 台帳から生成されるもの

`bin/build.mjs {edition}` が生成:

1. `dist/{slug}/inc/variants.php` — tier で絞った台帳を `return [ ... ];` の PHP 配列で（`json_decode` を実行時に走らせない）。
2. `dist/{slug}/css/families/*.css` — そのエディションに含まれるバリアントのブロックだけを連結・minify（§3.3 の目印コメントで切り出す）。
3. `dist/{slug}/textures/` — 参照されるテクスチャのみコピー（ホワイトリスト方式）。
4. `dist/{slug}/{slug}.php` — `plugin.php.tpl` の置換（§7.1）。
5. `dist/{slug}/build/` — wp-scripts の出力（view / editor）。両エディション共通。

### 2.3 テクスチャの前処理（一度だけ手作業、結果をリポジトリに入れる）

| 原作 | 処理 | 備考 |
|---|---|---|
| cosmos-bottom/middle-trans/top-trans.png | 300px WebP q55 | 3 枚で ≈130KB |
| glitter.png | 256px WebP q60 | タイル表示 |
| illusion.png, illusion-mask.png, geometric.png, ancient.png, trainerbg.png | **PNG-8 のまま** | WebP 化すると肥大する |
| vmaxbg.jpg | WebP q70 | |
| grain.webp | 使わない | CSS グラデーションで代替 |
| rainbow.jpg, cosmos.png, galaxy*.png | 収録しない | 原作でも未参照 |

---

## 3. CSS

### 3.1 base.css（両エディション共通・全ページで最初に読む）

- `@property` で以下を型登録（`inherits: true`）: `--pointer-x/y` `<percentage>`、`--background-x/y` `<percentage>`、`--rotate-x/y` `<angle>`、`--card-opacity` `--card-scale` `--pointer-from-center/top/left` `<number>`。
- `.wp-block-image[class*="is-style-holo-"]`: `perspective: 600px; touch-action: pan-y;` と原作の色変数（`--red` … `--sunpillar-6`）。
- `.holo__card`: `display:grid; transform-style:preserve-3d; isolation:isolate;` 回転は `rotateY(calc(var(--rotate-x) * var(--holo-tilt))) rotateX(calc(var(--rotate-y) * var(--holo-tilt)))`。**transition を持つのは `.holo__card`**（CSS 変数もここに書かれる）。
  - 休止時: 各変数 `1.2s var(--spring)`（`--spring: linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.2%, 1.013 55.2%, 1.014 63.6%, 1.006 79.7%, 1)`）
  - `.is-interacting`: 位置系 `0.08s linear`、回転 `0.12s ease-out`。
- `.holo__card > *`: `grid-area:1/1; width:100%; border-radius:inherit; overflow:hidden; pointer-events:none;`
  **例外:** `.holo__card > .lightbox-trigger { pointer-events:auto }`（コアのライトボックスボタン）。
- `.holo__shine`, `.holo__glare`: 原作 base.css の値をそのまま。`opacity: calc(var(--card-opacity) * var(--holo-intensity))`。
- **arm ゲート:** `.holo__card:not(.is-holo-armed) .holo__shine, …::before, …::after { background-image:none !important; content:none !important }`。`.is-holo-armed .holo__shine, .is-holo-armed .holo__glare { will-change: transform, opacity, background-position, filter }`。
- **reduced-motion:**
  ```css
  @media (prefers-reduced-motion: reduce) {
    .holo__card { --holo-tilt: 0; transition: none !important;
      --pointer-x: 28% !important; --pointer-y: 18% !important; --background-x: 44% !important; --background-y: 36% !important;
      --pointer-from-center: .7 !important; --pointer-from-top: .18 !important; --pointer-from-left: .28 !important; }
    .holo__shine, .holo__glare { opacity: calc(.45 * var(--holo-intensity)) !important; }
  }
  ```
- **小画面（7.1 の `@mobile` 相当。style_data ではなく素の media query で書く。理由: 7.1 未満でも同じ CSS で動かすため）:** `@media (max-width:480px){ .holo__card{ --holo-tilt:.6 } .is-style-holo-holo .holo__shine::before{ content:none } }`
- 既定値: `.holo__card { --holo-intensity:1; --holo-tilt:1; --pointer-x:50%; … --card-opacity:0 }`。JS なしでも壊れない（光らないだけ）。

### 3.2 families/{family}.css

- セレクタの基本形: `.is-style-holo-{family} .holo__card[data-holo-variant="{variant}"] .holo__shine`。
- 原作の `.card[data-rarity="…"]` を上記に機械的に置換する。`data-subtypes` / `data-supertype` / `data-trainer-gallery` による分岐は **すべて削除**（汎用画像に絵柄の窓は無い）。`clip-path: var(--clip…)` は `.holo__card[data-holo-window="1"]` のときだけ適用する `--holo-clip` に置換。
- テクスチャ URL は **CSS に書かない。** `--foil`, `--glitter`, `--tex-1..3` を base で `none` にしておき、サーバーが `.holo__card` の `style` 属性に `--tex-1:url(...)` を出す（§4.4）。これでフォルダ名・エディション差・CDN 差を CSS が知らずに済む。
- `--cosmosbg`（星空のランダム位置）はサーバーが乱数で出す（原作は JS）。

### 3.3 ビルド用の目印

ファミリー CSS 内で各バリアントのブロックを次で囲む。ビルドはこの間を tier で残す/落とす。

```css
/* @variant amazing-rare */
…
/* @end */
```

---

## 4. サーバー側の注入 `class-render.php`

### 4.1 フック

```php
add_filter( 'render_block_core/image', [ $this, 'inject' ], 20, 2 );
```

優先度 20: コアのライトボックス処理（`render_block_core/image` 内部・優先度 10 相当）の**後**に走らせ、`lightbox-trigger` ボタンを含む最終マークアップを包むため。

### 4.2 対象判定

```php
$attrs = $block['attrs'] ?? [];
$class = $attrs['className'] ?? '';
if ( ! preg_match( '/\bis-style-holo-([a-z]+)\b/', $class, $m ) ) return $content;
$family = $m[1];
if ( ! Variants::has_family( $family ) ) return $content;   // 未知のファミリー → 素通し
if ( ! str_contains( $content, '<img' ) ) return $content;    // 画像未設定
```

`$block['attrs']['className']` を見る（レンダリング済み HTML の class を正規表現で探さない）。

### 4.3 ラッパー挿入の手順（`WP_HTML_Tag_Processor` にはノード挿入 API が無いため、目印方式）

1. `$p = new WP_HTML_Tag_Processor( $content );`
2. `while ( $p->next_tag( 'FIGURE' ) )` で `$p->has_class( "is-style-holo-$family" )` の figure を探す。見つからなければ素通し（align left/right/center では `<div class="wp-block-image"><figure class="alignleft is-style-…">` の構造になる。外側の div ではなく **figure** に is-style が付く）。
3. 見つけた figure に `$p->set_attribute( 'data-holo-marker', '1' )`。`$html = $p->get_updated_html()`。
4. `$open = strpos( $html, 'data-holo-marker' )`; `$gt = strpos( $html, '>', $open )` → 開始タグの終端。属性値内の `>` は WP が `&gt;` にエスケープするので誤検出しない。
5. 終端: `$cap = strpos( $html, '<figcaption', $gt )`; 無ければ `$end = strrpos( $html, '</figure>' )`。`$close = $cap !== false ? $cap : $end`。
6. `$inner = substr( $html, $gt + 1, $close - $gt - 1 )`（img / a>img / lightbox-trigger を含む）。
7. 組み立て:
   ```php
   $wrapper_open  = sprintf( '<div class="holo__card" data-holo-variant="%s"%s style="%s" data-wp-interactive="holo-image-styles" data-wp-init="callbacks.init" data-wp-on-async--pointermove="actions.move" data-wp-on-async--pointerleave="actions.leave" data-wp-on-async--pointerdown="actions.down">',
       esc_attr( $variant ), $window ? ' data-holo-window="1"' : '', esc_attr( $style ) );
   $layers = '<span class="holo__shine" aria-hidden="true"></span><span class="holo__glare" aria-hidden="true"></span>';
   $html = substr( $html, 0, $gt + 1 ) . $wrapper_open . $inner . $layers . '</div>' . substr( $html, $close );
   ```
8. `str_replace( ' data-holo-marker="1"', '', $html )` で目印を除去。
9. `wp_enqueue_script_module( 'holo-image-styles-view' )` と family CSS の enqueue（§4.5）。

`data-wp-interactive` は **figure ではなく `.holo__card`** に置く。figure にはコアのライトボックスが `data-wp-interactive="core/image"` を置くことがあり、1 要素 1 namespace のため衝突する。

### 4.4 属性 → 出力

| ブロック属性 `holo.*` | 既定 | 出力 |
|---|---|---|
| `variant` | family の default | `data-holo-variant`。台帳に無い／このエディションに無い値は **family default に置換**（フォールバック） |
| `intensity` 0–1.5 | 1 | `--holo-intensity` |
| `tilt` 0–1.5 | 1 | `--holo-tilt` |
| `touch` `tap\|glare\|off` | `tap` | `data-holo-touch` |
| `showcase` bool | false | `data-holo-showcase="1"` |
| `window` bool | false | `data-holo-window="1"` |

`style` には加えて `--holo-glow`（family の glow）、テクスチャ変数（`--tex-1:url(...)` …。URL は `plugins_url( 'textures/' . $file, HOLO_IMAGE_STYLES_FILE )`）、`--cosmosbg: {rand 0–734}px {rand 0–1280}px`（cosmos のみ）。値はすべて `esc_attr` の前に `sanitize` する（数値は `(float)` でクランプ、variant は `sanitize_key`）。

### 4.5 アセットの登録と条件付き読み込み `class-plugin.php`

```php
// init
wp_register_style( 'holo-image-styles-base', $url . 'css/base.css', [], HOLO_IMAGE_STYLES_VERSION . '-' . HOLO_EDITION );
foreach ( Variants::families() as $family => $def ) {
  wp_register_style( "holo-image-styles-$family", $url . "css/families/$family.css", [ 'holo-image-styles-base' ], $ver );
  register_block_style( 'core/image', [
    'name'         => "holo-$family",
    'label'        => $def['label'],
    'style_handle' => "holo-image-styles-$family",   // コアが is-style-holo-{family} を含む描画時にだけ enqueue
  ] );
}
wp_register_script_module( 'holo-image-styles-view', $url . 'build/view.js', [ '@wordpress/interactivity' ], $ver );
```

`style_handle` を使うと、コアが「そのブロックスタイルが実際に描画されたとき」に enqueue してくれる（`enqueue_block_styles_assets`）。ホロ画像の無いページでは何も読まれない。**`should_load_separate_core_block_assets` が false のテーマ（クラシック等）では全ページで読まれる**。許容する（base + family で最大 20KB）。

ハンドルのバージョンに **エディションを含める**（Kinsta のページキャッシュ・ブラウザキャッシュ対策。無料↔All の切替で CSS が変わるため）。

---

## 5. フロント JS `src/view/index.js`（Interactivity API）

```js
import { store, getElement, getContext } from '@wordpress/interactivity';

const rm = () => window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
const hoverable = () => window.matchMedia( '(hover: hover)' ).matches;
const clamp = ( v, a = 0, b = 100 ) => Math.min( b, Math.max( a, v ) );
const adjust = ( v, a, b, c, d ) => c + ( ( d - c ) * ( v - a ) ) / ( b - a );

const REST = { 'pointer-x':'50%','pointer-y':'50%','background-x':'50%','background-y':'50%','rotate-x':'0deg','rotate-y':'0deg','card-opacity':0,'pointer-from-center':0,'pointer-from-top':.5,'pointer-from-left':.5 };
const setVars = ( el, v ) => { for ( const k in v ) el.style.setProperty( '--' + k, v[ k ] ); };

let io;
const observe = ( el ) => {
  io ??= new IntersectionObserver( ( entries ) => {
    for ( const e of entries ) {
      e.target.classList.toggle( 'is-holo-armed', e.isIntersecting );
      if ( ! e.isIntersecting ) { e.target.classList.remove( 'is-interacting' ); setVars( e.target, REST ); }
    }
  }, { rootMargin: '200px 0px' } );
  io.observe( el );
};

store( 'holo-image-styles', {
  actions: {
    move( event ) {
      const { ref } = getElement();
      if ( rm() || document.hidden || ! ref.classList.contains( 'is-holo-armed' ) ) return;
      if ( event.pointerType === 'touch' && ref.dataset.holoTouch !== 'tap' ) return;
      const r = ref.getBoundingClientRect();
      const x = clamp( ( 100 / r.width ) * ( event.clientX - r.left ) );
      const y = clamp( ( 100 / r.height ) * ( event.clientY - r.top ) );
      const cx = x - 50, cy = y - 50;
      ref.classList.add( 'is-interacting' );
      // 1 フレーム 1 回。連続 pointermove は最後の値だけ反映
      ref._holoPending = { x, y, cx, cy };
      ref._holoRaf ??= requestAnimationFrame( () => {
        ref._holoRaf = null; const p = ref._holoPending; if ( ! p ) return;
        setVars( ref, {
          'pointer-x': p.x + '%', 'pointer-y': p.y + '%',
          'background-x': adjust( p.x, 0, 100, 37, 63 ) + '%', 'background-y': adjust( p.y, 0, 100, 33, 67 ) + '%',
          'rotate-x': -( p.cx / 3.5 ) + 'deg', 'rotate-y': ( p.cy / 3.5 ) + 'deg',
          'card-opacity': 1,
          'pointer-from-center': clamp( Math.hypot( p.cx, p.cy ) / 50, 0, 1 ),
          'pointer-from-top': p.y / 100, 'pointer-from-left': p.x / 100,
        } );
      } );
    },
    leave() {
      const { ref } = getElement();
      ref._holoPending = null; ref.classList.remove( 'is-interacting' ); setVars( ref, REST );
    },
    down( event ) {
      // タッチ: 1.5 秒点灯して戻る（touch=tap）。hover 可能端末では何もしない
      const { ref } = getElement();
      if ( event.pointerType !== 'touch' || hoverable() || ref.dataset.holoTouch !== 'tap' ) return;
      store( 'holo-image-styles' ).actions.move( event );
      clearTimeout( ref._holoTimer );
      ref._holoTimer = setTimeout( () => store( 'holo-image-styles' ).actions.leave(), 1500 );
    },
  },
  callbacks: {
    init() {
      const { ref } = getElement();
      setVars( ref, REST );
      if ( 'IntersectionObserver' in window ) observe( ref ); else ref.classList.add( 'is-holo-armed' );
      if ( ref.dataset.holoShowcase === '1' && ! rm() && ! ref._holoShown ) {
        ref._holoShown = true;   // 初回のみ。IO で armed になってから 1 秒後に 3 秒回す
        const start = () => { /* sin/cos で pending を書き、rAF で反映。200 tick × 20ms。終わったら leave() */ };
        setTimeout( start, 1000 );
      }
      document.addEventListener( 'visibilitychange', () => { if ( document.hidden ) store( 'holo-image-styles' ).actions.leave(); }, { once: false } );
    },
  },
} );
```

注意点:

- `data-wp-on-async--*` を使う（メインスレッドをブロックしない）。6.6 未満は通常の `data-wp-on--*` にフォールバック不要（要件 6.7+）。
- **要素に状態を持つ**（`ref._holo*`）。context は使わない。理由: ページ内に同じ画像が複数回あっても独立に動き、ハイドレーションで context が上書きされても影響しない。
- `getBoundingClientRect` は pointermove ごとに呼ぶ（transform 中も正しい値が要る）。1 フレーム 1 回なのでコストは無視できる。
- `visibilitychange` リスナーは `init` ごとに増えるので、`ref` 単位ではなく **モジュールスコープで 1 回だけ** 登録し、`document.querySelectorAll('.holo__card.is-interacting')` を休止させる実装にする（上記は簡略）。

---

## 6. エディタ `src/editor/index.js`

### 6.1 属性の追加

```js
addFilter( 'blocks.registerBlockType', 'holo/attrs', ( settings, name ) => {
  if ( name !== 'core/image' ) return settings;
  return { ...settings, attributes: { ...settings.attributes,
    holo: { type: 'object', default: { variant: '', intensity: 1, tilt: 1, touch: 'tap', showcase: false, window: false } } } };
} );
```

サーバー側でも `register_block_type_args` で同じ属性を `core/image` に足す（REST の `render` エンドポイント経由でも `$block['attrs']` に載るように）。default はサーバーと JS で**同じ値**にする（差があるとブロック検証でダーティになる）。

### 6.2 「ホロ効果」パネル（`editor.BlockEdit` HOC）

- 表示条件: `attributes.className` に `is-style-holo-` を含むときだけ。
- コントロール: バリアント（SelectControl。**現在の family に属し、かつこのエディションに含まれるもの**だけ。台帳は `wp_localize_script` ではなく `wp_add_inline_script` で `window.holoImageStyles = { edition, variants, families }` を渡す）、強度（RangeControl 0–150%）、傾き（0–150%）、タッチ端末（ToggleGroupControl: tap / glare / off）、自動ショーケース（Toggle）、窓（Toggle）。
- 無料版のみ、パネル末尾に help テキスト 1 行「他 16 種は All Effects で。」＋外部リンク。**これ以外の宣伝 UI は置かない**（wp.org 審査）。
- family を切り替えたら（className の変化を監視）`variant` を新 family の default にリセットする。

### 6.3 エディタ内プレビュー（決定: 簡易版）

エディタの `core/image` は React が `<figure><img></figure>` を描き、サーバーの注入は走らない。**エディタでは `figure::before`（shine 1 層）と `figure::after`（glare）の 2 層で簡易表示**にする。フルの 5 層はフロントのみ。

- `editor.BlockListBlock` フィルタで `wrapperProps` に `data-holo-variant` と `style`（`--holo-intensity` 等）を付ける。
- `editor.css` に `.editor-styles-wrapper .wp-block-image[class*="is-style-holo-"]` 用の 2 層 CSS と、**固定のポインタ位置**（`--pointer-x:25%; --pointer-y:10%; --card-opacity:1; …`）を書く。ホバーで少しだけ位置が動くように `:hover` で別の固定値に切り替える程度に留める（エディタ内で JS のポインタ追従はしない）。
- スタイルパネルのプレビュー（`.block-editor-block-styles__preview`）も同じ CSS で光った状態になる。
- `enqueue_block_assets` で base.css + editor.css をエディタ iframe 内に読み込む（7.1 は常時 iframe。`enqueue_block_editor_assets` では iframe 内に入らない）。

これを「簡易」と明記して readme にも書く。後日 DOM 注入に挑戦するのは任意。

---

## 7. エディション

### 7.1 `plugin.php.tpl` → main ファイル

```php
<?php
/**
 * Plugin Name: {{NAME}}
 * Plugin URI:  https://example.com/holo-image-styles
 * Description: Holographic card effects for the Image block. Based on pokemon-cards-css by Simon Goellner (GPL-3.0).
 * Version:     {{VERSION}}
 * Requires at least: 6.7
 * Requires PHP: 8.1
 * Author:      Shohei
 * License:     GPL-3.0-or-later
 * Text Domain: holo-image-styles
 * Domain Path: /languages
{{UPDATE_URI}}
 */
defined( 'ABSPATH' ) || exit;

define( 'HOLO_IMAGE_STYLES_EDITION_{{EDITION_UPPER}}', true );
add_action( 'plugins_loaded', static function () {
  if ( defined( 'HOLO_IMAGE_STYLES_BOOTED' ) ) return;            // 先に起動した方が勝つ
  define( 'HOLO_IMAGE_STYLES_BOOTED', '{{EDITION}}' );
  define( 'HOLO_EDITION', '{{EDITION}}' );
  define( 'HOLO_IMAGE_STYLES_VERSION', '{{VERSION}}' );
  define( 'HOLO_IMAGE_STYLES_FILE', __FILE__ );
  require __DIR__ . '/inc/class-plugin.php';
  \HoloImageStyles\Plugin::instance();
}, {{PRIORITY}} );
{{ACTIVATION}}
```

| プレースホルダ | free | all |
|---|---|---|
| NAME | Holo Image Styles | Holo Image Styles (All Effects) |
| UPDATE_URI | （空行） | ` * Update URI: https://{host}/holo-image-styles/update.json` |
| PRIORITY | 10 | 5 |
| ACTIVATION | （空） | §7.2 のコード |

`Text Domain` は両方 `holo-image-styles`。無料版は wp.org の翻訳を受け取り、All 版は `languages/` の `.l10n.php` を同梱して `load_plugin_textdomain` する（無料版でも呼んで良い。wp.org 側が優先される）。

**main ファイルでは関数を定義しない**（両方読み込まれても再宣言エラーが出ないように）。すべて `inc/` の namespace `HoloImageStyles` 内。

### 7.2 All 版の有効化 → 無料版を停止

```php
register_activation_hook( __FILE__, static function ( $network_wide ) {
  require_once ABSPATH . 'wp-admin/includes/plugin.php';
  $free = 'holo-image-styles/holo-image-styles.php';
  if ( ! file_exists( WP_PLUGIN_DIR . '/' . $free ) ) return;
  if ( is_plugin_active_for_network( $free ) ) {
    deactivate_plugins( $free, true, true );
  } elseif ( is_plugin_active( $free ) ) {
    deactivate_plugins( $free, true, false );
  }
  set_site_transient( 'holo_offer_delete_free', 1, DAY_IN_SECONDS );
} );
```

### 7.3 「無料版を削除」ボタン `class-edition.php`

- `admin_notices`（マルチサイトは `network_admin_notices`）で、`HOLO_EDITION === 'all'` かつ transient あり かつ無料版のファイルが存在 かつ `current_user_can( 'delete_plugins' )` のとき表示。
- `WP_Filesystem` の method が `direct` でない場合は **ボタンを出さず**「プラグイン一覧から Holo Image Styles（無料版）を削除してください」と 1 行。
- ボタンは `admin-post.php?action=holo_delete_free` への POST フォーム、`wp_nonce_field( 'holo_delete_free' )`。
- ハンドラ: `check_admin_referer`、権限確認、`is_plugin_active( $free )` なら先に `deactivate_plugins`、`delete_plugins( [ $free ] )`。`WP_Error` なら notice で表示して transient は残す。成功なら transient 削除、`wp_safe_redirect( wp_get_referer() )`。
- 「今回は削除しない」リンク → transient 削除。

### 7.4 無料版に戻したとき

- `data-holo-variant` が無料版の台帳に無い → §4.4 のフォールバックで family default になる。エディタのセレクトも「（All Effects の効果）→ 既定に戻しました」と 1 回だけ notice。
- 設定 option `holo_image_styles` は共通。All 版の uninstall では **削除しない**（無料版に戻す可能性）。無料版の uninstall.php で削除。

---

## 8. All 版の更新配信

- `Update URI: https://{host}/holo-image-styles/update.json`（wp.org の更新チェックから除外する **唯一の** 手段。フォルダ名を変えるだけでは wp.org が同名スラッグと誤認して上書きする）。
- `add_filter( 'update_plugins_{host}', … )` で `update.json` を取得（`wp_remote_get`、12 時間 transient キャッシュ、失敗時は `false` を返す＝更新なし）。
- `update.json` は **公開**の静的ファイル（`package` は署名付き URL ではなく §14.5 の更新エンドポイント）。プラグイン側にキーを持たせない方針は維持する。
- `update.json`:
  ```json
  { "id": "holo-image-styles-all/holo-image-styles-all.php", "version": "1.2.0", "url": "https://…/changelog", "package": "https://pro.jadeclinic.jp/wp-json/jadepro/v1/download/holo-image-styles-all", "requires": "6.7", "requires_php": "8.1", "tested": "7.1" }
  ```
  pro.jadeclinic.jp の静的パス（または gh-pages）に置き、`release.yml` が書き換える。`package` の中身は §14.5。
- `plugins_api` フィルタで「詳細を表示」も最低限返す（任意）。

---

## 9. ビルドと CI

### 9.1 ローカル

```
npm run build          # wp-scripts build (view + editor)
node bin/build.mjs free
node bin/build.mjs all
node bin/check-variants.mjs
composer phpstan       # level 6
composer phpcs         # WordPress-Extra + PHPCompatibilityWP 8.1-
```

`build.mjs` の責務: dist を空にする → 台帳を tier で絞る → `variants.php` 生成 → family CSS を目印で切り出し minify → テクスチャをホワイトリストでコピー → `plugin.php.tpl` 置換 → `inc/`, `build/`, `languages/`, `readme.txt` コピー → zip 作成 → **生成物の検証**（All 版に無いはずのファイルが無料版に無いこと、参照テクスチャが実在すること、`Update URI` が無料版に無いこと）。検証に失敗したら exit 1。

### 9.2 release.yml

タグ `v*` で: build 両方 → `10up/action-wordpress-plugin-deploy@stable`（`BUILD_DIR: dist/holo-image-styles`、`ASSETS_DIR: .wordpress-org`）→ `holo-image-styles-all.zip` を **Supabase Storage `member-downloads`（private）** の `holo-image-styles-all/v{version}/` にアップロード（BCP Builder の release workflow と同じ step を流用。Secrets は既存のものを共用）→ `releases` テーブルに行を追加 → `update.json` を更新（§8, §14.5）。GitHub Release への zip 添付は **しない**（ダウンロード先をアカウントページに一本化）。

### 9.3 e2e（wp-env, Playwright）

最低限 5 本:

1. 画像ブロックに `is-style-holo-cosmos` を付けて公開 → フロントに `.holo__card[data-holo-variant="cosmos"]` と 2 つの span がある。
2. ライトボックス有効の画像でも 1 が成立し、`.lightbox-trigger` がクリックできる。
3. キャプション付き・リンク付き・align left の 3 パターンで `figcaption` が `.holo__card` の**外**にある。
4. `prefers-reduced-motion: reduce` をエミュレートし、pointermove しても `--rotate-x` が `0deg` のまま。
5. All 版を有効化 → 無料版が inactive になり、notice にボタンがある。ボタン POST 後に無料版フォルダが無い。

---

## 10. Abilities API（任意・7.1）

`holo-image-styles/list-variants`（このエディションの台帳を返す）と `holo-image-styles/apply`（`post_id`, `block_index`, `family`, `variant` を受けてブロックの className と holo 属性を書き換え保存）。`public: false`、`edit_posts` 必須。MCP アダプタから「この画像に Cosmos を当てて」ができる。実装は v1.1 以降で良い。

---

## 11. wp.org 提出

- `readme.txt`: Stable tag、`Tested up to: 7.1`、原作者クレジット（Simon Goellner / pokemon-cards-css / GPL-3.0）、「エディタ内は簡易プレビュー」の明記、All Effects への言及は 1 段落、外部通信なしの明記。
- ビルド元ソースへのリンク（GitHub）を readme に。2024 年以降、minify 済み JS の同梱にはソース公開が必要。
- `.wordpress-org/` に screenshot-1〜4（スタイルパネル / ホロ効果パネル / フロント / reduced-motion の説明）と banner。
- **Plugin Check（PCP）プラグインを通す**（wp.org 審査と同じチェック）。`esc_*` 漏れ、`wp_enqueue` 以外の直書き script、`ABSPATH` ガードを潰す。
- 名前・スラッグ・説明の冒頭に Pokemon を含めない。本文中の「inspired by pokemon-cards-css」は可。

---

## 12. エラーと対策の一覧（実装時に必ず対応）

| # | 事故 | 対策（該当 §） |
|---|---|---|
| 1 | wp.org の自動更新が All 版を無料版で上書き | `Update URI` ヘッダー（§8） |
| 2 | 両版が同時有効で fatal | main に関数を置かない・namespace・`plugins_loaded` ガード（§7.1） |
| 3 | 読み込み中のプラグインを削除 | 先に deactivate、削除は admin-post の別リクエスト。`direct` 以外はボタン非表示（§7.3） |
| 4 | 無料版に戻して画像が壊れる | 未知 variant → family default（§4.4）。default は必ず tier free（§2.1） |
| 5 | ライトボックスと directive 衝突 | `data-wp-interactive` は `.holo__card` に。`lightbox-trigger` に `pointer-events:auto`（§3.1, §4.3） |
| 6 | align left/right/center で figure を見つけられない | 外側 div ではなく `has_class` で figure を探す（§4.3） |
| 7 | 画像未設定ブロック | `<img` が無ければ素通し（§4.2） |
| 8 | figcaption が回転する | ラッパーの終端を `<figcaption` の直前に（§4.3） |
| 9 | ブロックが「無効なコンテンツ」になる | save マークアップに触らない。属性 default はサーバーと JS で同値（§6.1） |
| 10 | エディタで効果が出ない／JS エラー | エディタは CSS 2 層の簡易版と割り切る。`enqueue_block_assets` で iframe 内へ（§6.3） |
| 11 | キャッシュで古い CSS | ハンドル version に edition を含める。有効化時に `wp_cache_flush()`（§4.5） |
| 12 | テクスチャ URL がフォルダ名に依存 | CSS に URL を書かず、サーバーが `--tex-n` を出す（§3.2, §4.4） |
| 13 | 無料版に All のファイルが混入 | ホワイトリストコピー＋ビルド後検証（§9.1） |
| 14 | 大量の画像で重い | IO で arm/disarm、interacting は pointer 下の 1 枚のみ、JS ループなし（§3.1, §5） |
| 15 | reduced-motion で動く | CSS の media query で強制（JS 不要）＋ JS 側でも early return（§3.1, §5） |
| 16 | タッチ端末でスクロールが止まる | `touch-action: pan-y`、pointermove は `touch=tap` かつ pointerdown 起点のみ（§3.1, §5） |
| 17 | `@property` 非対応ブラウザ | transition が効かないだけで動作する。対応外は許容 |
| 18 | クラシックテーマで CSS が全ページに載る | 許容（最大 ≈20KB）。readme に明記 |
| 19 | wp.org 審査で宣伝過多 | 無料版の露出は help 1 行＋設定画面 1 行（§6.2） |
| 20 | 商標で却下 | 名称に Pokemon を使わない（§11） |
| 21 | 翻訳が当たらない | Text Domain を両版で `holo-image-styles` に統一（§7.1） |
| 22 | update.json 取得失敗で更新画面がエラー | 失敗時は `false`、12h キャッシュ（§8） |
| 23 | マルチサイトで無料版が止まらない | `is_plugin_active_for_network` を先に判定（§7.2） |
| 24 | 未購入者が zip URL を共有 | Storage は private。ダウンロードは短命の署名付き URL（60 秒）を都度発行（§14.4） |
| 25 | 自動更新時にログイン情報が無い | 更新の `package` はサイト単位で無認証 GET できる **更新用エンドポイント**（§14.5）。ダウンロードページとは分ける |
| 26 | Stripe Webhook 取りこぼしで購入が反映されない | `checkout.session.completed` を冪等に処理し、`purchases` に `stripe_session_id` UNIQUE。アカウントページに「購入を再同期」ボタン（§14.3） |
| 27 | JADE Pro 解約後も All 版が動く | 問題なし。買い切り相当として扱い、更新だけ止まる（§14.2） |

---

## 13. マイルストーン

| | 内容 | 完了条件 |
|---|---|---|
| M1 | 台帳・ビルド・CI の骨格。free/all の 2 zip が出る（中身は Glare のみ） | `check-variants` と生成物検証が CI で緑 |
| M2 | base.css・注入・view モジュール・reduced-motion・IO。Holo と Glare | e2e 1〜4 が緑 |
| M3 | 残り 5 ファミリー（free 分）・エディタパネル・簡易プレビュー | 7 ファミリーが one-est で動く |
| M4 | 乗り換え・削除ボタン・update.json・アカウントページ配布（§14） | e2e 5 が緑。jadepro.local で購入→ダウンロード→更新が通る |
| M5 | 残り 16 バリアント移植・テクスチャ最適化 | All 版 zip ≈0.9MB 以下 |
| M6 | readme・スクリーンショット・PCP・wp.org 申請 | 申請完了 |

---

## 14. 配布 — JADE Pro アカウントページ

All Effects 版は **pro.jadeclinic.jp のアカウントページ**からダウンロードする。BCP Builder の配布（GitHub タグ → Actions → Supabase Storage `member-downloads` → ライセンス連動の更新 API）と同じ仕組みに乗せ、新しい配布経路は作らない。

### 14.1 商品と権利（entitlement）

| 状態 | All Effects のダウンロード |
|---|---|
| JADE Pro 購読者（Clinic / Clinic Plus） | **無料で含める**（購読特典）。プラン表に 1 行足す |
| 単体購入者（$5 / ¥800 一回払い） | 可。買い切り。サイト数無制限 |
| 無料アカウント（未購入） | 不可。ダウンロードカードに購入ボタンを表示 |

権利は Supabase の `entitlements` ビューで判定する（既存の `subscriptions` に `purchases` を足して UNION）。

```sql
create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null,                       -- 'holo-image-styles-all'
  stripe_session_id text unique not null,      -- 冪等キー
  stripe_payment_intent text,
  amount int, currency text,
  created_at timestamptz default now()
);
alter table purchases enable row level security;
create policy "own purchases" on purchases for select using (auth.uid() = user_id);

create view entitlements as
  select user_id, 'holo-image-styles-all' as product from purchases
  union
  select user_id, 'holo-image-styles-all' from subscriptions where status in ('active','trialing','past_due');
```

### 14.2 購入フロー（Stripe Checkout・一回払い）

1. アカウントページのダウンロードカードの「$5 で購入」→ Edge Function `create-checkout` に `product=holo-image-styles-all` を POST（Supabase Auth の JWT 必須）。
2. Edge Function が Stripe Checkout Session（`mode: 'payment'`、Price は Stripe ダッシュボードで作成、`client_reference_id = user_id`、`metadata.product`）を作り URL を返す。未ログインなら先にサインアップ（既存のサインインページ）。
3. 決済後 `success_url` = アカウントページ `#downloads?purchased=1`。
4. Webhook `checkout.session.completed` → 既存の Webhook Edge Function に分岐を追加: `mode === 'payment'` かつ `metadata.product` があれば `purchases` に **upsert（`stripe_session_id` で冪等）**。
5. 領収書は Stripe の自動送信を有効化。特商法表記・返金ポリシーは JADE Pro のものに追記（「デジタル商品につき返金不可」）。

JADE Pro 購読者は購入ボタンが出ず、最初からダウンロード可能。購読を解約しても、ダウンロード済みの zip はそのまま使える（GPL、キーなし）。更新は権利が無くなった時点で止まる。

### 14.3 アカウントページの UI（`jadepro-account` プラグイン側）

- 「ダウンロード」セクションに BCP Builder と並べてカードを 1 枚追加: 製品名、最新バージョン、リリース日、ファイルサイズ、「ダウンロード」ボタン（権利あり）／「$5 で購入」（権利なし）／「購入を再同期」（`purchased=1` で戻ってきたのに権利が無いとき。Edge Function `sync-purchases` が Stripe の Session を検索して補完）。
- 変更履歴へのリンク（docs 配下）。
- カードは WordPress 標準ブロック（Group / Columns / Buttons）で組み、動的部分だけ `supabase-js` で差し替える（既存の BCP Builder カードと同じ作り）。ハードコード幅は使わない。

### 14.4 ダウンロード（署名付き URL）

- Storage: `member-downloads/holo-image-styles-all/v{version}/holo-image-styles-all.zip`（private）。`releases` テーブル: `product, version, path, size, released_at, changelog_url`。
- 「ダウンロード」クリック → Edge Function `get-download`（既存があれば製品パラメータを足す）: JWT 検証 → `entitlements` に行があるか → `storage.createSignedUrl(path, 60)` → 302。
- 60 秒の署名付き URL なので共有されても意味を持たない。ダウンロード回数は `download_logs` に記録（任意）。

### 14.5 プラグインの自動更新との整合

自動更新時、WordPress は **ログイン情報を持たずに** `package` を GET する。アカウントページと同じ認証は使えないので、更新専用の無認証エンドポイントを用意する。

- `update.json`（公開）の `package` = `https://pro.jadeclinic.jp/wp-json/jadepro/v1/download/holo-image-styles-all`。
- このエンドポイントは `permission_callback => '__return_true'` だが、**最新版の zip を返すだけ**（ライセンスキー無し）。Supabase Storage の署名付き URL（60 秒）を都度生成して 302。
- これは「zip が公開されている」のと実質同じ。$5 モデルでは意図通り（GPL・honor system）。**BCP Builder とは違い、ライセンス連動の更新 API は使わない**（キーを持たない設計のため）。もし将来「更新は購入者のみ」に絞りたくなったら、`Update URI` はそのままに、update.json の返却を無効化して「アカウントページから最新版を取得してください」の notice に切り替える（プラグイン側の変更不要）。
- 更新チェック自体は §8 の `update_plugins_{host}` フィルタ。`update.json` は release.yml が書き換える。

### 14.6 release.yml の追加 step（BCP Builder のものを流用）

```yaml
- name: Upload All Effects to Supabase Storage
  run: |
    curl -X POST "$SUPABASE_URL/storage/v1/object/member-downloads/holo-image-styles-all/v${VERSION}/holo-image-styles-all.zip" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/zip" \
      --data-binary @dist/holo-image-styles-all.zip
- name: Register release row
  run: |
    curl -X POST "$SUPABASE_URL/rest/v1/releases" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
      -d "{\"product\":\"holo-image-styles-all\",\"version\":\"${VERSION}\",\"path\":\"holo-image-styles-all/v${VERSION}/holo-image-styles-all.zip\",\"size\":$(stat -c%s dist/holo-image-styles-all.zip)}"
- name: Publish update.json
  run: node bin/write-update-json.mjs "$VERSION"   # pro.jadeclinic.jp の静的パスへ（既存の deploy 手順に合わせる）
```

`releases.(product, version)` に UNIQUE 制約を付け、再実行しても行が重複しないようにする。

### 14.7 このセクションのエラー対策

| 事故 | 対策 |
|---|---|
| Webhook 失敗で購入が反映されない | `stripe_session_id` UNIQUE で冪等 upsert。Stripe の再送に耐える。「購入を再同期」ボタン |
| 同じユーザーが二重購入 | Checkout 作成前に `entitlements` を確認し、既に権利があれば Checkout を作らずダウンロードへ |
| 署名付き URL の共有 | 60 秒有効。ログに残す |
| 自動更新が 401 で失敗 | 更新用エンドポイントは無認証（§14.5）。アカウント用と混同しない |
| Storage のパスと `releases.path` の不一致 | release.yml が同じ変数から両方を作る。`get-download` は `releases` の path を使い、直書きしない |
| RLS 漏れ | `purchases` / `releases` に RLS。`releases` は `select` を全員に許可（バージョン表示用）、`path` 列は **ビューで隠す** |
| JADE Pro 解約直後にダウンロード不可で問い合わせ | 解約後 30 日は `entitlements` に残す（`subscriptions.current_period_end + 30d`） |

---

## 付録 A. 原作 → プラグインの CSS 置換ルール

| 原作 | プラグイン |
|---|---|
| `.card[data-rarity="rare holo"]` | `.is-style-holo-holo .holo__card[data-holo-variant="rare-holo"]` |
| `.card__shine` / `.card__glare` | `.holo__shine` / `.holo__glare` |
| `.card__rotator` の transform | `.holo__card` の transform |
| `[data-subtypes^="stage"]` 等の分岐 | 削除 |
| `clip-path: var(--clip)` | `clip-path: var(--holo-clip)`（`[data-holo-window="1"]` のときのみ値あり） |
| `url("/img/x.png")` | `var(--tex-n)`（サーバーが出す） |
| `.card:not(.masked)` | 削除（v1 はマスク非対応） |
| `.card.water { --card-glow }` 等 | family の `glow` を `--holo-glow` で出す |
| `--card-opacity` | `calc(var(--card-opacity) * var(--holo-intensity))` |

---

## 付録 B. 実装時の仕様差分（2026-09-10 実装コミット時点）

| 項目 | 仕様書 | 実装 | 理由 |
|---|---|---|---|
| `data-wp-interactive` の値 | `.holo__card` に `holo-image-styles` | figure に名前空間（ライトボックスの `core/image`）があればそれを引き継ぎ、自前ディレクティブは `holo-image-styles::` 明示 | ネストした `data-wp-interactive` は子孫の既定名前空間を変えるため、ライトボックスの `actions.showLightbox` が解決できなくなる（実機で確認） |
| `perspective` | figure に `perspective: 600px` | card の transform に `perspective(600px)` | figure がスタッキングコンテキストになると後続ブロックが alignleft/right の画像を覆い、リンクが押せなくなる |
| `.holo__card > *` の `pointer-events:none` | 全子要素 | shine / glare の span のみ | img / a / lightbox ボタンがクリックできる必要がある |
| `variants.json` の `textures` | 一部 `[]` | 原作が `--glitter` を使うバリアントに `glitter.webp` 等を追加 | 絵柄を保つため。キー名・tier は不変 |
| e2e | wp-env + Playwright 5 本 | `tests/e2e/*.mjs`（実 WordPress 7.1 に対して実行、CI では wp-env） | 同等の 5 ケース＋23 バリアントの描画確認 |
| エディタ figure | — | `width: fit-content` | 全幅のブロックラッパーにプレビュー層がはみ出すため |
| §14（アカウントページ配布） | jadepro 側 | 本リポジトリ外（release.yml に step のみ） | jadepro-account プラグイン / Supabase 側の作業 |

## 付録 C. v1.2（2026-09-10）の変更

| 項目 | 内容 |
|---|---|
| ホロ効果パネル | 全バリアントをファミリー見出し付きの静止画サムネで一覧表示。1 枚選ぶと `className`（`is-style-holo-{family}`）と `holo.variant` を同時に設定。すべての画像ブロックに表示（ホロ未適用でも選べる）。「効果を外す」で解除 |
| ツールバー | 「ホロ効果」ボタン → ブロックサイドバー（設定タブ）の「ホロ効果」パネルを開いて選択中サムネにフォーカス（WordPress 標準の場所。ポップオーバーは廃止）。← → で選択、⇧⌘⌫ で外す |
| ショートカット | **⌘H**（`primary` + h、Rough Notation と同じ）。keydown を preventDefault して macOS の「隠す」より先に受け取る。エイリアスとして ⇧⌥⌘H も登録。⇧⌘H は WP 7.x コアの「ブロックの表示/非表示」、⌥⌘H は macOS の「ほかを隠す」と衝突するため使わない |
| 角丸 | フロント/エディタとも JS が画像（無ければ figure）の computed `border-radius` を読み `--holo-radius` に写す。テーマ CSS の角丸でも黒い角が出ない |
| 影 | 属性 `holo.glow`: `soft`（既定・中立な落ち影）/ `none` / `color`（原作のファミリー色グロー）。`data-holo-glow` で出力 |
| サムネ | `bin/thumbs.mjs` が実 CSS を Playwright で描画して生成。cosmos は bottom を不透明 PNG 由来（原作どおり）にし、middle/top は alpha を保持した WebP に修正 |

## 付録 D. v1.2.3（2026-09-10）の変更

| 項目 | 内容 |
|---|---|
| 透明画像 | `<img src>` が png/webp/gif/avif/svg のとき `--holo-mask:url(src)` を出し、shine/glare を画像自身でマスク。角丸のスキャン画像や切り抜きでも透明部分に光が乗らない（黒い角の根本対策） |
| クリック | 属性 `holo.click`: `none`（既定）/ `lift`。lift はクリックで `--card-scale:1.12` に浮き上がり光沢を点灯、再クリック・外側クリック・Esc で戻る。タッチ端末では「タップで点灯」の代わりになる。reduced-motion では拡大しない |
| UI | ツールバーはアイコンのみ。サムネは見出しなしで台帳順の 1 グリッド。「カードの窓」はパネルから非表示（属性は維持） |

## 付録 E. §14 の実装差分 — 実物の BCP Builder 配布に合わせた点（2026-09-10）

BCP Builder の実装（`bcp-builder/.github/workflows/release.yml`、`beauty-clinic-patterns/supabase/functions/download-url`、`jadepro-account.php` の `downloads` 配列）を確認した結果、§14.1〜14.6 の想定と異なる箇所を次のように実装した。**§14 の本文より本付録が優先**。

| §14 の想定 | 実装 |
|---|---|
| `subscriptions` / `entitlements` ビュー / `releases` テーブル | 存在しない。権利は既存の **`licenses`**（email, tier, is_active, expires_at）で判定。`releases` テーブルは作らない |
| `member-downloads/holo-image-styles-all/v{version}/…` | BCP Builder と同じ **`holo-image-styles-all/holo-image-styles-all.zip`（最新・upsert）＋ `holo-image-styles-all-{v}.zip`（版付き）＋ `plugin.json`** |
| Edge Function `get-download` | 既存の **`download-url`** の `FILES` に `holo-image-styles-all`（bucket `member-downloads`, `minTier: starter`）を 1 行追加 |
| `update.json` を pro.jadeclinic.jp の静的パスへ配置、`package` = WP REST `jadepro/v1/download` | **Edge Function `holo-update`**（GET・無認証）が Storage の `plugin.json` を返し、`package` = **Edge Function `holo-download`**（GET・無認証 → 署名付き URL 60 秒へ 302）。`Update URI` は `https://<project>.supabase.co/functions/v1/holo-update`。pro.jadeclinic.jp 側にファイルもコードも置かない |
| $5 単体購入（`purchases`、Checkout、Webhook 分岐） | **フェーズ 2 として保留**。フェーズ 1 は JADE Pro 購読者（Clinic 以上）に含める形。無料アカウントには「Clinic 以上」と表示される（既存 UI の挙動） |
| アカウントページのカードを新規ブロックで組む | `jadepro-account.php` の `downloads` 配列に 1 項目追加するだけ（既存カード UI がそのまま並ぶ） |

自動更新は §14.5 のとおり honor system（無認証）。「更新は購読者のみ」に絞る場合は `holo-update` にライセンスキー判定（`builder-update` と同じ）を足せばよく、プラグイン側の変更は不要。

Edge Function は `verify_jwt=false` でデプロイする: `supabase functions deploy holo-update holo-download --no-verify-jwt`（`download-url` は従来どおり verify_jwt=true）。

## 付録 F. 自動ショーケースの個別設定（v1.1.0、2026-09-11）

`holo.showcase` は `false` | `true`（既定値）| オブジェクトの 3 形。保存済みの `true` はそのまま既定値で動く。

| キー | 値 | 既定 | 意味 |
|---|---|---|---|
| `delay` | 0–3（秒） | 0.25 | 画面に入ってから始まるまで |
| `duration` | 1–5（秒） | 2 | 動く長さ |
| `path` | `orbit` / `sweep` / `diagonal` | `orbit` | 一周（原作）/ 左→右に一回なでる / 斜めに一往復 |
| `stagger` | `together` / `sequence` | `sequence` | 同時に画面に入ったカード（ギャラリーの行）を DOM 順に 250 ms ずつずらす |
| `enter` | bool | false | 表示時にフェード＋浮き上がり（`[data-holo-enter="1"]` を CSS が初回ペイントから隠し、armed で `.is-holo-revealed`。JS が来なくても 4 秒後に CSS animation で自動表示。reduced-motion では無効） |

- サーバー: `Render::sanitize_showcase()` が clamp／whitelist し、`data-holo-showcase="1" data-holo-sc-*` と `data-holo-enter` を出す（`Render::SHOWCASE_DEFAULTS` と JS の `SHOWCASE_DEFAULTS` を一致させる）。
- フロント: `view/index.js` の `PATHS`（進行度 0–1 → ポインタ位置）を `performance.now()` ベースで 20 ms ごとに流す。順番点灯は IntersectionObserver の同一コールバック内で交差した要素を `compareDocumentPosition` で並べて index × 250 ms を足す。
- エディタ: 「自動ショーケース」ON で下にプリセット（標準／ゆっくり／ギャラリー。4 つ目の「カスタム」が出ると ToggleGroup では日本語ラベルが折り返すのでセレクトにしてある）＋ 開始までの間／長さ／軌道／複数枚が同時に出るとき／フェードイン。既定は標準（0.25 秒後に 2 秒、一周、順番）。
- 翻訳は `npm run i18n`（`bin/i18n.sh`。JSON は `md5("build/editor.js")` 名で出す）。


## 付録 G. フェーズ 2 — All Effects の単体購入（$5 買い切り、2026-09-11）

付録 E で「フェーズ 2 として保留」とした単体購入を実装した。**購読（Clinic 以上）に含まれる**という
フェーズ 1 の形はそのままで、購読していない人が **買い切りでも同じ zip を買える**ようにする。
BCP Builder 側の Supabase（`jhbzbqsondftxlcsevpn`）に手を入れており、Holo 側のプラグインコードは変更なし。

### G.1 データ

`public.purchases`（新規）。買い切り商品の台帳で、`licenses` とは別。

| 列 | 用途 |
|---|---|
| `email` / `product` | 権利判定のキー。`product` は `download-url` の `FILES` キー（= `holo-image-styles-all`）と一致させる |
| `stripe_session_id` | UNIQUE。Webhook の二重実行で行が増えないようにする |
| `stripe_payment_intent_id` | 返金（`charge.refunded`）で引くためのキー |
| `amount_total` / `currency` | 記録用 |
| `is_active` | 返金・チャージバックで `false`。権利判定は `is_active` のみを見る |

RLS 有効。`select` は本人（`auth.jwt() ->> 'email'`）のみ、書き込みは service role だけ。
部分インデックス `purchases_email_product_idx on (lower(email), product) where is_active`。

### G.2 Edge Functions

| 関数 | 変更 |
|---|---|
| `_shared/products.ts`（新規） | 買い切り商品の一覧。`holo-image-styles-all` → `STRIPE_PRICE_HOLO_ALL`。Price ID が空なら「価格が未登録」として 409 |
| `_shared/entitlement.ts`（新規） | `hasPurchased(supabase, email, product)` |
| `create-checkout` | `{ product: "holo-image-styles-all" }` で **`mode: "payment"`** の Checkout を作る。`metadata.product` と `payment_intent_data.metadata.product` を付ける。成功時は `/account/?purchased=<slug>` に戻す。`{ plan }` の購読フローは従来どおり |
| `stripe-webhook` | `checkout.session.completed` で price_id（または `metadata.product`）が `PRODUCTS` に当たれば、**ライセンスキーを発行せず** `purchases` に INSERT → Auth ユーザー作成 → `renderPurchaseEmail()` のメール送信。`charge.refunded` を新たに処理し、`payment_intent` 一致の購入を `is_active = false` にする |
| `download-url` | `FILES` に `buyable: true` を追加。プランが足りないときだけ `hasPurchased()` を見て、あれば署名 URL を出す。403 のレスポンスに `buyable` を含めるので、アカウントページが「単体購入」ボタンを出せる |
| `holo-update` / `holo-download` | 変更なし。自動更新は付録 E のとおり honor system なので、単体購入者にもそのまま更新が届く |

### G.3 運営側で必要な操作

1. Stripe で **一回払いの Price**（$5 / Holo Image Styles — All Effects）を作る。
2. Supabase の Edge Function Secrets に `STRIPE_PRICE_HOLO_ALL=price_...` を登録する。
3. Stripe の Webhook の送信イベントに **`charge.refunded`** を足す（`checkout.session.completed` は登録済み）。

2 が未設定の間は `create-checkout` が 409「価格がまだ登録されていません」を返すだけで、
既存の購読フローには影響しない。

### G.4 アカウントページ

`jadepro-account.php` の `downloads` 配列の `holo-image-styles-all` に `'buyable' => true` を足し、
`download-url` が `403 + buyable:true` を返したときにボタンを「$5 で単体購入」に差し替えて
`create-checkout`（`{ product: 'holo-image-styles-all', email: <ログイン中のメール> }`）を叩く。
戻ってきた `url` に `location.href` で飛ばす。
