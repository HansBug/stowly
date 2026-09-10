"""Entry point used by the Electron main process: ``python -m stowly_backend --port 0 --token <secret>``.

The chosen port is announced on stdout as one JSON line prefixed with ``READY`` so the shell can find the server. The
socket is bound and listening *before* that line is printed: a client that connects the moment it reads READY must never be
refused, even if uvicorn has not started accepting yet (its backlog holds the connection). Printing first and binding
later lost that race on slow machines and showed up as "fetch failed" right after start-up.
"""
import argparse
import json
import socket
import sys

import uvicorn

from .app import create_app


def listen(host: str, port: int) -> socket.socket:
    """Bind and listen on ``host:port`` (0 picks a free port) and hand the socket to the caller."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if sys.platform != 'win32':
        # Same as uvicorn's own default; on Windows SO_REUSEADDR would let another process hijack the port.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, port))
    sock.listen(128)
    return sock


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=0, help='0 picks a free port')
    parser.add_argument('--token', default='', help='value the client must send in X-Stowly-Token')
    args = parser.parse_args(argv)
    sock = listen(args.host, args.port)
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(create_app(token=args.token), host=args.host, port=port, log_level='warning'))
    print('READY ' + json.dumps({'host': args.host, 'port': port}), flush=True)
    server.run(sockets=[sock])
    return 0


if __name__ == '__main__':  # pragma: no cover - exercised through the subprocess test
    sys.exit(main())
