"""Importers for the formats people already have their cargo in.

* Stowly project JSON (``schema: stowly/1``);
* cargo lists as CSV or XLSX, columns recognised by header synonyms in English and Chinese;
* ESICUP / OR-Library ``thpack`` (Bischoff-Ratcliff, Davies, Ivancic) text instances;
* PackingSolver ``items.csv`` + ``bins.csv`` pairs.

Every importer returns a :class:`Project` in millimetres; the caller merges it into the open project.
"""
import csv
import io
import json
import re
from typing import Dict, Iterable, List, Optional, Sequence

from .models import BinSpec, ItemSpec, Project

UNIT_TO_MM = {'mm': 1.0, 'cm': 10.0, 'm': 1000.0, 'in': 25.4}

#: Header synonyms (lower-cased, spaces and underscores removed) for the cargo-list columns.
SYNONYMS = {
    'name': ('name', 'item', 'itemname', 'description', 'desc', 'sku', 'product', 'productid', 'cargo', 'id', '名称', '品名', '货物', '货物名称', '物品', '商品', '编号'),
    'x': ('length', 'len', 'l', 'x', 'depth', 'd', '长', '长度'),
    'y': ('width', 'wid', 'w', 'y', '宽', '宽度'),
    'z': ('height', 'hgt', 'h', 'z', '高', '高度'),
    'copies': ('quantity', 'qty', 'count', 'copies', 'pieces', 'pcs', 'number', 'n', '数量', '件数', '个数'),
    'weight': ('weight', 'wt', 'kg', 'mass', 'unitweight', '重量', '单件重量', '毛重'),
    'profit': ('profit', 'value', 'price', 'priority', '利润', '价值', '价格'),
    'rotation': ('rotation', 'rotate', 'rotatable', 'orientation', 'tiltable', 'sideupok', '可旋转', '旋转', '朝向'),
}


class ImportError_(ValueError):
    """Raised when a file cannot be read as any supported format; the message is shown to the user."""


def _norm(header: str) -> str:
    text = re.sub(r'[\(（\[].*?[\)）\]]', '', str(header or ''))  # drop unit hints such as "(mm)"
    return re.sub(r'[\s_\-]+', '', text).strip().lower()


def _column_map(headers: Sequence[str]) -> Dict[str, int]:
    found: Dict[str, int] = {}
    normalised = [_norm(h) for h in headers]
    for field, names in SYNONYMS.items():
        for index, header in enumerate(normalised):
            if header in names and field not in found and index not in found.values():
                found[field] = index
                break
    return found


def _to_mm(value, factor: float) -> int:
    number = float(str(value).strip().replace(',', ''))
    return int(round(number * factor))


def _rotation_token(value) -> str:
    text = str(value or '').strip().lower()
    if text in ('', 'all', 'any', 'yes', 'y', 'true', '1', '6', '是', '全部', '任意'):
        return 'all'
    if text in ('upright', 'vertical', 'thissideup', 'this side up', 'z', '2', '直立', '立放', '不可倒置'):
        return 'upright'
    return 'fixed'


def rows_from_csv(text: str) -> List[List[str]]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
    except csv.Error:
        dialect = csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect) if any(cell.strip() for cell in row)]


def rows_from_xlsx(content: bytes) -> List[List[str]]:
    from openpyxl import load_workbook
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.worksheets[0]
    rows = []
    for row in sheet.iter_rows(values_only=True):
        cells = ['' if value is None else str(value) for value in row]
        if any(cell.strip() for cell in cells):
            rows.append(cells)
    return rows


def cargo_list(rows: List[List[str]], unit: str = 'mm', name: str = '') -> Project:
    """Cargo list with a header row: name, length, width, height, quantity and optional weight/profit/rotation."""
    if len(rows) < 2:
        raise ImportError_('the table has no data rows')
    columns = _column_map(rows[0])
    missing = [field for field in ('x', 'y', 'z') if field not in columns]
    if missing:
        raise ImportError_('could not find the columns for %s in the header %r' % (', '.join(missing), rows[0]))
    factor = UNIT_TO_MM[unit]
    items = []
    for number, row in enumerate(rows[1:], start=1):
        def cell(field, default=''):
            index = columns.get(field)
            return row[index] if index is not None and index < len(row) else default
        if not str(cell('x')).strip():
            continue
        copies_text = str(cell('copies', '1')).strip() or '1'
        items.append(ItemSpec(
            id='item-%d' % number,
            name=str(cell('name', '')).strip() or 'item %d' % number,
            x=_to_mm(cell('x'), factor), y=_to_mm(cell('y'), factor), z=_to_mm(cell('z'), factor),
            copies=max(1, int(float(copies_text))),
            weight=float(str(cell('weight')).replace(',', '')) if str(cell('weight')).strip() else None,
            profit=float(str(cell('profit')).replace(',', '')) if str(cell('profit')).strip() else None,
            rotations=_rotation_token(cell('rotation')),
        ))
    if not items:
        raise ImportError_('no item rows found')
    return Project(name=name, unit='mm', items=items)


