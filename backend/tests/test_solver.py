import time

import pytest

from stowly_backend.models import ItemSpec, Project, Settings
from stowly_backend.solver import JobManager, build_instance, solve_project


def test_build_instance_maps_rotations_and_objective(project):
    instance = build_instance(project)
    assert instance.objective.value == 'bin-packing'
    assert len(instance.item_types[0].rotations) == 6
    assert instance.bin_types[0].copies == 5 and instance.bin_types[0].cost == 10


def test_solve_bin_packing(project):
    result = solve_project(project)
    assert result.status == 'optimal'
    assert result.value == 1.0 and result.bound == 1.0
    assert len(result.bins) == 1 and result.bins[0].binId == 'bin'
    assert sum(c.packed for c in result.counts) == 10
    assert all(c.packed == c.total for c in result.counts)
    assert 0 < result.bins[0].volumeUtilization < 1
    assert result.bins[0].weight == pytest.approx(4 * 1.5)
    assert all(p.itemId in ('a', 'b') for p in result.bins[0].placements)
    assert result.options['time_limit'] == 2.0


def test_solve_knapsack_leaves_items_out(project):
    from stowly_backend.models import BinSpec
    project = project.model_copy(update={'settings': Settings(solver='box', objective='knapsack', timeMode='manual', timeLimit=2.0, optimizationMode='not-anytime-deterministic'),
                                         'bins': [BinSpec(id='bin', x=100, y=100, z=100, copies=1)],
                                         'items': [ItemSpec(id='big', name='big', x=90, y=90, z=90, copies=3, profit=5.0)]})
    result = solve_project(project)
    assert result.status in ('optimal', 'feasible')
    assert result.counts[0].packed == 1 and result.counts[0].total == 3
    assert result.value == 5.0


def test_solve_boxstacks(project):
    stacked = project.model_copy(update={'settings': Settings(solver='boxstacks', timeLimit=2.0)})
    result = solve_project(stacked)
    assert result.status in ('optimal', 'feasible')
    assert sum(c.packed for c in result.counts) == 10


def test_job_manager_runs_and_forgets(project):
    manager = JobManager()
    job = manager.start(project)
    assert job.status == 'running'
    for _ in range(200):
        state = manager.get(job.id)
        if state.status != 'running':
            break
        time.sleep(0.05)
    assert state.status == 'done' and state.result.status == 'optimal'
    assert manager.forget(job.id) is True
    assert manager.get(job.id) is None
    assert manager.forget('nope') is False


def test_job_manager_reports_solver_errors():
    # Two footprints in one stackability bucket are refused by packingsolver3d.boxstacks; the job must fail, not crash.
    from stowly_backend.models import BinSpec
    project = Project(bins=[BinSpec(id='b', x=100, y=100, z=100)], items=[ItemSpec(id='a', x=20, y=30, z=40, rotations='fixed', copies=1)],
                      settings=Settings(solver='box', objective='bin-packing', timeLimit=1.0))
    bad = project.model_copy(update={'items': [ItemSpec(id='a', x=200, y=30, z=40, rotations='fixed')]})
    manager = JobManager()
    job = manager.start(bad)
    for _ in range(200):
        state = manager.get(job.id)
        if state.status != 'running':
            break
        time.sleep(0.05)
    assert state.status in ('done', 'failed')


def test_job_manager_marks_solver_exceptions_as_failed(project, monkeypatch):
    import stowly_backend.solver as solver_module
    monkeypatch.setattr(solver_module, 'solve_project', lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError('refused by the solver')))
    manager = JobManager()
    job = manager.start(project)
    for _ in range(200):
        state = manager.get(job.id)
        if state.status != 'running':
            break
        time.sleep(0.02)
    assert state.status == 'failed'
    assert 'refused by the solver' in state.error


