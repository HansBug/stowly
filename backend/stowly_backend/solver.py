"""Turn a project into a packingsolver3d instance, solve it in a worker thread and hand back plain values."""
import threading
import uuid
from typing import Dict, List

from packingsolver3d import ALL_ROTATIONS, BinType, Instance, ItemType, Objective, OptimizationMode, Rotation, box, boxstacks
from packingsolver3d.errors import PackingSolverError

from .models import ItemCount, JobState, PackedBin, Placement, Project, SolveResult

ROTATIONS = {
    'all': list(ALL_ROTATIONS),
    'upright': [Rotation.XYZ, Rotation.YXZ],
    'fixed': [Rotation.XYZ],
}
OBJECTIVES = {
    'bin-packing': Objective.BIN_PACKING,
    'knapsack': Objective.KNAPSACK,
    'variable-sized-bin-packing': Objective.VARIABLE_SIZED_BIN_PACKING,
}
MODES = {
    'anytime': OptimizationMode.ANYTIME,
    'not-anytime': OptimizationMode.NOT_ANYTIME,
    'not-anytime-deterministic': OptimizationMode.NOT_ANYTIME_DETERMINISTIC,
    'not-anytime-sequential': OptimizationMode.NOT_ANYTIME_SEQUENTIAL,
}


def build_instance(project: Project) -> Instance:
    """Map the project onto packingsolver3d's model. Millimetres in, millimetres out."""
    stacked = project.settings.solver == 'boxstacks'
    bins = [
        BinType(x=b.x, y=b.y, z=b.z, copies=b.copies, cost=b.cost, maximum_weight=b.maxWeight if stacked and b.maxWeight else None)
        for b in project.bins
    ]
    if not stacked:
        bins = [BinType(x=b.x, y=b.y, z=b.z, copies=b.copies, cost=b.cost, maximum_weight=b.maxWeight) for b in project.bins]
    items = []
    for index, item in enumerate(project.items):
        extra = {}
        if stacked:
            # boxstacks groups item types into stacks by (group_id, stackability_id) without comparing footprints, so
            # every item type gets its own stackability id: copies of one type stack, different types never do.
            extra = dict(stackability_id=index, weight=item.weight or 0.0)
        elif item.weight is not None:
            extra = dict(weight=item.weight)
        items.append(ItemType(x=item.x, y=item.y, z=item.z, copies=item.copies, profit=item.profit,
                              rotations=ROTATIONS[item.rotations], **extra))
    return Instance(bin_types=bins, item_types=items, objective=OBJECTIVES[project.settings.objective])


def solve_project(project: Project) -> SolveResult:
    """Run the configured solver and translate the result into project ids and per-bin summaries."""
    instance = build_instance(project)
    engine = boxstacks if project.settings.solver == 'boxstacks' else box
    result = engine.solve(instance, time_limit=project.settings.timeLimit, optimization_mode=MODES[project.settings.optimizationMode])
    packed_bins: List[PackedBin] = []
    counts = {item.id: 0 for item in project.items}
    for packed in result.bins:
        bin_spec = project.bins[packed.bin_type_id]
        placements = []
        volume = 0
        weight = 0.0
        for p in packed.placements:
            item = project.items[p.item_type_id]
            placements.append(Placement(itemId=item.id, itemIndex=p.item_type_id, x=p.x, y=p.y, z=p.z, lx=p.lx, ly=p.ly, lz=p.lz,
                                        rotation=p.rotation.value if p.rotation else 'XYZ'))
            volume += p.lx * p.ly * p.lz
            weight += item.weight or 0.0
            counts[item.id] += packed.copies
        packed_bins.append(PackedBin(binId=bin_spec.id, binIndex=packed.bin_type_id, copies=packed.copies, x=packed.x, y=packed.y, z=packed.z,
                                     placements=placements, volumeUtilization=volume / float(packed.x * packed.y * packed.z), weight=weight))
    return SolveResult(
        status=result.status.value, objective=project.settings.objective, value=result.value, bound=result.bound,
        solveTime=result.solve_time, wallTime=result.run.wall_time if result.run else 0.0, bins=packed_bins,
        counts=[ItemCount(itemId=item.id, packed=counts[item.id], total=item.copies) for item in project.items],
        statistics=dict(result.statistics), options=dict(result.run.options) if result.run else {},
    )


class JobManager:
    """In-memory solve jobs: one thread per job, results kept until the client forgets them."""

    def __init__(self):
        self._jobs: Dict[str, JobState] = {}
        self._lock = threading.Lock()

    def start(self, project: Project) -> JobState:
        job = JobState(id=uuid.uuid4().hex, status='running')
        with self._lock:
            self._jobs[job.id] = job
        threading.Thread(target=self._run, args=(job.id, project), daemon=True).start()
        return job

    def _run(self, job_id: str, project: Project) -> None:
        try:
            result = solve_project(project)
            update = dict(status='done', result=result)
        except (PackingSolverError, ValueError) as err:
            update = dict(status='failed', error=str(err))
        except Exception as err:  # pragma: no cover - defensive: anything else still ends the job
            update = dict(status='failed', error='%s: %s' % (type(err).__name__, err))
        with self._lock:
            self._jobs[job_id] = self._jobs[job_id].model_copy(update=update)

    def get(self, job_id: str):
        with self._lock:
            return self._jobs.get(job_id)

    def forget(self, job_id: str) -> bool:
        with self._lock:
            return self._jobs.pop(job_id, None) is not None
