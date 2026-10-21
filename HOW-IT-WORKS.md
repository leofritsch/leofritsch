# Profile generator

Edit `profile.json`, push. The GitHub Action renders every SVG (light + dark) to the `output` branch and rewrites `README.md`. It also re-runs daily at 06:17 UTC so the Incident Register count stays live.

- Add a project to the pill rows: add an entry to `more`.
- Swap a featured tile: edit `featured` (keep 3; `kind` picks the animation: `freetabs`, `register`, `daybar`; a new kind needs a new `vis…` function in `render.mjs`).
- Local preview: `npm install && npm run render`, then open the files in `out/`.

Never edit README.md by hand — it is overwritten on every render.