def test_boxstacks_keeps_items_upright_and_forwards_stacking_fields(project):
    from packingsolver3d import Rotation, UnloadingConstraint
    from stowly_backend.models import BinSpec, ItemSpec, Settings
    stacked = project.model_copy(update={
        'settings': Settings(solver='boxstacks', objective='knapsack', timeLimit=1.0, unloadingConstraint='increasing-x'),
        'bins': [BinSpec(id='b', x=100, y=100, z=100, maxWeight=500, maxStackDensity=2000.0)],
        'items': [ItemSpec(id='a', x=20, y=30, z=40, copies=6, weight=2.0, rotations='all', maxStack=3, maxWeightAbove=10.0, nestingHeight=5, group=1),
                  ItemSpec(id='b', x=15, y=15, z=15, copies=4, rotations='fixed')],
    })
    instance = build_instance(stacked)
    a, b = instance.item_types
    assert list(a.rotations) == [Rotation.XYZ, Rotation.YXZ]  # "any" is upright for boxstacks
    assert list(b.rotations) == [Rotation.XYZ]
    assert (a.stackability_id, b.stackability_id) == (0, 1)
    assert (a.maximum_stackability, a.maximum_weight_above, a.nesting_height, a.group_id) == (3, 10.0, 5, 1)
    assert (b.maximum_stackability, b.maximum_weight_above, b.nesting_height, b.group_id, b.weight) == (None, None, None, 0, 0.0)
    assert instance.bin_types[0].maximum_stack_density == 2000.0 / 1e6
    assert instance.unloading_constraint == UnloadingConstraint.INCREASING_X
    # the box solver has no stacking model: the same project maps to a plain instance
    plain = build_instance(stacked.model_copy(update={'settings': Settings(solver='box', objective='knapsack', timeLimit=1.0, unloadingConstraint='increasing-x')}))
    assert plain.unloading_constraint is None
    assert plain.item_types[0].stackability_id is None and plain.item_types[0].maximum_stackability is None
    assert plain.bin_types[0].maximum_stack_density is None
    assert len(plain.item_types[0].rotations) == 6


def test_settings_defaults_are_boxstacks_and_automatic_time():
    settings = Settings()
    assert settings.solver == 'boxstacks' and settings.timeMode == 'auto' and settings.alpha is None and settings.speed == 1.0
    assert settings.stopWhenUnimprovedFor is None and settings.stopWhenUnimprovedAfter is None and settings.stopWhenUnimprovedRatio is None


def test_budget_for_auto_takes_the_recommendation(project):
    from stowly_backend.solver import budget_for
    auto = project.model_copy(update={'settings': project.settings.model_copy(update={'timeMode': 'auto'})})
    budget = budget_for(auto)
    assert budget.source == 'auto' and budget.path in ('TSMS', 'TS', 'SSK', 'SVC') and budget.alpha == 4.0 and budget.speed == 1.0
    assert budget.timeLimit >= 1.0 and budget.stopWhenUnimprovedFor >= 2.0 and 0 <= budget.stopWhenUnimprovedAfter <= budget.timeLimit
    assert budget.stopWhenUnimprovedRatio == 2.0  # box, alpha 4 -> alpha / 2
    assert budget.latency > 0 and budget.improvement >= 0
    assert 0 < budget.typicalLatency <= budget.latency
    quality = budget_for(auto.model_copy(update={'settings': auto.settings.model_copy(update={'alpha': 8.0, 'speed': 2.0})}))
    assert quality.alpha == 8.0 and quality.speed == 2.0 and quality.latency == pytest.approx(budget.latency / 2)


def test_budget_for_speed_only_lengthens_a_single_pass_budget(container_project):
    from stowly_backend.solver import budget_for, single_pass
    two_bins = container_project.model_copy(update={'bins': [container_project.bins[0].model_copy(update={'copies': 2})],
                                                    'settings': container_project.settings.model_copy(update={'timeMode': 'auto'})})
    reference = budget_for(two_bins)
    assert reference.path == 'SVC' and single_pass(reference) and reference.stopWhenUnimprovedAfter == reference.timeLimit and reference.extendedFrom is None
    fast = budget_for(two_bins.model_copy(update={'settings': two_bins.settings.model_copy(update={'speed': 4.44})}))
    assert fast.timeLimit == reference.timeLimit and fast.speed == 1.0  # a fast machine gains nothing from a shorter cap on a path that reports nothing before its first pass
    slow = budget_for(two_bins.model_copy(update={'settings': two_bins.settings.model_copy(update={'speed': 0.5})}))
    assert slow.timeLimit == pytest.approx(reference.timeLimit * 2) and slow.speed == 0.5
    one_bin = budget_for(container_project.model_copy(update={'settings': two_bins.settings.model_copy(update={'speed': 2.0})}))
    assert one_bin.path == 'SOR' and not single_pass(one_bin) and one_bin.speed == 2.0  # other paths keep the factor


