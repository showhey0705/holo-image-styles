=== Holo Image Styles ===
Contributors: showhey0705
Tags: image, block styles, holographic, effects, animation
Requires at least: 6.7
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Holographic trading-card effects for the core Image block — seven block styles that tilt and shine as the pointer moves.

== Description ==

Holo Image Styles adds seven block styles to the core Image block: **Holo, Cosmos, Rainbow, Foil, Metallic, Reverse and Glare**. Pick one in the Styles panel and the image tilts in 3D and shows a holographic shine that follows the pointer, exactly like a foil trading card.

The effects are a port of the wonderful open-source project *pokemon-cards-css* by Simon Goellner (GPL-3.0). This plugin is not affiliated with any trading-card company; it only provides the CSS effects, you bring your own images.

**How it works**

* Nothing is written into your content. The block keeps the normal core Image markup; the extra layers are added when the page renders, so deactivating the plugin leaves clean images behind.
* Zero JavaScript animation loops. The tilt and the spring-back are pure CSS transitions on typed custom properties (`@property` + `linear()` easing); the tiny front-end script only writes the pointer position, once per frame, through the WordPress Interactivity API.
* Lazy: shine layers are not painted until the image scrolls near the viewport (IntersectionObserver), and only the image under the pointer is ever animated.
* Respects `prefers-reduced-motion`: no tilt, no transitions, no auto-play — just a fixed, gentle sheen.
* Touch devices: choose between a short "tap to shine" flash, a static glare, or off — scrolling is never blocked.
* Options per image in the **Holo effect** panel: pick the effect from thumbnails (hover to preview on the canvas), strength presets, shadow, click-to-lift, touch behaviour, auto showcase. Toolbar button or ⌘H opens the panel.
* Rounded corners and transparent PNG/WebP cut-outs are respected: the shine never paints outside the image.
* No external requests, no tracking, no accounts.

**Editor preview**

Inside the block editor you see a simplified two-layer preview (a fixed shine and glare). The full five-layer effect with pointer tracking is rendered on the front end.

**All Effects edition**

This free plugin ships the default effect of each family (7 effects). An "All Effects" edition with all 23 effects from the original project is available separately from the author's site; it is a drop-in replacement (activate it and remove the free plugin). Content created with either edition keeps working with the other.

**Notes**

* Classic themes that do not load block assets separately will get the small base stylesheet (~7 KB) on every page.
* Older browsers without `@property` support still show the effect; only the spring-back transition is skipped.
* Source code (unminified JS/CSS, build scripts): https://github.com/showhey0705/holo-image-styles

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/` or install it from the Plugins screen.
2. Activate it.
3. Select an Image block, open **Styles** in the block sidebar and pick one of the Holo styles.
4. Fine-tune it in the **Holo effect** panel under **Settings**.

== Frequently Asked Questions ==

= Does it change my saved content? =

No. The block markup stays the standard core Image markup. Effects are injected at render time only.

= Does it work with the core lightbox ("Enlarge on click")? =

Yes. The lightbox button and the click-to-enlarge behaviour keep working inside the effect.

= Does it work with captions, links and alignments? =

Yes. Captions stay outside the tilting card; linked images stay clickable; left/right/center/wide alignments are supported.

= What about accessibility and motion sensitivity? =

When the visitor's system asks for reduced motion the plugin disables all movement and shows only a static sheen. The decorative layers are `aria-hidden`.

== Screenshots ==

1. The seven styles in the Styles panel.
2. The "Holo effect" panel.
3. A Cosmos image on the front end while hovering.
4. Reduced-motion rendering (static sheen, no tilt).

== Changelog ==

= 1.0.0 =
* Initial release: 7 families (Holo, Cosmos, Rainbow, Foil, Metallic, Reverse, Glare), Interactivity API front end, reduced-motion support, thumbnail picker, click-to-lift, editor preview.

== Upgrade Notice ==

= 1.0.0 =
Initial release.

== Credits ==

Effects based on pokemon-cards-css by Simon Goellner — https://github.com/simeydotme/pokemon-cards-css — GPL-3.0.
