"""Entry point used by the Electron main process: ``python -m stowly_backend --port 0 --token <secret>``.

The chosen port is announced on stdout as one JSON line prefixed with ``READY`` so the shell can find the server.
"""
import argparse
import json
import socket
import sys

import uvicorn

from .app import create_app


def pick_port(host: str, port: int) -> int:
    if port:
        return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=0, help='0 picks a free port')
    parser.add_argument('--token', default='', help='value the client must send in X-Stowly-Token')
    args = parser.parse_args(argv)
    port = pick_port(args.host, args.port)
    app = create_app(token=args.token)
    print('READY ' + json.dumps({'host': args.host, 'port': port}), flush=True)
    uvicorn.run(app, host=args.host, port=port, log_level='warning')
    return 0


if __name__ == '__main__':
    sys.exit(main())
