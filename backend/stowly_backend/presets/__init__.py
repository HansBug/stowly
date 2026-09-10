"""Built-in container and item presets. Data lives in the JSON files next to this module; SOURCES.md says where each number comes from."""
import json
import os
from functools import lru_cache
from typing import Any, Dict

HERE = os.path.dirname(os.path.abspath(__file__))


@lru_cache(maxsize=1)
def load_presets() -> Dict[str, Any]:
    with open(os.path.join(HERE, 'containers.json'), encoding='utf-8') as handle:
        containers = json.load(handle)
    with open(os.path.join(HERE, 'items.json'), encoding='utf-8') as handle:
        items = json.load(handle)
    return {'containers': containers, 'items': items}
