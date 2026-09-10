# Stowly

[![Code Test](https://github.com/HansBug/stowly/workflows/Code%20Test/badge.svg)](https://github.com/HansBug/stowly/actions?query=workflow%3A%22Code+Test%22)
[![Build Desktop](https://github.com/HansBug/stowly/workflows/Build%20Desktop/badge.svg)](https://github.com/HansBug/stowly/actions?query=workflow%3A%22Build+Desktop%22)
[![codecov](https://codecov.io/gh/HansBug/stowly/branch/main/graph/badge.svg)](https://codecov.io/gh/HansBug/stowly)

Stowly is a desktop workbench for three-dimensional load planning: describe the containers, trucks or pallets you have and the cargo you need to stow, let [packingsolver3d](https://github.com/HansBug/packingsolver3d) (PackingSolver's `box` / `boxstacks` engines) find a packing under a time budget, and inspect the result in an interactive 3D view. The interface is in Chinese by default and switches to English with one click.

**Status: prototype.** It solves, draws, imports, exports and saves; it does not yet do weight distribution, stability or loading sequences beyond what the engine returns.

## What it does

- **Containers, cargo, solve.** Editable tables for container types (size, copies, cost, payload) and cargo types (size, pieces, weight, value, allowed rotations), a solver panel with the objective (fewest containers, highest value in one container, cheapest container mix), the time limit and the search mode, and a big Solve button.
- **Built-in presets with sources.** ISO containers (20GP/40GP/40HQ/45HQ, reefers), Chinese truck bodies (4.2 / 6.8 / 7.6 / 9.6 / 13 / 17.5 m), EU and US trailers, pallets as load units, rail; on the cargo side China Post cartons 1-12, VDA 4500 KLT bins, Euro containers, IBC totes, Gaylord boxes, loaded pallets and US moving boxes. Every entry names its source; see `backend/stowly_backend/presets/SOURCES.md`.
- **Save and load** projects as JSON; **import** cargo lists from CSV/XLSX (headers recognised in English and Chinese), ESICUP `thpack`/BR benchmark instances and PackingSolver `items.csv` + `bins.csv` pairs; **export** placements as CSV.
- **3D inspection.** One scene per container: rotate, zoom, hover a box for its cargo type and position, click to select, and drag the loading-order slider to replay the packing box by box.
- **Honest results.** Status distinguishes a proven optimum from a merely feasible packing, and value and bound are shown side by side, the same way packingsolver3d reports them.

## Architecture

```text
Electron shell (main process)     spawns and supervises the Python backend, owns file dialogs
   |  contextBridge (window.stowly)
React + Ant Design + Three.js     the workbench, built with Vite; i18n via react-i18next (zh-CN default, en-US)
   |  HTTP on 127.0.0.1, random port, per-session token
Python backend (FastAPI)          presets, importers, packingsolver3d solves in a worker thread
```

The renderer never talks to Node directly; the preload exposes a handful of typed functions. The backend is plain Python and can be run and tested on its own.

## Development

```shell
# backend
python -m venv .venv && . .venv/bin/activate
pip install -e "./backend[test]"
(cd backend && pytest --cov)

# frontend + shell
npm ci
npm run typecheck
npm run test:coverage
npm run dev            # Electron with hot reload; the backend runs from .venv (or STOWLY_PYTHON)
```

## Packaging

```shell
node scripts/prepare-python.mjs     # relocatable CPython 3.12 + backend + packingsolver3d into resources/python
npm run dist                        # electron-builder: AppImage/deb, NSIS installer, DMG
```

Targets: Linux x64 (glibc 2.31 and newer, i.e. Ubuntu 20.04+), Windows x64 (10/11), macOS arm64 and x64 (12+). The `Build Desktop` workflow produces all of them on native runners.

## License

MIT. PackingSolver is MIT licensed by Florian Fontan; see the packingsolver3d NOTICE for the exact build configuration.

---

## 中文说明

Stowly 是一个三维装载规划桌面工具：描述你手上的集装箱、货车或托盘和要装的货物，交给 [packingsolver3d](https://github.com/HansBug/packingsolver3d)（PackingSolver 的 `box` / `boxstacks` 引擎）在时间预算内求解，然后在交互式 3D 视图里检查结果。界面默认中文，一键切换英文。

**当前状态：原型。** 能求解、能画、能导入导出和存取项目；重量分布、稳定性、装载顺序约束等还没有做。

- **内置预设**：ISO 集装箱（20GP/40GP/40HQ/45HQ、冷藏箱）、国内 4.2/6.8/7.6/9.6/13/17.5 米货车、欧美挂车、托盘、铁路；货物侧有邮政 1–12 号纸箱、VDA 4500 KLT 周转箱、欧标周转箱、IBC 吨桶、Gaylord 大箱、整托和美式搬家箱，每条都标注来源（`backend/stowly_backend/presets/SOURCES.md`）。数值是公开的典型内尺寸，实际以设备铭牌和行驶证为准。
- **数据进出**：项目保存为 JSON；导入 CSV/XLSX 货物清单（中英文列名自动识别）、ESICUP thpack/BR 基准实例、PackingSolver 的 items.csv + bins.csv；导出摆放 CSV。
- **求解与检查**：目标可选"容器最少 / 价值最大 / 成本最低"，设时间上限；结果区分"已证明最优"与"可行解"，目标值与界并列显示；3D 视图可旋转缩放、悬停查看、点击选中、拖动装载顺序滑条逐件回放。
- **打包分发**：Linux x64（Ubuntu 20.04 及以上）、Windows x64、macOS；随包携带独立的 CPython 与后端，目标机器无需安装 Python 或联网。
