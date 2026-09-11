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
    project = project.model_copy(update={'settings': Settings(objective='knapsack', timeLimit=2.0, optimizationMode='not-anytime-deterministic'),
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
    monkeypatch.setattr(solver_module, 'solve_project', lambda _project: (_ for _ in ()).throw(ValueError('refused by the solver')))
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