def test_budget_for_manual_keeps_the_settings_and_still_predicts(project):
    from stowly_backend.solver import budget_for
    manual = project.model_copy(update={'settings': project.settings.model_copy(update={'stopWhenUnimprovedFor': 3.0, 'stopWhenUnimprovedAfter': 1.0, 'stopWhenUnimprovedRatio': 1.5})})
    budget = budget_for(manual)
    assert budget.source == 'manual' and budget.timeLimit == 2.0 and budget.stopWhenUnimprovedFor == 3.0 and budget.stopWhenUnimprovedAfter == 1.0
    assert budget.stopWhenUnimprovedRatio == 1.5
    assert budget.path and budget.latency > 0
    plain = budget_for(project)
    assert plain.stopWhenUnimprovedFor is None and plain.stopWhenUnimprovedAfter is None and plain.stopWhenUnimprovedRatio is None


def test_solve_project_reports_events_stop_reason_and_first_solution(container_project):
    # Progress events come from the anytime algorithms while they improve; a run that ends instantly may report none.
    events = []
    result = solve_project(container_project, on_event=events.append)
    assert result.stopReason is None  # manual budget without stall stop: the run ends on the time limit
    assert result.firstSolutionTime is not None and result.firstSolutionTime >= 0
    assert events and events[0].items > 0 and events[0].time == result.firstSolutionTime
    assert all(e.label for e in events)


def test_solve_project_passes_the_stall_stop_knobs(project, monkeypatch):
    import stowly_backend.solver as solver_module
    from stowly_backend.models import Budget
    seen = {}
    real_solve = solver_module.box.solve

    def fake_solve(instance, **options):
        seen.update(options)
        return real_solve(instance, time_limit=1.0, optimization_mode=options['optimization_mode'])

    monkeypatch.setattr(solver_module.box, 'solve', fake_solve)
    budget = Budget(source='manual', timeLimit=5.0, stopWhenUnimprovedFor=2.0, stopWhenUnimprovedAfter=1.0, stopWhenUnimprovedRatio=1.5, path='TS', latency=0.2, typicalLatency=0.2, improvement=1.0, alpha=4.0, speed=1.0)
    solve_project(project, budget)
    assert seen['time_limit'] == 5.0 and seen['stop_when_unimproved_for'] == 2.0 and seen['stop_when_unimproved_after'] == 1.0 and seen['stop_when_unimproved_ratio'] == 1.5
    seen.clear()
    solve_project(project, budget.model_copy(update={'stopWhenUnimprovedFor': 2.0, 'stopWhenUnimprovedAfter': None, 'stopWhenUnimprovedRatio': None}))
    assert seen['stop_when_unimproved_for'] == 2.0 and 'stop_when_unimproved_after' not in seen and 'stop_when_unimproved_ratio' not in seen


def test_job_manager_exposes_budget_and_progress(container_project):
    manager = JobManager()
    job = manager.start(container_project)
    assert job.budget is not None and job.budget.source == 'manual' and job.progress is not None and job.progress.events == []
    for _ in range(200):
        state = manager.get(job.id)
        if state.status != 'running':
            break
        assert state.progress.elapsed >= 0
        time.sleep(0.02)
    assert state.status == 'done'
    assert state.progress.events and state.progress.events[0].items > 0
    assert state.result.firstSolutionTime == state.progress.events[0].time


def _wait(manager, job_id):
    for _ in range(500):
        state = manager.get(job_id)
        if state is None or state.status != 'running':
            return state
        time.sleep(0.01)
    raise AssertionError('job did not finish')


