/**
 * electron-builder afterPack hook. On Linux the packaged executable becomes `stowly-bin` and build/linux-launcher.sh takes
 * its name, so `./stowly` from the portable archive, the AppImage's AppRun, the .desktop entry and /usr/bin/stowly from the
 * .deb all pass through the sandbox check in that script. The other platforms are left alone.
 */
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return
  const name = context.packager.executableName
  const launcher = path.join(context.appOutDir, name)
  fs.renameSync(launcher, path.join(context.appOutDir, `${name}-bin`))
  fs.copyFileSync(path.join(__dirname, '..', 'build', 'linux-launcher.sh'), launcher)
  fs.chmodSync(launcher, 0o755)
}
