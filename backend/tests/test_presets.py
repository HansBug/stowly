import re

from stowly_backend.presets import load_presets

ID = re.compile(r'^[a-z0-9][a-z0-9\-]*$')


def test_presets_are_well_formed():
    presets = load_presets()
    for kind in ('containers', 'items'):
        ids = [entry['id'] for entry in presets[kind]]
        assert len(ids) == len(set(ids)), 'duplicate ids in %s' % kind
        for entry in presets[kind]:
            assert ID.match(entry['id']), entry['id']
            assert entry['category'] and entry['name']['zh'] and entry['name']['en']
            assert entry['x'] > 0 and entry['y'] > 0 and entry['z'] > 0
            assert entry.get('source'), 'every preset cites its source: %s' % entry['id']
            if kind == 'containers':
                assert entry['openSides'] and set(entry['openSides']) <= {'x-min', 'x-max', 'y-min', 'y-max', 'top'}, entry['id']
            if 'maxWeight' in entry and entry['maxWeight'] is not None:
                assert entry['maxWeight'] > 0


def test_presets_cover_the_expected_families():
    presets = load_presets()
    categories = {entry['category'] for entry in presets['containers']}
    assert {'iso-container', 'truck-cn', 'truck-eu-us', 'pallet'} <= categories
    item_categories = {entry['category'] for entry in presets['items']}
    assert {'postal-carton-cn', 'klt-vda', 'load-unit'} <= item_categories
