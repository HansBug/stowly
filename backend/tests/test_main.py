"""The READY handshake: the port must accept connections the moment READY is printed."""
import http.client
import json
import os
import socket
import subprocess
import sys

import uvicorn

from stowly_backend.__main__ import listen, main


def test_listen_picks_a_free_port_that_accepts_connections():
    sock = listen('127.0.0.1', 0)
    try:
        port = sock.getsockname()[1]
        assert port > 0
        # Nothing calls accept() yet; the kernel backlog still completes the handshake.
        with socket.create_connection(('127.0.0.1', port), timeout=2):
            pass
    finally:
        sock.close()


def test_main_announces_the_port_before_serving(monkeypatch, capsys):
    seen = {}

    def fake_run(self, sockets=None):
        seen['sockets'] = sockets
        seen['printed'] = capsys.readouterr().out

    monkeypatch.setattr(uvicorn.Server, 'run', fake_run)
    assert main(['--port', '0', '--token', 'secret']) == 0
    line = seen['printed'].strip()
    assert line.startswith('READY ')
    payload = json.loads(line[len('READY '):])
    assert payload['host'] == '127.0.0.1'
    assert seen['sockets'][0].getsockname()[1] == payload['port']
    seen['sockets'][0].close()


def test_subprocess_is_connectable_right_after_ready():
    env = dict(os.environ, PYTHONUNBUFFERED='1')
    proc = subprocess.Popen([sys.executable, '-m', 'stowly_backend', '--port', '0', '--token', 't'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    try:
        line = proc.stdout.readline()
        assert line.startswith('READY '), line
        port = json.loads(line[len('READY '):])['port']
        # No sleep on purpose: this is the race the Electron main process and the smoke test hit.
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
        conn.request('GET', '/api/health')
        response = conn.getresponse()
        assert response.status == 200
        assert json.loads(response.read())['status'] == 'ok'
        conn.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
