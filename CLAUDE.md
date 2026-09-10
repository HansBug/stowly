# CLAUDE.md

`AGENTS.md` and `CLAUDE.md` are the same file via symlink. Edit only one of them and avoid duplicate changes. This is the maintenance guide: what Stowly is, the decisions behind it, how the pieces fit, what must keep working on which platforms, and the checklists for the changes that come up most often. User-facing documentation lives in `README.md` (English) and `README_zh.md` (Chinese); the two must say the same thing.

## What Stowly is

A desktop workbench for three-dimensional load planning (containers, trucks, pallets, cartons) that puts a graphical interface on [packingsolver3d](https://github.com/HansBug/packingsolver3d), the in-process Python binding of PackingSolver's `box` and `boxstacks` solvers. Stowly owns no solving logic: it collects an instance, hands it to packingsolver3d through a local HTTP backend, and shows the result. The name says what it does (stow = 装载) and nothing else.

Three audiences: a planner who loads a cargo list and wants a picture and a CSV; a developer who evaluates packingsolver3d and wants to see instances; and us, using it as the reference front end for the library. Prototype status is stated in the README when it applies; the interface must never claim a solver result the library did not produce.

## Design principles

1. **Small tool, not a platform.** No database, no logging framework, no user accounts, no cloud. State is the project JSON the user saves. If a feature needs a server, it does not belong here.
2. **The solver is packingsolver3d, unchanged.** Objectives, statuses, rotation tokens and the value / bound pair are forwarded as the library reports them. `optimal` is shown only when the library says so; a good-looking packing that was not proven stays `feasible`. Anything the library refuses is shown as an error with the library's message, never silently worked around.
3. **Millimetres and kilograms inside.** The project model (`lib/project.ts`, `models.py`) stores integers in mm and floats in kg; the interface converts for display (`toMm` / `fromMm`) and the solver never sees display units. Cargo lists are imported with the unit the user chose in the dialog.
4. **Runs offline from one installer.** Every package carries a relocatable CPython with the backend and packingsolver3d. A packaged build never falls back to a system interpreter: a missing bundle must fail loudly (`locatePython`), because "works on the developer's machine" is the failure mode we guard against.
5. **Chinese first, English complete.** Default language zh-CN, en-US one click away, both persisted in `localStorage['stowly.language']`. Every user-visible string goes through `react-i18next`; a test enforces identical key sets in `zh-CN.json` and `en-US.json`.
6. **Presets carry their sources.** Built-in containers and cargo types are public typical values; every entry has a `source` string and `presets/SOURCES.md` explains where the numbers come from. Never add a preset without one.
7. **Evidence over claims.** Compatibility statements in the READMEs are backed by a CI job that exercises them (the `ubuntu:20.04` container test for Ubuntu 20.04, the toolchain-hidden smoke runs for Windows and macOS). If a claim cannot be tested in CI, it is phrased as untested.

## Compatibility requirements

| Layer | Requirement | Where it comes from | Verified by |
|---|---|---|---|
| Linux runtime | x64 and arm64, glibc ≥ 2.31 (Ubuntu 20.04+) | Electron 44's floor; python-build-standalone `install_only` builds need only glibc 2.17 | Build Desktop (x64 on `ubuntu-22.04`, arm64 on `ubuntu-22.04-arm`) installs the `.deb` in `ubuntu:20.04`, runs the portable tar.gz and the AppImage in `ubuntu:22.04`, all with python/node removed |
| Linux sandbox | Hosts that restrict unprivileged user namespaces (Ubuntu 24.04+) need `--no-sandbox` for the AppImage and for development; the `.deb` sets the SUID helper | Chromium's sandbox helper | `make run` detects `kernel.apparmor_restrict_unprivileged_userns`; README notes it |
| Windows | 10 / 11, x64 and arm64 | Electron 44 dropped 7–8.1; arm64 is built natively on `windows-11-arm` (python-build-standalone `aarch64-pc-windows-msvc`, packingsolver3d `win_arm64` wheels) | Build Desktop smoke of the extracted portable zip and of a silent NSIS install (`/S /D=`) with `PATH` reduced to `System32` |
| macOS | 12+, arm64 and x64, one architecture per build | Electron 44, python-build-standalone 3.12 | Build Desktop smoke of the extracted portable zip and of the `.app` inside the mounted DMG on `macos-14` (arm64) and `macos-15-intel` (x64) with `env -i` |
| Bundled Python | CPython 3.12 from python-build-standalone, pinned in `scripts/prepare-python.mjs` (`--target linux-x64|linux-arm64|win-x64|win-arm64|mac-arm64|mac-x64`) | packingsolver3d 0.0.1 has cp312 wheels for all six targets (manylinux x86_64/aarch64, win_amd64/win_arm64, macosx arm64/x86_64) | The smoke report names the interpreter path; CI asserts it is inside the package's resources |
| Development | Node 20 or 22, Python 3.10 or 3.12 | Vite 7 / electron-vite 5 need Node 20.19+; `backend/pyproject.toml` requires ≥ 3.10 | Code Test matrix: both sides on `ubuntu-22.04`, `windows-2022`, `macos-14` |

Runner images are the lowest versions GitHub still offers, so artifacts are as compatible as possible. Raising a floor (Electron major, Python minor, Node major) is a deliberate change: update this table, both READMEs and the workflows in the same commit, and re-run Build Desktop before merging.

## Architecture

### Processes

```text
Electron main (src/main)                     Python backend (backend/stowly_backend)
  locatePython() -> BackendProcess.start()  -> python -m stowly_backend --port 0 --token <32 hex>
  waits for stdout line  READY {"host","port"}   <- __main__.py picks a free port, prints once, runs uvicorn
  ipcMain handlers (src/main/ipc.ts)         FastAPI app (app.py), X-Stowly-Token on every route but /api/health
  BrowserWindow -> preload exposes window.stowly
Renderer (src/renderer/src)
  BackendClient (lib/api.ts) -> HTTP to 127.0.0.1:<port>     solves run in a thread (solver.JobManager), polled
```

- **Startup handshake.** The backend binds and listens on its socket *before* printing `READY` (`__main__.listen`, then `uvicorn.Server.run(sockets=[sock])`), so a client that connects the instant it reads the line is queued in the backlog instead of refused; printing first and letting uvicorn bind later lost that race on slow CI machines (`fetch failed` right after start, caught by the smoke test) and `tests/test_main.py` now connects without any delay to prove it. The backend prints exactly one `READY` JSON line; everything else it prints (uvicorn logs, tracebacks) is kept in a 500-line ring buffer and shown in the interface if the start fails. `BackendProcess.start` rejects on exit, spawn error or a 30 s timeout. `PythonLocation.args` lets tests run a fake interpreter through `node`.
- **Interpreter choice** (`locatePython`): `STOWLY_PYTHON` → bundled `resources/python` when packaged → `.venv` of the checkout → `python3` / `python` on PATH. Paths follow the target platform's separators so the logic is host-independent.
- **IPC channels** (`src/main/ipc.ts`, exposed by `src/preload/index.ts` as `window.stowly`): `backend:info` (base URL, token, startup error, log tail), `app:version`, `shell:openExternal`, `dialog:saveText` (save dialog + write), `dialog:openFiles` (open dialog + read, exact-size `ArrayBuffer`s). The renderer has no Node access; everything else goes over HTTP.
- **HTTP API** (`backend/stowly_backend/app.py`): `GET /api/health` (public), `GET /api/presets`, `POST /api/solve` → job id, `GET /api/jobs/{id}` → `running | done | failed`, `DELETE /api/jobs/{id}`, `POST /api/import` (multipart files + `unit` + `instanceIndex`) → project, `POST /api/export/placements` → CSV text. CORS is open because the token, not the origin, is the guard; the renderer's CSP only allows `connect-src` to loopback.
- **Self-test.** `stowly --smoke[=report.json]` (`src/main/smoke.ts`, wired in `src/main/index.ts`) starts normally, then probes health, presets, a 10-item solve and the renderer (a button that only enables after presets arrive), writes a JSON report and exits 0/1. It is what the Build Desktop workflow runs in clean environments and what `make smoke` runs locally.

### Data model

`lib/project.ts` and `models.py` mirror each other; schema tag `stowly/1`.

- `BinSpec { id, name, x, y, z, copies, cost?, maxWeight? }`, `ItemSpec { id, name, x, y, z, copies, weight?, profit?, rotations: 'all' | 'upright' | 'fixed', color? }`, `Settings { solver: 'box' | 'boxstacks', objective: 'bin-packing' | 'knapsack' | 'variable-sized-bin-packing', timeLimit, optimizationMode }`.
- `solver.build_instance` maps rotations to packingsolver3d tokens (`all` → six rotations, `upright` → `XYZ, YXZ`, `fixed` → `XYZ`) and, for `boxstacks`, gives every item type its own `stackability_id` so only identical types stack (upstream buckets types by `(group_id, stackability_id)` and refuses mixed footprints).
- `SolveResult { status, objective, value, bound, solveTime, wallTime, bins[], counts[], statistics, options }`; `PackedBin { binId, binIndex, copies, x, y, z, placements[], volumeUtilization, weight }`; a `Placement` is the lower corner plus placed extents and the rotation token. The 3D scene maps solver `(x, y, z)` to Three.js `(x, z, y)` in metres (`three/boxes.ts`).
- Imports (`importers.py`): cargo lists match headers through `SYNONYMS` (Chinese and English, units in parentheses stripped); `thpack` parsing tolerates a missing seed line; PackingSolver CSV pairs are detected by their `ID,X,Y,Z` header. The store appends cargo-only or container-only imports and replaces the project for complete instances (`mergeImport`).

### Renderer

- `App.tsx` is the only place that knows about `window.stowly` and file dialogs; components receive data and callbacks. State is one zustand store (`store/project.ts`): project, result, job, presets, language, selected bin, dirty flag.
- `components/`: `EditableTable` (containers and cargo, fixed column widths so the name stays readable in the 760 px sider), `SettingsPanel` (validation messages, volume ratio, solve button `data-testid="solve-button"`), `Viewer3D` (wraps `three/scene.ts`; draws the first container empty before a result exists), `ResultPanel` (knapsack values shown in m³ when profits default to volume), `PresetDrawer`, `ImportModal`.
- `three/scene.ts` owns WebGL: renderer, camera, OrbitControls, raycasting for hover/select, visibility for the loading-order slider. Geometry is computed in `three/boxes.ts`, which is pure and tested directly. `Viewer3D` catches a failing `SceneController` constructor (no WebGL context: GPU-less virtual machines, remote desktops) and shows a notice instead of letting the whole React tree crash; the macOS x64 CI runner is exactly such a machine, and the smoke test's renderer check depends on this.
- Ant Design 6 specifics that bit us: two-character CJK button labels get an inserted space (`确 定`), inactive `Tabs` panes and closed `Drawer`/`Modal` stay in the DOM (and a hidden modal does not re-render on language change until reopened), the `Select` trigger is the `.ant-select` root and options are `.ant-select-item-option[title]`, and the header must be allowed to wrap (English labels overflowed a fixed 64 px header).

## Repository layout

```text
.
|- AGENTS.md -> CLAUDE.md          # symlink; never edit the two separately
|- README.md / README_zh.md        # user documentation, English and Chinese, cross-linked at the top
|- Makefile                        # setup / run / test / build / probe / build-python / dist-dir / dist / smoke / clean
|- package.json                    # Electron 44, electron-vite 5, React 19, antd 6, three, zustand, vitest 5, playwright, electron-builder 26
|- electron.vite.config.ts, tsconfig*.json, vitest.config.ts, vitest.setup.ts
|- electron-builder.yml            # appId io.github.hansbug.stowly; extraResources resources/python -> python; deb+AppImage, nsis, dmg
|- scripts/prepare-python.mjs      # downloads python-build-standalone, pip-installs backend + packingsolver3d into resources/python
|- scripts/ui-probe.mjs            # Playwright drive of the built app (make probe): screenshots + console errors under /tmp/stowly_ui
|- docs/screenshots/               # solved-en.png / solved-zh.png used by the READMEs (from the probe run)
|- src/main/                       # index.ts (entry), backend.ts (locatePython, READY parsing), process.ts (BackendProcess), ipc.ts, smoke.ts
|- src/preload/                    # window.stowly bridge + index.d.ts
|- src/renderer/src/               # App.tsx, components/, lib/ (project, result, api, colors), store/, three/, i18n/, test/fixtures.ts
|- backend/stowly_backend/         # __main__.py, app.py, models.py, solver.py, importers.py, exporters.py, presets/{containers,items}.json + SOURCES.md
|- backend/tests/                  # pytest, 100 % line coverage required in spirit, fail_under 85 enforced
`- .github/workflows/              # test.yaml (Code Test), build.yaml (Build Desktop + release on tags)
```

Build products (`out/`, `dist/`, `resources/python`, `resources/cpython-*.tar.gz`, `coverage/`, `*.tsbuildinfo`, `.venv`) are gitignored.

## Testing strategy

Three layers, each catching what the others cannot:

1. **Unit tests, both sides, with coverage.** Backend: `pytest --cov` over `stowly_backend` (importers, solver mapping, job manager, presets, FastAPI routes through `TestClient`); currently 100 %, `fail_under = 85` in `pyproject.toml`. Frontend: `vitest` in jsdom over everything under `src/` (main process with `electron` mocked, preload, store, lib, components with Testing Library, `three/scene.ts` with a fake `WebGLRenderer`, the App as a whole with `window.stowly` and `fetch` stubbed); thresholds 90 % lines / statements / functions and 80 % branches in `vitest.config.ts`. Both run on Linux, Windows and macOS in the Code Test workflow and upload to Codecov with `backend` / `frontend` flags.
2. **Interface probe** (`make probe`, `scripts/ui-probe.mjs`). Playwright launches the built app with its own Electron binary, stubs the native dialogs in the main process, walks demo → solve → export → viewer → import → language → manual edits → unit switch → presets → save/import, and fails on console errors or layout overflow. It is a development tool, not a CI gate: it needs a display and looks at screenshots a person has to read. Run it after any renderer change and look at `/tmp/stowly_ui/*.png`.
3. **Packaged self-test** (`--smoke`, `make smoke`, Build Desktop). Proves the shipped artifact works where nothing else is installed.

Rules: new behaviour comes with a test on the side it lives; a bug found by the probe or by a person gets a unit test that would have caught it when one is possible (the `fetch` binding bug and the import-replaces-cargo bug both have one now). Do not lower thresholds to make a build pass; add the test or exclude a file with a written reason in `vitest.config.ts`.

## Build, packaging and release

- `npm run build` (electron-vite) produces `out/main`, `out/preload`, `out/renderer`.
- `node scripts/prepare-python.mjs [--target linux-x64|win-x64|mac-arm64|mac-x64]` downloads the pinned python-build-standalone `install_only` archive for the target (default: the host), extracts it to `resources/python`, and runs its pip to install `./backend` and `packingsolver3d`. Behind this machine's proxy Node's fetch needs `NODE_USE_ENV_PROXY=1` (the Makefile passes the proxy variables through). The archive is cached under `resources/` and ignored by git.
- `electron-builder` packages `out/` plus `resources/python` (as `resources/python` inside the app; `extraResources`). Every platform ships a **portable** archive (extract and run) and an **installer** per architecture, named `${productName}-${version}-<os>-<arch>-{portable|installer}.<ext>` through `artifactName` patterns: Linux `tar.gz` / `deb` (+ the single-file AppImage on x64 only: electron-builder's arm64 AppImage runtime links an unversioned `libz.so` and fails to load on stock distributions, so the arm64 job builds `deb tar.gz` only), Windows `zip` / `nsis`, macOS `zip` / `dmg`. The config lists no `arch`: an arch list in the config wins over the CLI, so the workflow's `--x64` / `--arm64` would be ignored and each runner would also package the other architecture with the wrong CPython inside (this happened before the flags were honoured). electron-builder spells the architecture per format (`amd64` in deb, `x86_64` in AppImage); the workflow renames those to `x64` right after packaging so every file name uses `x64` / `arm64`. The `.deb` declares Electron's full runtime dependency list explicitly (`deb.depends`): electron-builder's default omits `libgbm1` and `libasound2`, and a minimal Ubuntu 20.04 then fails with `libgbm.so.1: cannot open shared object file`; the container test caught it.
- **Build Desktop** (`.github/workflows/build.yaml`) runs on pushes to `main`, `ci/**` branches, tags `v*`, pull requests and by hand: six native package jobs (`ubuntu-22.04`, `ubuntu-22.04-arm`, `windows-2022`, `windows-11-arm`, `macos-14`, `macos-15-intel`), each smoke-testing its portable archive and its installer in a clean environment (Linux: `.deb` in bare `ubuntu:20.04`, tar.gz and AppImage in bare `ubuntu:22.04`, python/node removed; Windows: extracted zip and a silent NSIS install with `PATH` cut to `System32`; macOS: extracted zip and the `.app` inside the mounted DMG under `env -i`), then uploading `stowly-<target>-portable`, `stowly-<target>-installer` and `stowly-<target>-smoke-reports` artifacts. On a `v*` tag the release job merges the artifacts into a GitHub release with generated notes.
- **Releasing**: bump `version` in `package.json` and `backend/pyproject.toml`, make sure Code Test and Build Desktop are green on `main`, tag `vX.Y.Z` and push the tag. The release job attaches the artifacts. Installers are unsigned (no Apple Developer ID, no Windows code-signing certificate); the READMEs tell users how to open them. Signing is a future item that needs certificates, not code.

## Conventions

- Code, comments, commit messages, workflow files and this guide are in English; the interface is bilingual; conversation with the maintainer is in Chinese.
- Commits: `type(scope): imperative summary`, types `feat fix docs test refactor chore ci build`, scopes `renderer main preload backend importers presets i18n ci packaging docs`. Non-trivial commits get a body with `-` bullets; keep the `Co-Authored-By` trailer.
- TypeScript: strict, no `any` except at the IPC boundary where Electron's types force it; components are functions with typed props; no default exports except where a framework requires one.
- Python: 3.10+ syntax is allowed (the backend is not a library), pydantic v2 models, no broad `except Exception` without a comment saying why; importers raise `ImportError_` with a message the interface can show.
- Markdown paragraphs are single lines, not hard-wrapped.
- Never mention the maintainer's private research repository in code, docs or commits.

## Change checklists

**Add a preset.** Append to `backend/stowly_backend/presets/containers.json` or `items.json` with `id`, `category`, `name.zh`, `name.en`, dimensions in mm (inner dimensions for containers), `maxWeight` or `weight` in kg, optional `note`, and a `source`; add the category to `presets.categories` in both i18n files if new; describe the source in `SOURCES.md`; `test_presets.py` checks the schema.

**Add a field to the model.** `lib/project.ts` and `models.py` together; `EditableTable` column (mind the fixed widths); `solver.build_instance` mapping if the solver consumes it; `serializeProject` / `parseProject` defaults so old project files still load; importer synonyms if a cargo list can carry it; tests on both sides; both READMEs if user-visible.

**Add an import format.** A parser in `importers.py` returning a `Project`, detection in `import_files`, a fixture-based test, the `IMPORT_FILTER` extensions in `App.tsx`, the hint text in both i18n files, the Files table in both READMEs.

**Add a UI string.** Same key in `zh-CN.json` and `en-US.json` (the key-set test fails otherwise); keep toolbar labels short in English so the header does not wrap at 1100 px.

**Bump Electron, Node or Python.** Check the compatibility table above and the floors it cites; update `package.json` / `scripts/prepare-python.mjs`; run Build Desktop (push a `ci/**` branch) and read the smoke reports before merging; update the table and both READMEs.

**Change the backend API.** `app.py`, `lib/api.ts` (`BackendClient`), `smoke.ts` if the self-test uses the route, tests on both sides. The token header stays on every route except health.

## Known limitations and troubleshooting

- `boxstacks` here means "identical cargo types may stack": one `stackability_id` per type. Mixed-type stacking rules, nesting heights and axle-load modelling exist in packingsolver3d but have no interface yet.
- No cancel button for a running solve (packingsolver3d does not expose the upstream end flag yet); the time limit is the control.
- Installers are unsigned; Gatekeeper and SmartScreen warn on first launch.
- `electron-vite dev` says `Electron uninstall`: `node_modules/electron/dist` is missing because the postinstall did not run or download; `make run` re-runs `node node_modules/electron/install.js` (honours `HTTPS_PROXY` through `ELECTRON_GET_USE_PROXY=1` and hits electron-builder's cache in `~/.cache/electron`).
- Chromium aborts with "SUID sandbox helper binary was found, but is not configured correctly": the host restricts unprivileged user namespaces; use `--no-sandbox` (dev: `--noSandbox`) or the `.deb`.
- `make run` from an ssh/tmux shell shows nothing: no `DISPLAY`; the Makefile picks the local X socket, or set `DISPLAY` yourself.
- The renderer showed "Illegal invocation" from `fetch`: a bare `fetch` reference stored as a method loses its `this`; `BackendClient` wraps it in a closure. Keep it that way.
