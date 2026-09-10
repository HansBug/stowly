import io

import pytest
from openpyxl import Workbook

from stowly_backend.importers import ImportError_, cargo_list, import_files, packingsolver_csv, rows_from_csv, thpack_instances

CN_CSV = '品名,长,宽,高,数量,重量,可旋转\n纸箱A,530,290,370,10,8.5,是\n纸箱B,43,21,27,5,,直立\n'
EN_CSV = 'SKU;Length (mm);Width (mm);Height (mm);Qty;Weight\nX1;600;400;300;12;7\n'
THPACK = '2\n1 2502505\n587 233 220\n2\n1 108 1 76 1 30 1 40\n2 110 1 43 0 25 1 33\n2 2502506\n587 233 220\n1\n1 50 0 40 0 30 1 10\n'
PS_ITEMS = 'ID,X,Y,Z,COPIES,ROTATION_XYZ,ROTATION_YXZ,ROTATION_ZYX,ROTATION_YZX,ROTATION_XZY,ROTATION_ZXY\n0,20,30,40,6,1,1,0,0,0,0\n1,15,15,15,4,1,0,0,0,0,0\n'
PS_BINS = 'ID,X,Y,Z,COST,COPIES\n0,100,100,100,10,5\n'


def test_cargo_list_chinese_headers():
    project = cargo_list(rows_from_csv(CN_CSV), unit='mm')
    assert [i.name for i in project.items] == ['纸箱A', '纸箱B']
    assert (project.items[0].x, project.items[0].y, project.items[0].z, project.items[0].copies) == (530, 290, 370, 10)
    assert project.items[0].weight == 8.5 and project.items[0].rotations == 'all'
    assert project.items[1].weight is None and project.items[1].rotations == 'upright'


def test_cargo_list_units_and_semicolons():
    project = cargo_list(rows_from_csv(EN_CSV), unit='cm')
    item = project.items[0]
    assert (item.x, item.y, item.z) == (6000, 4000, 3000) and item.copies == 12 and item.weight == 7.0


def test_cargo_list_requires_dimensions():
    with pytest.raises(ImportError_, match='could not find'):
        cargo_list([['name', 'qty'], ['a', '1']])
    with pytest.raises(ImportError_, match='no data rows'):
        cargo_list([['name']])


def test_xlsx_roundtrip():
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['Name', 'L', 'W', 'H', 'Quantity'])
    sheet.append(['pallet', 1200, 800, 144, 3])
    sheet.append([None, None, None, None, None])
    buffer = io.BytesIO()
    workbook.save(buffer)
    project = import_files([('cargo.xlsx', buffer.getvalue())], unit='mm')
    assert project.items[0].name == 'pallet' and project.items[0].x == 1200 and project.items[0].copies == 3


def test_thpack_two_instances_with_seed():
    projects = thpack_instances(THPACK)
    assert len(projects) == 2
    first = projects[0]
    assert (first.bins[0].x, first.bins[0].y, first.bins[0].z) == (587, 233, 220)
    assert [i.copies for i in first.items] == [40, 33] and first.items[0].rotations == 'all'
    assert projects[1].items[0].rotations == 'upright'
    assert first.bins[0].copies == 73


def test_thpack_without_seed():
    projects = thpack_instances('1\n1\n100 100 100\n1\n1 10 1 10 1 10 1 5\n')
    assert projects[0].items[0].copies == 5 and projects[0].bins[0].x == 100


def test_packingsolver_csv_pair_and_rotation_tokens():
    project = packingsolver_csv(PS_ITEMS, PS_BINS)
    assert project.items[0].rotations == 'upright' and project.items[1].rotations == 'fixed'
    assert project.bins[0].cost == 10.0 and project.bins[0].copies == 5


def test_import_files_detects_formats():
    two = import_files([('items.csv', PS_ITEMS.encode()), ('bins.csv', PS_BINS.encode())])
    assert two.bins and len(two.items) == 2
    br = import_files([('thpack1.txt', THPACK.encode())], instance_index=1)
    assert br.name == 'thpack 2'
    csv_project = import_files([('cargo.csv', CN_CSV.encode('utf-8-sig'))])
    assert len(csv_project.items) == 2
    project_json = import_files([('p.json', b'{"schema": "stowly/1", "name": "x", "bins": [], "items": []}')])
    assert project_json.name == 'x'
    with pytest.raises(ImportError_, match='not a Stowly project'):
        import_files([('p.json', b'{"foo": 1}')])
    with pytest.raises(ImportError_, match='out of range'):
        import_files([('thpack1.txt', THPACK.encode())], instance_index=5)
    with pytest.raises(ImportError_, match='unsupported'):
        import_files([('x.bin', b'\x00\x01')])
    with pytest.raises(ImportError_, match='no file'):
        import_files([])
