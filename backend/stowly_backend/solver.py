"""Turn a project into a packingsolver3d instance, solve it in a worker thread and hand back plain values."""
import threading
import time
import uuid
from typing import Callable, Dict, List, Optional

from packingsolver3d import ALL_ROTATIONS, BinType, Instance, ItemType, Objective, OptimizationMode, Rotation, UnloadingConstraint, box, boxstacks, \
    recommend_time_budget
from packingsolver3d.errors import PackingSolverError

from .models import Budget, ItemCount, JobState, PackedBin, Placement, Progress, ProgressEvent, Project, SolveResult

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
UNLOADING = {c.value: c for c in UnloadingConstraint}


def build_instance(project: Project) -> Instance:
    """Map the project onto packingsolver3d's model. Millimetres in, millimetres out.

    ``box`` has no stacking model at all, so its instance carries dimensions, copies, profit, weight and rotations only.
    ``boxstacks`` keeps items upright (upstream places XYZ/YXZ only and its algorithm degrades badly when tipping rotations
    are offered), so "any" rotation becomes "upright" there; every item type gets its own ``stackability_id`` so copies of
    one type stack and different types never do; the stacking fields, the floor-load limit and the unloading constraint
    are forwarded.
    """
    stacked = project.settings.solver == 'boxstacks'
    bins = []
    for b in project.bins:
        extra = {}
        if stacked and b.maxStackDensity:
            extra['maximum_stack_density'] = b.maxStackDensity / 1e6  # kg/m² -> kg/mm²
        bins.append(BinType(x=b.x, y=b.y, z=b.z, copies=b.copies, cost=b.cost, maximum_weight=b.maxWeight, **extra))
    items = []
    for index, item in enumerate(project.items):
        rotations = ROTATIONS['upright'] if stacked and item.rotations == 'all' else ROTATIONS[item.rotations]
        extra = {}
        if stacked:
            extra = dict(stackability_id=index, weight=item.weight or 0.0, group_id=item.group)
            if item.maxStack is not None:
                extra['maximum_stackability'] = item.maxStack
            if item.maxWeightAbove is not None:
                extra['maximum_weight_above'] = item.maxWeightAbove
            if item.nestingHeight:
                extra['nesting_height'] = item.nestingHeight
        elif item.weight is not None:
            extra = dict(weight=item.weight)
        items.append(ItemType(x=item.x, y=item.y, z=item.z, copies=item.copies, profit=item.profit, rotations=rotations, **extra))
    unloading = UNLOADING[project.settings.unloadingConstraint] if stacked and project.settings.unloadingConstraint != 'none' else None
    return Instance(bin_types=bins, item_types=items, objective=OBJECTIVES[project.settings.objective], unloading_constraint=unloading)


def budget_for(project: Project, instance: Optional[Instance] = None) -> Budget:
    """The stopping policy of a solve: ``auto`` takes packingsolver3d's recommendation for this instance, ``manual`` the stored values.

    Even in manual mode the recommendation is computed, so the interface can show the predicted algorithm path and first
    solution next to the user's numbers.
    """
    settings = project.settings
    recommended = recommend_time_budget(instance or build_instance(project), settings.solver, alpha=settings.alpha, speed=settings.speed)
    if settings.timeMode == 'auto':
        return Budget(source='auto', timeLimit=recommended.time_limit, stopWhenUnimprovedFor=recommended.stop_when_unimproved_for,
                      stopWhenUnimprovedAfter=recommended.stop_when_unimproved_after, path=recommended.path, latency=recommended.latency,
                      typicalLatency=recommended.typical_latency, improvement=recommended.improvement, alpha=recommended.alpha, speed=recommended.speed)
    return Budget(source='manual', timeLimit=settings.timeLimit, stopWhenUnimprovedFor=settings.stopWhenUnimprovedFor,
                  stopWhenUnimprovedAfter=settings.stopWhenUnimprovedAfter, path=recommended.path, latency=recommended.latency,
                  typicalLatency=recommended.typical_latency, improvement=recommended.improvement, alpha=recommended.alpha, speed=recommended.speed)


