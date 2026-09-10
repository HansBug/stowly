// Stand-in for `python -m stowly_backend` in tests. FAKE_MODE selects the behaviour; the CLI arguments are those the app passes.
const mode = process.env.FAKE_MODE || 'ready'
const token = process.argv[process.argv.indexOf('--token') + 1]
if (mode === 'exit') process.exit(3)
if (mode === 'ready') {
  process.stderr.write('INFO: warming up\n')
  process.stdout.write(`noise before the handshake\nREADY {"host": "127.0.0.1", "port": 43210, "token_seen": "${token}"}\n`)
  setInterval(() => undefined, 1000) // stay alive until killed
}
// 'silent': print nothing and stay alive so the caller's timeout fires
if (mode === 'silent') setInterval(() => undefined, 1000)
