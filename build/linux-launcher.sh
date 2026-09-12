#!/bin/sh
# Launcher of the Linux packages; scripts/after-pack.cjs installs it under the executable's name next to `stowly-bin`.
#
# Chromium's sandbox needs either unprivileged user namespaces or a root-owned setuid `chrome-sandbox`. An archive
# extracted by a user has neither on hosts that restrict user namespaces (Ubuntu 24.04 and later: an unconfined process
# may still create the namespace, but AppArmor moves it into the `unprivileged_userns` profile, which strips the
# capabilities the sandbox needs), and Electron aborts with "The SUID sandbox helper binary was found, but is not
# configured correctly". The .deb is fine: its postinst installs an AppArmor profile for this path, and the label
# carries over to the binary this script execs. When no sandbox can work, run without it and say so once on stderr.
here=$(dirname "$(readlink -f "$0")")

case " $* " in *" --no-sandbox "*) exec "$here/stowly-bin" "$@" ;; esac

sandbox_ok() {
  if [ -u "$here/chrome-sandbox" ] && [ "$(stat -c %u "$here/chrome-sandbox" 2>/dev/null)" = 0 ]; then return 0; fi
  # Ubuntu's AppArmor restriction: the namespace can be created, but an unconfined process lands in a profile without
  # capabilities, so probe the sysctl together with our own label; a profile installed by the .deb changes the label.
  label=$(cat /proc/self/attr/apparmor/current 2>/dev/null || cat /proc/self/attr/current 2>/dev/null)
  if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] && [ "$label" = unconfined ]; then return 1; fi
  # Everything else that breaks user namespaces (seccomp in containers, unprivileged_userns_clone=0, max_user_namespaces=0)
  # also breaks mapping root inside one, the probe electron-builder's AppImage launcher uses as well.
  if command -v unshare >/dev/null 2>&1 && ! unshare -Ur true 2>/dev/null; then return 1; fi
  return 0
}

if sandbox_ok; then exec "$here/stowly-bin" "$@"; fi
echo "stowly: this host restricts unprivileged user namespaces and $here/chrome-sandbox is not setuid root, so Chromium's sandbox cannot start; running with --no-sandbox. To keep the sandbox, run once: sudo chown root:root '$here/chrome-sandbox' && sudo chmod 4755 '$here/chrome-sandbox'" >&2
exec "$here/stowly-bin" --no-sandbox "$@"