def solve_project(project: Project, budget: Optional[Budget] = None, on_event: Optional[Callable[[ProgressEvent], None]] = None) -> SolveResult:
    """Run the configured solver under ``budget`` (default: :func:`budget_for`) and translate the result into project ids and per-bin summaries."""
    instance = build_instance(project)
    budget = budget or budget_for(project, instance)
    engine = boxstacks if project.settings.solver == 'boxstacks' else box
    first_solution: List[float] = []

    def forward(event) -> None:
        if not first_solution:
            first_solution.append(event.time)
        if on_event is not None:
            on_event(ProgressEvent(time=event.time, items=event.number_of_items, bins=event.number_of_bins, profit=event.profit, cost=event.cost, label=event.label))

    options = dict(time_limit=budget.timeLimit, optimization_mode=MODES[project.settings.optimizationMode], progress_callback=forward)
    if budget.stopWhenUnimprovedFor is not None:
        options['stop_when_unimproved_for'] = budget.stopWhenUnimprovedFor
        if budget.stopWhenUnimprovedAfter is not None:
            options['stop_when_unimproved_after'] = budget.stopWhenUnimprovedAfter
    result = engine.solve(instance, **options)
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
        status=result.status.value, solver=project.settings.solver, objective=project.settings.objective, value=result.value, bound=result.bound,
        solveTime=result.solve_time, wallTime=result.run.wall_time if result.run else 0.0, bins=packed_bins,
        counts=[ItemCount(itemId=item.id, packed=counts[item.id], total=item.copies) for item in project.items],
        statistics=dict(result.statistics), options=dict(result.run.options) if result.run else {},
        stopReason=result.run.stop_reason if result.run else None, firstSolutionTime=first_solution[0] if first_solution else None,
    )


class JobManager:
    """In-memory solve jobs: one thread per job, results kept until the client forgets them."""

    def __init__(self):
        self._jobs: Dict[str, JobState] = {}
        self._lock = threading.Lock()

    def start(self, project: Project) -> JobState:
        budget = budget_for(project)
        job = JobState(id=uuid.uuid4().hex, status='running', budget=budget, progress=Progress(startedAt=time.time()))
        with self._lock:
            self._jobs[job.id] = job
        threading.Thread(target=self._run, args=(job.id, project, budget), daemon=True).start()
        return job

    def _run(self, job_id: str, project: Project, budget: Budget) -> None:
        def on_event(event: ProgressEvent) -> None:
            with self._lock:
                state = self._jobs.get(job_id)
                if state is None or state.progress is None:
                    return
                progress = state.progress.model_copy(update=dict(events=state.progress.events + [event]))
                self._jobs[job_id] = state.model_copy(update=dict(progress=progress))

        try:
            result = solve_project(project, budget, on_event)
            update = dict(status='done', result=result)
        except (PackingSolverError, ValueError) as err:
            update = dict(status='failed', error=str(err))
        except Exception as err:  # pragma: no cover - defensive: anything else still ends the job
            update = dict(status='failed', error='%s: %s' % (type(err).__name__, err))
        with self._lock:
            self._jobs[job_id] = self._jobs[job_id].model_copy(update=update)

    def get(self, job_id: str):
        """The job as seen now; a running job's ``progress.elapsed`` is refreshed from the clock."""
        with self._lock:
            state = self._jobs.get(job_id)
            if state is not None and state.status == 'running' and state.progress is not None:
                state = state.model_copy(update=dict(progress=state.progress.model_copy(update=dict(elapsed=time.time() - state.progress.startedAt))))
            return state

    def forget(self, job_id: str) -> bool:
        with self._lock:
            return self._jobs.pop(job_id, None) is not None
