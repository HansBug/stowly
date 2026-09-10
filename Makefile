# Stowly developer entry points. `make help` lists them.
SHELL := /bin/bash
PYTHON ?= python3
VENV   ?= .venv
VENV_PY := $(abspath $(VENV)/bin/python)
NPM    ?= npm

.PHONY: help setup setup-python setup-node run test test-backend test-frontend typecheck build build-python dist dist-dir clean

help:
	@echo "Stowly"
	@echo "  make setup         - create $(VENV) with the backend + test deps, and npm ci"
	@echo "  make run           - start the app in development mode (Electron + Vite hot reload, backend from $(VENV))"
	@echo "  make test          - backend pytest with coverage + frontend vitest with coverage + typecheck"
	@echo "  make build         - build the renderer/main/preload bundles into out/"
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

run: $(VENV_PY) node_modules
	$(NPM) run dev

typecheck: node_modules
	$(NPM) run typecheck

test-backend: $(VENV_PY)
	cd backend && $(VENV_PY) -m pytest --cov --cov-report=term-missing --cov-report=xml

test-frontend: node_modules
	$(NPM) run test:coverage

test: test-backend test-frontend typecheck

build: node_modules
	$(NPM) run build

build-python: node_modules
	node scripts/prepare-python.mjs

dist-dir: build-python build
	npx electron-builder --dir --publish never

dist: build-python build
	npx electron-builder --publish never

clean:
	rm -rf out dist coverage backend/coverage.xml backend/.coverage resources/python
