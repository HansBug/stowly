import pytest
from fastapi.testclient import TestClient

from stowly_backend.app import create_app
from stowly_backend.models import BinSpec, ItemSpec, Project, Settings

TOKEN = 'test-token'


@pytest.fixture()
def project():
    return Project(
        name='fixture', unit='mm',
        bins=[BinSpec(id='bin', name='crate', x=100, y=100, z=100, copies=5, cost=10)],
        items=[ItemSpec(id='a', name='A', x=20, y=30, z=40, copies=6), ItemSpec(id='b', name='B', x=15, y=15, z=15, copies=4, weight=1.5)],
        settings=Settings(solver='box', objective='bin-packing', timeLimit=2.0, optimizationMode='not-anytime-deterministic'),
    )


@pytest.fixture()
def client():
    with TestClient(create_app(token=TOKEN)) as c:
        yield c


@pytest.fixture()
def headers():
    return {'X-Stowly-Token': TOKEN}
