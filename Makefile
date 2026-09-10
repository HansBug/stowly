# Stowly developer entry points. `make help` lists them.
SHELL := /bin/bash
PYTHON ?= python3
VENV   ?= .venv
VENV_PY := $(abspath $(VENV)/bin/python)
NPM    ?= npm

.PHONY: help setup setup-python setup-node run test test-backend test-frontend typecheck build probe build-python dist dist-dir clean

help:
	@echo "Stowly"
	@echo "  make setup         - create $(VENV) with the backend + test deps, and npm ci"
	@echo "  make run           - start the app in development mode (Electron + Vite hot reload, backend from $(VENV))"
	@echo "  make test          - backend pytest with coverage + frontend vitest with coverage + typecheck"
	@echo "  make build         - build the renderer/main/preload bundles into out/"
	@echo "  make probe         - build, then drive the app with Playwright (screenshots + console errors under /tmp/stowly_ui)"
	@echo "  make build-python  - download a relocatable CPython and install the backend into resources/python (needs network)"
	@echo "  make dist-dir      - build-python + build + electron-builder --dir -> dist/<platform>-unpacked (quick local package)"
	@echo "  make dist          - build-python + build + electron-builder       -> installers under dist/"
	@echo "  make clean         - remove out/, dist/, coverage files and resources/python"

# Environment: the venv is created on first use, node_modules follows package-lock.json.
$(VENV_PY):
	$(PYTHON) -m venv $(VENV)
	$(VENV_PY) -m pip install -q -U pip
	$(VENV_PY) -m pip install -q -e "./backend[test]"

node_modules: package-lock.json
	$(NPM) ci
	@touch node_modules

setup-python: $(VENV_PY)
setup-node: node_modules
setup: setup-python setup-node

# The electron package downloads its binary in a postinstall step; when that step was skipped or failed,
# electron-vite reports "Electron uninstall". Re-run the download (it honours the cache electron-builder
# fills, and HTTP(S)_PROXY through ELECTRON_GET_USE_PROXY).
node_modules/electron/path.txt: node_modules
	HTTPS_PROXY="$${HTTPS_PROXY:-$$https_proxy}" HTTP_PROXY="$${HTTP_PROXY:-$$http_proxy}" ELECTRON_GET_USE_PROXY=1 node node_modules/electron/install.js

# Two Linux desktop hurdles, handled here so `make run` from an ssh/tmux shell just works:
# - no DISPLAY in the shell: pick the X socket of the local desktop session;
# - Ubuntu 24.04+ restricts unprivileged user namespaces, which kills Chromium's SUID sandbox helper
#   with "The SUID sandbox helper binary was found, but is not configured correctly": run un-sandboxed.
run: $(VENV_PY) node_modules node_modules/electron/path.txt
	@if [ -z "$$DISPLAY$$WAYLAND_DISPLAY" ] && [ -n "$$(ls /tmp/.X11-unix 2>/dev/null)" ]; then \
	  export DISPLAY=":$$(ls /tmp/.X11-unix | head -1 | tr -dc 0-9)"; echo "DISPLAY is not set; using $$DISPLAY"; fi; \
	flags=""; if [ "$$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ]; then \
	  flags="--noSandbox"; echo "unprivileged user namespaces are restricted on this host; running Electron with $$flags"; fi; \
	$(NPM) run dev -- $$flags

typecheck: node_modules
	$(NPM) run typecheck

test-backend: $(VENV_PY)
	cd backend && $(VENV_PY) -m pytest --cov --cov-report=term-missing --cov-report=xml

test-frontend: node_modules
	$(NPM) run test:coverage

test: test-backend test-frontend typecheck

build: node_modules
	$(NPM) run build

probe: build $(VENV_PY) node_modules/electron/path.txt
	node scripts/ui-probe.mjs

build-python: node_modules
	node scripts/prepare-python.mjs

dist-dir: build-python build
	npx electron-builder --dir --publish never

dist: build-python build
	npx electron-builder --publish never

clean:
	rm -rf out dist coverage backend/coverage.xml backend/.coverage resources/python
