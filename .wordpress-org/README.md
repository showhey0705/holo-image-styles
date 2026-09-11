Assets for the WordPress.org listing (deployed by release.yml).

- `banner-1544x500.png`, `banner-772x250.png`
- `icon-256x256.png`, `icon-128x128.png`
- `screenshot-1.png` … `screenshot-4.png` — front-end single card / front-end row of four /
  editor "Holo effect" panel / editor fine-tune controls. Captions live in `readme.txt`.

Regenerating the screenshots: run a site with the **free** edition active in `en_US`,
make a post with the demo cards, and shoot it at 1280x960 @2x with Playwright
(`tests/e2e/gallery.mjs` is a good starting point). Keep the order above — the front-end
shots come first because WordPress.org shows screenshot-1 at the top of the listing.

The banner and icon are rendered from HTML with Inter Display; see the repository history
for the source used, and keep the holographic card motif if they are ever redrawn.
