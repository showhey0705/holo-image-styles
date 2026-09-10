# Holo Image Styles

Holographic trading-card effects for the WordPress core Image block, ported from
[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) by Simon Goellner (GPL-3.0).

One repository builds two plugins:

| Edition | Slug | Effects | Distribution |
|---|---|---|---|
| Free | `holo-image-styles` | 7 (the default of each family) | WordPress.org |
| All Effects | `holo-image-styles-all` | 23 | JADE Pro account page (`Update URI` → `update.json`) |

Full specification: `SPEC.md` (Japanese).

## Layout

```
src/variants.json          the ledger: families, variants, tier (free|all), textures
src/php/                   plugin classes (namespace HoloImageStyles) → dist/*/inc/
src/css/base.css           typed custom properties, .holo__card, arm gate, reduced-motion
src/css/families/*.css     one file per family; variant blocks between /* @variant x */ … /* @end */
src/css/editor.css         simplified two-layer editor preview
src/view/index.js          Interactivity API store (front end, ES module)
src/editor/index.js        holo attribute + "Holo effect" inspector panel
src/textures/              optimised textures (server injects them as --tex-1..3)
src/plugin.php.tpl         main plugin file template
bin/build.mjs              node bin/build.mjs free|all → dist/{slug}/ + zip + verification
bin/check-variants.mjs     ledger ↔ CSS ↔ textures consistency (CI)
tests/php/render-harness.php   injection tests on WP_HTML_Tag_Processor (no WP install needed)
tests/e2e/                 Playwright smoke tests against a real WordPress
```

## Build

```bash
npm install
npm run build:dist        # wp-scripts build + both editions → dist/holo-image-styles{,-all}(.zip)
npm run check-variants
npm run lint:js && npm run lint:css
composer install && composer phpstan && composer phpcs
WP_CORE=/path/to/wordpress php tests/php/render-harness.php
```

Runtime DOM produced by the server (saved block markup is never changed):

```html
<figure class="wp-block-image is-style-holo-cosmos">
  <div class="holo__card" data-holo-variant="cosmos" style="--tex-1:url(…);…" data-wp-interactive="…">
    <img …>                                  <!-- or <a><img></a>, plus core's lightbox button -->
    <span class="holo__shine" aria-hidden="true"></span>
    <span class="holo__glare" aria-hidden="true"></span>
  </div>
  <figcaption>…</figcaption>                 <!-- stays outside the tilting card -->
</figure>
```

## Adding a variant

1. Add the key to `src/variants.json` (family, tier, label, textures).
2. Add a `/* @variant key */ … /* @end */` block to `src/css/families/{family}.css`
   using `.is-style-holo-{family} .holo__card[data-holo-variant="key"] .holo__shine` selectors and
   `var(--tex-n)` for textures (never `url()`).
3. `node bin/check-variants.mjs`.

Variant keys are written into content (`data-holo-variant`), so never rename them; unknown keys fall
back to the family default at render time.

## License

GPL-3.0-or-later. Original effects © Simon Goellner.
