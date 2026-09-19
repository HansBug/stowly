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
        settings=Settings(solver='box', objective='bin-packing', timeMode='manual', timeLimit=2.0, optimizationMode='not-anytime-deterministic'),
    )


@pytest.fixture()
def client():
    with TestClient(create_app(token=TOKEN)) as c:
        yield c


@pytest.fixture()
def headers():
    return {'X-Stowly-Token': TOKEN}


@pytest.fixture()
def container_project():
    """The demo 40' HQ container with more cargo than fits: an anytime knapsack solve keeps improving for seconds, so it reports progress events."""
    cargo = [(530, 290, 370, 300, 8), (530, 230, 290, 300, 6), (430, 210, 270, 400, 4), (1200, 800, 1200, 24, 450), (1200, 1000, 1150, 12, 1100)]
    return Project(
        name='container', unit='mm',
        bins=[BinSpec(id='hq', name="40' HQ", x=12032, y=2352, z=2698, copies=1, cost=1, maxWeight=26460)],
        items=[ItemSpec(id='c%d' % i, name='cargo %d' % i, x=x, y=y, z=z, copies=c, weight=w, rotations='upright') for i, (x, y, z, c, w) in enumerate(cargo)],
        settings=Settings(solver='box', objective='knapsack', timeMode='manual', timeLimit=1.5, optimizationMode='anytime'),
    )
