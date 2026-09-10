# Stowly

Desktop load-planning workbench: Electron shell + React/Ant Design/Three.js renderer + Python FastAPI backend that drives `packingsolver3d`. Chinese is the default UI language, English is the second; every user-visible string goes through `react-i18next` and exists in both `src/renderer/src/i18n/zh-CN.json` and `en-US.json` (a test enforces identical key sets).

## Layout

- `src/main/` Electron main process: `backend.ts` locates the interpreter and supervises `python -m stowly_backend` (READY line handshake, token); `index.ts` windows, IPC (`backend:info`, `dialog:saveText`, `dialog:openFiles`, `shell:openExternal`).
- `src/preload/` the only bridge to Node (`window.stowly`), typed in `index.d.ts`.
- `src/renderer/src/` `lib/` (project model, result helpers, backend client, palette), `store/` (zustand), `three/` (scene controller; `placementBoxes` is the pure, tested part), `components/`, `i18n/`, `App.tsx`.
- `backend/stowly_backend/` `models.py` (mirrors `lib/project.ts`; millimetres and kilograms everywhere), `solver.py` (project -> packingsolver3d instance, job manager), `importers.py`, `exporters.py`, `presets/` (JSON data + `SOURCES.md`), `app.py` (FastAPI, `X-Stowly-Token`), `__main__.py`.
- `scripts/prepare-python.mjs` downloads python-build-standalone and installs the backend for packaging; `electron-builder.yml` ships it as `resources/python`.

## Rules

- Units: the project stores millimetres and kilograms; the UI converts with `toMm` / `fromMm`. Never send display units to the backend.
- The renderer talks to the backend only through `BackendClient`; the backend only through `packingsolver3d`'s public API. No solver logic in TypeScript.
- Presets are data with provenance: every entry has `source`; add to `SOURCES.md` when adding a family. Mark values as typical; do not invent payloads.
- Keep the honest-status rule of packingsolver3d: show `status`, `value` and `bound`; never call a feasible packing optimal.
- Tests: `backend/tests` (pytest, coverage fail-under 85) and `src/**/*.test.ts(x)` (vitest + Testing Library, thresholds in `vitest.config.ts`). New importers, presets and store actions come with tests.
- Commit messages: `type(scope): imperative summary`, English; scopes `main`, `renderer`, `backend`, `presets`, `ci`, `docs`, `build`.