def thpack_instances(text: str) -> List[Project]:
    """Parse an ESICUP/OR-Library thpack file (BR1-15, thpack8/9) into one project per instance."""
    tokens = text.split()
    numbers: List[str] = []
    for token in tokens:
        numbers.append(token)
    pos = 0

    def take(n: int) -> List[str]:
        nonlocal pos
        chunk = numbers[pos:pos + n]
        if len(chunk) < n:
            raise ImportError_('unexpected end of thpack file')
        pos += n
        return chunk
    count = int(take(1)[0])
    projects = []
    for _ in range(count):
        header = take(1)  # problem number, optionally followed by a seed on the same line
        # The seed is present in thpack1-7 (two numbers) and absent in thpack8/9 (one number): peek at the
        # container line, which always has three numbers followed by the type count.
        if pos + 4 < len(numbers) and pos + 5 < len(numbers):
            pass
        # Decide whether a seed follows: after the header the container line has exactly 3 numbers, then n.
        # With a seed present the next token is the seed; without it, the next 3 tokens are the container.
        # Heuristic used by every published parser: try "seed + L W H n" and check that n item lines follow with 8 fields.
        save = pos
        seed_present = False
        try:
            take(1)  # seed
            container = [int(v) for v in take(3)]
            types = int(take(1)[0])
            probe = pos
            for _ in range(types):
                take(8)
            pos = probe
            seed_present = True
        except (ImportError_, ValueError):
            pos = save
        if not seed_present:
            container = [int(v) for v in take(3)]
            types = int(take(1)[0])
        items = []
        for _ in range(types):
            row = take(8)
            type_id, length, vl, width, vw, height, vh, copies = (int(float(v)) for v in row)
            flags = (vl, vw, vh)
            rotations = 'all' if flags == (1, 1, 1) else ('upright' if flags == (0, 0, 1) else 'all')
            items.append(ItemSpec(id='type-%d' % type_id, name='type %d' % type_id, x=length, y=width, z=height, copies=copies, rotations=rotations))
        bins = [BinSpec(id='container', name='container %s' % header[0], x=container[0], y=container[1], z=container[2], copies=max(1, sum(i.copies for i in items)))]
        projects.append(Project(name='thpack %s' % header[0], unit='mm', bins=bins, items=items))
    return projects


def packingsolver_csv(items_text: str, bins_text: Optional[str] = None) -> Project:
    """PackingSolver's own ``items.csv`` / ``bins.csv`` (ID,X,Y,Z plus optional PROFIT, WEIGHT, COPIES, COST, ROTATION_*)."""
    def rows(text):
        return [row for row in csv.DictReader(io.StringIO(text)) if any((v or '').strip() for v in row.values())]
    items = []
    for number, row in enumerate(rows(items_text)):
        flags = {key[len('ROTATION_'):]: (row.get(key) or '0').strip() == '1' for key in row if key.startswith('ROTATION_')}
        if not flags or all(flags.values()):
            rotations = 'all' if (not flags or all(flags.values())) else 'fixed'
        else:
            allowed = {k for k, v in flags.items() if v}
            rotations = 'upright' if allowed == {'XYZ', 'YXZ'} else ('fixed' if allowed == {'XYZ'} else 'all')
        items.append(ItemSpec(id=str(row.get('ID') or number), name=str(row.get('ID') or 'item %d' % number),
                              x=int(row['X']), y=int(row['Y']), z=int(row['Z']),
                              copies=int(row.get('COPIES') or 1), weight=float(row['WEIGHT']) if (row.get('WEIGHT') or '').strip() else None,
                              profit=float(row['PROFIT']) if (row.get('PROFIT') or '').strip() else None, rotations=rotations))
    bins = []
    if bins_text:
        for number, row in enumerate(rows(bins_text)):
            bins.append(BinSpec(id=str(row.get('ID') or number), name=str(row.get('ID') or 'bin %d' % number), x=int(row['X']), y=int(row['Y']), z=int(row['Z']),
                                copies=int(row.get('COPIES') or 1), cost=float(row['COST']) if (row.get('COST') or '').strip() else None,
                                maxWeight=float(row['MAXIMUM_WEIGHT']) if (row.get('MAXIMUM_WEIGHT') or '').strip() else None))
    return Project(name='packingsolver', unit='mm', bins=bins, items=items)


def looks_like_packingsolver_csv(text: str) -> bool:
    first = text.splitlines()[0] if text.strip() else ''
    columns = {c.strip().upper() for c in first.split(',')}
    return {'ID', 'X', 'Y', 'Z'} <= columns


def import_files(files: Sequence, unit: str = 'mm', instance_index: int = 0) -> Project:
    """Detect the format of the uploaded file(s) and return one project.

    ``files`` is a sequence of ``(filename, bytes)``. Two PackingSolver CSVs travel together; every other format is one file.
    """
    if not files:
        raise ImportError_('no file received')
    named = {name.lower(): data for name, data in files}
    if len(files) == 2 and all(n.endswith('.csv') for n in named):
        texts = {n: d.decode('utf-8-sig') for n, d in named.items()}
        if all(looks_like_packingsolver_csv(t) for t in texts.values()):
            items_name = next((n for n in texts if 'item' in n), None)
            bins_name = next((n for n in texts if 'bin' in n), None)
            if items_name and bins_name:
                return packingsolver_csv(texts[items_name], texts[bins_name])
    name, data = files[0]
    lower = name.lower()
    if lower.endswith('.json'):
        payload = json.loads(data.decode('utf-8-sig'))
        if not str(payload.get('schema', '')).startswith('stowly/'):
            raise ImportError_('this JSON file is not a Stowly project')
        return Project.model_validate(payload)
    if lower.endswith(('.xlsx', '.xlsm')):
        return cargo_list(rows_from_xlsx(data), unit=unit, name=name)
    text = data.decode('utf-8-sig', errors='replace')
    if lower.endswith('.csv'):
        if looks_like_packingsolver_csv(text):
            return packingsolver_csv(text)
        return cargo_list(rows_from_csv(text), unit=unit, name=name)
    if lower.endswith(('.txt', '.dat', '.thpack')) or re.match(r'^\s*\d+\s*\n', text):
        instances = thpack_instances(text)
        if not 0 <= instance_index < len(instances):
            raise ImportError_('instance index %d out of range, the file has %d instances' % (instance_index, len(instances)))
        return instances[instance_index]
    raise ImportError_('unsupported file type: %s' % name)
