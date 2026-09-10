# Stowly

[English](README.md) | **中文说明**

[![Code Test](https://github.com/HansBug/stowly/actions/workflows/test.yaml/badge.svg)](https://github.com/HansBug/stowly/actions/workflows/test.yaml)
[![Build Desktop](https://github.com/HansBug/stowly/actions/workflows/build.yaml/badge.svg)](https://github.com/HansBug/stowly/actions/workflows/build.yaml)
[![codecov](https://codecov.io/gh/HansBug/stowly/branch/main/graph/badge.svg)](https://codecov.io/gh/HansBug/stowly)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Stowly 是一个三维装载规划桌面工具：填好容器（集装箱、货车、托盘、纸箱）和货物，点"开始求解"，就能得到每一件货物的摆放位置、三维视图、利用率数字，以及一份可以直接交给仓库的 CSV。求解器是 [packingsolver3d](https://github.com/HansBug/packingsolver3d)，即 Florian Fontan 的 [PackingSolver](https://github.com/fontanf/packingsolver) 中 `box` / `boxstacks` 两个算法的进程内 Python 绑定；Stowly 用 Electron 外壳、React / Ant Design 界面和 Three.js 视图把它包起来。全部在本机离线运行，安装包自带 Python。

![求解示例项目后的 Stowly：一个 40 尺高柜，装有邮政纸箱、整托和 IBC 吨桶](docs/screenshots/solved-zh.png)

## 能做什么

- **容器与货物表格**：长度单位可选 mm / cm / m / in，每种货物有件数、重量、价值和旋转规则（任意 / 直立 / 固定）。
- **带来源的内置预设**：ISO 20 尺 / 40 尺 / 40 尺高柜 / 45 尺高柜及冷藏箱、国内 4.2–17.5 米货车、欧美挂车、EUR / GMA / 亚洲托盘、邮政标准纸箱、VDA KLT 与欧标周转箱、IBC 吨桶、Gaylord 大箱、美式搬家箱。每一条都注明尺寸出处（[`backend/stowly_backend/presets/SOURCES.md`](backend/stowly_backend/presets/SOURCES.md)）。
- **三种目标**：全部装下且容器最少；一个容器装尽量多的价值（背包，价值默认为体积）；按成本挑选容器组合。普通装箱用 `box`，涉及堆叠、载重、卡车轴荷规则时用 `boxstacks`。
- **诚实的结果**：状态区分"已证明最优"与"可行解（未证明最优）"，目标值与界始终并列显示。
- **三维视图**：悬停 / 点击查看货物，装载顺序滑块，每个容器一个场景。
- **文件**：Stowly 项目 JSON（`stowly/1`）、中英文列名的 CSV / XLSX 货物清单、ESICUP `thpack` / BR 文本实例、PackingSolver 的 `items.csv` + `bins.csv`；摆放结果导出为 CSV。
- **默认中文，一键切英文**，所有文案两种语言齐全。

## 安装

在 [Releases](https://github.com/HansBug/stowly/releases) 页面下载对应平台的安装包（每次 [Build Desktop](https://github.com/HansBug/stowly/actions/workflows/build.yaml) 工作流的构建产物也都作为 artifact 附在运行记录里）。

| 平台 | 安装包 | 说明 |
|---|---|---|
| Linux x86_64，Ubuntu 20.04 及以上（glibc ≥ 2.31） | `.deb`、`.AppImage` | `.deb` 安装到 `/opt/Stowly` 并设置好沙箱辅助程序权限。在限制非特权 user namespace 的发行版（Ubuntu 24.04 及以后）上，AppImage 需要加 `--no-sandbox`。 |
| Windows 10 / 11 x64 | NSIS `.exe` 安装程序 | 未签名：首次运行 SmartScreen 会提示"未知发布者"。 |
| macOS 12 及以上，Apple Silicon 与 Intel | `.dmg` | 未签名：右键 → 打开，或执行一次 `xattr -dr com.apple.quarantine /Applications/Stowly.app`。 |

每个安装包内置一份可迁移的 CPython 3.12、后端和 `packingsolver3d`，不需要再安装任何东西。Build Desktop 工作流会把 `.deb` 装进一个没有 Python 和 Node 的干净 `ubuntu:20.04` 容器里跑应用自检，通过后才发布产物。

## 快速上手

1. 启动 Stowly，点工具栏的**载入示例**：一个 40 尺高柜，三种邮政纸箱、整托欧标托盘和 IBC 吨桶，货比空间多。
2. 看**容器**和**货物**两个页签；任何单元格都可以直接改，也可以手动添加行或**从预设添加**。
3. 打开**求解设置**：`box`，目标"背包：价值最大"，10 秒。设置下方那行把货物总体积和容器总容积做了对比。
4. 点**开始求解**。三维视图填满，结果面板给出状态（示例是"可行解（未证明最优）"）、目标值 / 界、使用容器数、装入件数和利用率，接着是每种货物的装入 / 未装入统计和摆放明细。
5. **导出摆放 CSV** 写出每件货物一行（容器、货物、位置、摆放后尺寸、旋转）。**保存项目**把整套设置存成 JSON，下次直接打开。

工具栏随时可以切换长度单位（mm / cm / m / in），数值自动换算，求解器收到的永远是毫米。语言用 中文 / EN 开关切换。

## 文件格式

| 导入 | 识别方式 | 说明 |
|---|---|---|
| Stowly 项目 | 含 `"schema": "stowly/1"` 的 `.json` | 容器、货物、设置完整往返。 |
| 货物清单 | 带表头的 `.csv` / `.xlsx` | 按列名中英文匹配：名称 / name、长 / length、宽 / width、高 / height、数量 / quantity、重量 / weight、价值 / value、旋转 / rotation。表头里的单位（如 `Length (mm)`）会被忽略，单位在导入对话框里选。追加到当前货物之后。 |
| ESICUP `thpack` / BR | `.txt` / `.dat` / `.thpack` | Bischoff–Ratcliff 集装箱装载实例；在对话框里选实例序号。会替换整个项目。 |
| PackingSolver | 同时选中 `items.csv` + `bins.csv`，或单个 `items.csv` | 上游求解器的 CSV 格式，含 `ROTATION_*` 标志。 |

导出的摆放 CSV 列为 `bin, bin_name, bin_copies, item, item_name, x, y, z, lx, ly, lz, rotation`，长度全部为毫米，位置是货物在容器坐标系中的下角点（x 沿长度方向，y 沿宽度，z 向上）。

## 工作原理

```text
Electron 主进程 ──spawn──▶ python -m stowly_backend --port 0 --token …   （内置 CPython）
        │  READY {"host","port"}  ◀──────────────┘
        │
        └─ BrowserWindow（React + Ant Design + Three.js）──HTTP + X-Stowly-Token──▶  127.0.0.1 上的 FastAPI
                                                                                          └─ packingsolver3d（box / boxstacks）
```

主进程启动后端，等它打印 `READY` 行，再把端口和一个随机令牌交给渲染进程。渲染进程通过普通 HTTP 调用后端（预设、导入、求解任务、导出）；令牌用来挡住本机其他程序。求解在工作线程里进行、前端轮询，界面不会卡住。项目模型内部统一存毫米和千克，界面负责换算。状态原样来自 packingsolver3d：只有达到的值等于报告的界时才是 `optimal`。

## 开发

`make help` 列出全部目标。第一次 `make run` 会自动创建 `.venv` 并安装后端、执行 `npm ci`。

```shell
make run            # Electron 热更新；后端来自 .venv（或 STOWLY_PYTHON）
make test           # 后端 pytest 覆盖率 + 前端 vitest 覆盖率 + typecheck
make probe          # 构建后用 Playwright 驾驭应用走一遍流程，截图和 console 报错在 /tmp/stowly_ui
make build          # 把 renderer / main / preload 打成 out/
```

依赖：Node 20 或 22，Python 3.10 及以上，GNU make。不用 make 的话：`python -m venv .venv && .venv/bin/pip install -e "./backend[test]"`，然后 `npm ci`、`npm run typecheck`、`npm run test:coverage`、`npm run dev`；后端测试是 `cd backend && pytest --cov`。

Linux 上 `make run` 会自动补装缺失的 Electron 二进制、在 shell 没有 `DISPLAY` 时取桌面会话的显示、并在限制非特权 user namespace 的主机上加 `--noSandbox`。

## 打包

```shell
make dist-dir       # 可迁移 CPython 3.12 + 后端 + packingsolver3d 放进 resources/python，再产出 dist/<platform>-unpacked
make dist           # 同上，再生成安装包：AppImage / deb、NSIS 安装程序、DMG
make smoke          # dist-dir 之后运行打包版自检（stowly --smoke），输出 JSON 报告
```

`stowly --smoke[=report.json]` 内置在应用里：启动内置解释器、调用 HTTP API、跑一个小型求解、确认渲染进程加载并连上后端，写出报告并以 0 / 1 退出。Build Desktop 工作流在四个目标上都跑它（Linux 在干净的 `ubuntu:20.04` 与 `ubuntu:22.04` 容器里，Windows 与 macOS 把 runner 自带工具链从 `PATH` 里藏掉），把安装包和报告作为 artifact 上传，`v*` 标签则直接发布 GitHub release。

## 兼容性

| 组件 | 支持范围 | 原因 |
|---|---|---|
| Linux | x86_64，glibc ≥ 2.31（Ubuntu 20.04+、Debian 11+、RHEL 9+） | Electron 44 要求 glibc 2.31；内置 CPython 只需 2.17。由 `ubuntu:20.04` 容器测试验证。 |
| Windows | 10 / 11，x64 | Electron 44 已放弃 Windows 7–8.1。 |
| macOS | 12 Monterey 及以上，arm64 与 x64 | Electron 44 与 python-build-standalone 3.12 的下限。 |
| 开发 | Node 20 / 22，Python 3.10 / 3.12 | Code Test 工作流在 Linux、Windows、macOS 三平台跑前后端并上报覆盖率。 |

## 许可与致谢

MIT，见 [LICENSE](LICENSE)。Stowly 是独立项目，构建在 [packingsolver3d](https://github.com/HansBug/packingsolver3d) 之上，进而依赖 Florian Fontan 的 [PackingSolver](https://github.com/fontanf/packingsolver)（MIT）。预设尺寸为公开的典型值，出处见 [`SOURCES.md`](backend/stowly_backend/presets/SOURCES.md)；实际以设备铭牌为准。
