"""Export helpers: the placements of a result as CSV, one row per placed box."""
import csv
import io

from .models import Project, SolveResult

COLUMNS = ['bin', 'bin_name', 'bin_copies', 'item', 'item_name', 'x', 'y', 'z', 'lx', 'ly', 'lz', 'rotation']


def placements_csv(project: Project, result: SolveResult) -> str:
    names = {item.id: item.name for item in project.items}
    bin_names = {b.id: b.name for b in project.bins}
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(COLUMNS)
    for packed in result.bins:
        for p in packed.placements:
            writer.writerow([packed.binId, bin_names.get(packed.binId, ''), packed.copies, p.itemId, names.get(p.itemId, ''),
                             p.x, p.y, p.z, p.lx, p.ly, p.lz, p.rotation])
    return out.getvalue()
