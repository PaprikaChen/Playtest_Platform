# 0003: Sandboxed iframe now, isolated origin later

- **Status:** accepted for alpha (2026-11-04)
- **Context:** The spec says builds should be served from an isolated origin. Uploaded games are untrusted JavaScript.
- **Decision:** For the alpha, serve builds from `/g/<invite token>/…` on the app origin, and embed them in an iframe with
  `sandbox="allow-scripts allow-pointer-lock"` and **no** `allow-same-origin`. The game then runs in an opaque origin and
  can't read platform cookies or call APIs. Files get `Access-Control-Allow-Origin: *` so the game can still fetch its own assets.
- **Consequences:** games that rely on `localStorage` or IndexedDB may break inside the opaque origin. A malicious build can
  still be opened directly at its `/g/` URL on the app origin, so this is a stopgap. A separate domain is tracked as #20.
