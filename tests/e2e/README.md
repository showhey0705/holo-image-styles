# e2e

Playwright smoke tests run against a real WordPress (verified on 7.1 with the SQLite drop-in).

```
bash tests/e2e/setup.sh /path/to/card.jpg     # inside the WP install (WP-CLI)
WP_BASE=http://127.0.0.1:8089 node tests/e2e/smoke.mjs    # front (pointer, reduced-motion, lightbox, link, caption) + editor panel
WP_BASE=... node tests/e2e/gallery.mjs                    # hover-captures all 23 variants (All edition)
WP_BASE=... WP_PLUGINS_DIR=... node tests/e2e/edition.mjs # All edition active → notice → "Delete the free edition"
```

`smoke.mjs` uses post slug `holo-test` (?p= is resolved by `setup.sh` order: post 5 in a fresh install) and expects the
free edition; `gallery.mjs` expects the All edition. Set `CHROMIUM_PATH` when Playwright's own browser is not installed.
