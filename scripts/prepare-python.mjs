#!/usr/bin/env node
/**
 * Put a relocatable CPython plus the backend and packingsolver3d under resources/python for electron-builder.
 *
 * Uses python-build-standalone's `install_only` archives (glibc >= 2.17 on Linux, so Ubuntu 20.04 works).
 *   node scripts/prepare-python.mjs                 # host platform
 *   node scripts/prepare-python.mjs --target linux-x64 --python 3.12
 */
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = Object.fromEntries(process.argv.slice(2).map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1]] : [])).filter((e) => e.length))
const target = args.target || `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}-${process.arch}`
const release = args.release || '20260901'
const pythonVersion = args.python || '3.12.14'
const TRIPLES = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win-x64': 'x86_64-pc-windows-msvc',
  'win-arm64': 'aarch64-pc-windows-msvc',
  'mac-arm64': 'aarch64-apple-darwin',
  'mac-x64': 'x86_64-apple-darwin'
}
const triple = TRIPLES[target]
if (!triple) throw new Error(`unknown target ${target}; one of ${Object.keys(TRIPLES).join(', ')}`)

const dest = path.join(root, 'resources', 'python')
const archive = path.join(root, 'resources', `cpython-${pythonVersion}-${triple}.tar.gz`)
const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${release}/cpython-${pythonVersion}+${release}-${triple}-install_only.tar.gz`

mkdirSync(path.dirname(archive), { recursive: true })
if (!existsSync(archive)) {
  console.log('downloading', url)
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`download failed: ${response.status}`)
  await pipeline(response.body, createWriteStream(archive))
}
rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
// The archive has a single top-level "python/" directory.
execFileSync('tar', ['-xzf', archive, '-C', path.dirname(dest)], { stdio: 'inherit' })
const python = target.startsWith('win') ? path.join(dest, 'python.exe') : path.join(dest, 'bin', 'python3')
console.log('installing backend into', python)
const pipArgs = ['-m', 'pip', 'install', '--no-cache-dir', '--upgrade', 'pip']
execFileSync(python, pipArgs, { stdio: 'inherit' })
execFileSync(python, ['-m', 'pip', 'install', '--no-cache-dir', path.join(root, 'backend'), 'packingsolver3d>=0.0.1'], { stdio: 'inherit' })
for (const junk of ['share', 'include']) rmSync(path.join(dest, junk), { recursive: true, force: true })
execFileSync(python, ['-c', 'import stowly_backend, packingsolver3d; print("backend", stowly_backend.__version__, "packingsolver3d", packingsolver3d.__version__)'], { stdio: 'inherit' })