def test_job_manager_extends_a_single_pass_auto_run_once(project, monkeypatch):
    import stowly_backend.solver as solver_module
    from stowly_backend.models import Budget, ProgressEvent, SolveResult
    auto = Budget(source='auto', timeLimit=4.0, stopWhenUnimprovedFor=5.0, stopWhenUnimprovedAfter=4.0, stopWhenUnimprovedRatio=4.0, path='SVC', latency=4.0, typicalLatency=2.0, improvement=0.0, alpha=8.0, speed=1.0)
    calls = []
    empty = dict(solver='boxstacks', objective='knapsack', value=0.0, bound=None, solveTime=0.0, wallTime=4.0, bins=[], counts=[], statistics={}, options={}, stopReason=None)

    def fake_solve(proj, budget, on_event=None):
        calls.append(budget)
        if len(calls) == 1:
            return SolveResult(status='no-solution', **empty)
        on_event(ProgressEvent(time=0.5, items=3, bins=2, profit=1.0, cost=2.0, label='SVC it 0'))
        return SolveResult(status='feasible', **dict(empty, firstSolutionTime=0.5, wallTime=1.0))

    monkeypatch.setattr(solver_module, 'budget_for', lambda proj: auto)
    monkeypatch.setattr(solver_module, 'solve_project', fake_solve)
    manager = JobManager()
    state = _wait(manager, manager.start(project).id)
    assert state.status == 'done' and state.result.status == 'feasible' and len(calls) == 2
    assert calls[1].timeLimit == 8.0 and calls[1].stopWhenUnimprovedAfter == 8.0 and calls[1].extendedFrom is None
    assert state.budget.extendedFrom == 4.0 and state.budget.timeLimit == 12.0 and state.budget.stopWhenUnimprovedAfter == 12.0
    # the second attempt's times continue from the first attempt's wall time, so the panel keeps one timeline
    offset = state.progress.events[0].time - 0.5
    assert offset >= 0 and state.result.firstSolutionTime == pytest.approx(0.5 + offset) and state.result.wallTime == pytest.approx(1.0 + offset)

    calls.clear()
    monkeypatch.setattr(solver_module, 'solve_project', lambda proj, budget, on_event=None: (calls.append(budget), SolveResult(status='no-solution', **empty))[1])
    state = _wait(manager, manager.start(project).id)
    assert state.result.status == 'no-solution' and len(calls) == 2 and state.budget.extendedFrom == 4.0  # a second empty attempt is the end of it

    for budget in (auto.model_copy(update={'source': 'manual'}), auto.model_copy(update={'improvement': 3.0}), auto.model_copy(update={'timeLimit': 600.0})):
        calls.clear()
        monkeypatch.setattr(solver_module, 'budget_for', lambda proj, b=budget: b)
        state = _wait(manager, manager.start(project).id)
        assert len(calls) == 1 and state.budget.extendedFrom is None, budget

    # a job forgotten during the first attempt gets no second one (start() registers the job before its thread runs, so the fake can look it up)
    calls.clear()
    fresh = JobManager()
    monkeypatch.setattr(solver_module, 'budget_for', lambda proj: auto)
    monkeypatch.setattr(solver_module, 'solve_project', lambda proj, budget, on_event=None: (calls.append(budget), fresh.forget(next(iter(fresh._jobs))), SolveResult(status='no-solution', **empty))[2])
    assert _wait(fresh, fresh.start(project).id) is None and len(calls) == 1


def test_solve_project_tolerates_a_run_without_events(project, monkeypatch):
    # A run that reports no progress event (a fast path, or a mode that replays silently) yields no first-solution time and no crash.
    import stowly_backend.solver as solver_module
    real_solve = solver_module.box.solve

    def silent_solve(instance, **options):
        options.pop('progress_callback')
        return real_solve(instance, **options)

    monkeypatch.setattr(solver_module.box, 'solve', silent_solve)
    events = []
    result = solve_project(project, on_event=events.append)
    assert result.status == 'optimal' and events == [] and result.firstSolutionTime is None


def test_job_manager_ignores_events_of_forgotten_jobs(project):
    manager = JobManager()
    job = manager.start(project)
    manager.forget(job.id)
    time.sleep(0.5)  # the worker thread finishes and must not resurrect the forgotten job
    assert manager.get(job.id) is None


def test_solve_project_records_the_first_solution_without_a_listener(container_project):
    result = solve_project(container_project)
    assert result.firstSolutionTime is not None and result.firstSolutionTime > 0
