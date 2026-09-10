import time

import pytest

from stowly_backend.exporters import COLUMNS


def test_health_is_public(client):
    body = client.get('/api/health').json()
    assert body['status'] == 'ok' and len(body['upstream']) == 40


def test_token_required(client):
    assert client.get('/api/presets').status_code == 401
    assert client.get('/api/presets', headers={'X-Stowly-Token': 'wrong'}).status_code == 401


def test_presets(client, headers):
    body = client.get('/api/presets', headers=headers).json()
    assert body['containers'] and body['items']


def test_solve_job_roundtrip_and_export(client, headers, project):
    job = client.post('/api/solve', headers=headers, json=project.model_dump(by_alias=True)).json()
    assert job['status'] == 'running'
    for _ in range(200):
        state = client.get('/api/jobs/%s' % job['id'], headers=headers).json()
        if state['status'] != 'running':
            break
        time.sleep(0.05)
    assert state['status'] == 'done' and state['result']['status'] == 'optimal'
    csv_text = client.post('/api/export/placements', headers=headers, json={'project': project.model_dump(by_alias=True), 'result': state['result']}).text
    lines = csv_text.strip().splitlines()
    assert lines[0] == ','.join(COLUMNS) and len(lines) == 11
    assert client.delete('/api/jobs/%s' % job['id'], headers=headers).json()['forgotten'] is True
    assert client.get('/api/jobs/%s' % job['id'], headers=headers).status_code == 404


def test_solve_rejects_empty_project(client, headers, project):
    empty = project.model_copy(update={'items': []})
    assert client.post('/api/solve', headers=headers, json=empty.model_dump(by_alias=True)).status_code == 422


def test_import_endpoint(client, headers):
    files = [('files', ('cargo.csv', b'name,length,width,height,qty\nbox,10,20,30,2\n', 'text/csv'))]
    body = client.post('/api/import', headers=headers, files=files, data={'unit': 'cm'}).json()
    assert body['items'][0]['x'] == 100 and body['items'][0]['copies'] == 2
    bad = client.post('/api/import', headers=headers, files=[('files', ('x.bin', b'\x00', 'application/octet-stream'))])
    assert bad.status_code == 422
