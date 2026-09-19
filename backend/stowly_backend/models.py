"""Project model shared with the renderer (mirrors src/renderer/src/lib/project.ts). All lengths are millimetres, weights kilograms."""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

Rotations = Literal['all', 'upright', 'fixed']
Solver = Literal['box', 'boxstacks']
Objective = Literal['bin-packing', 'knapsack', 'variable-sized-bin-packing']
OptimizationMode = Literal['anytime', 'not-anytime', 'not-anytime-deterministic', 'not-anytime-sequential']
# Sides of a container that are open for loading/unloading. x is the length axis: 'x-max' is the far end where container
# and truck doors are; 'top' is an open roof (flatbeds, pallets). Used by the viewer and to explain the unloading constraints.
Side = Literal['x-min', 'x-max', 'y-min', 'y-max', 'top']
# packingsolver3d's boxstacks unloading constraints. They assume the door at the x-max (or y-max) end and unload groups in
# increasing order of their number: group 0 first, so it is packed nearest the door.
UnloadingConstraint = Literal['none', 'only-x-movements', 'only-y-movements', 'increasing-x', 'increasing-y']


class BinSpec(BaseModel):
    id: str
    name: str = ''
    x: int = Field(gt=0)
    y: int = Field(gt=0)
    z: int = Field(gt=0)
    copies: int = Field(default=1, ge=1)
    cost: Optional[float] = None
    maxWeight: Optional[float] = None
    # boxstacks only: heaviest allowed floor load in kg/m² (upstream maximum_stack_density, converted to kg/mm²).
    maxStackDensity: Optional[float] = Field(default=None, gt=0)
    openSides: List[Side] = Field(default_factory=lambda: ['x-max'])


class ItemSpec(BaseModel):
    id: str
    name: str = ''
    x: int = Field(gt=0)
    y: int = Field(gt=0)
    z: int = Field(gt=0)
    copies: int = Field(default=1, ge=1)
    weight: Optional[float] = None
    profit: Optional[float] = None
    rotations: Rotations = 'all'
    color: Optional[str] = None
    # boxstacks only (the box solver has no stacking model): items of one type form stacks.
    maxStack: Optional[int] = Field(default=None, ge=1)          # maximum items in a stack containing this type
    maxWeightAbove: Optional[float] = Field(default=None, ge=0)  # kg allowed on top of one item of this type
    nestingHeight: Optional[int] = Field(default=None, ge=0)     # mm the item above sinks into this one
    group: int = Field(default=0, ge=0)                           # unloading group: 0 is unloaded first


TimeMode = Literal['auto', 'manual']


class Settings(BaseModel):
    """Solver settings. The time budget has two modes: ``auto`` asks packingsolver3d's ``recommend_time_budget`` for the
    time limit and the stall-stop knobs at solve time (``alpha`` and ``speed`` are its two dials), ``manual`` uses the
    three values stored here, which the interface pre-fills with the recommendation."""

    solver: Solver = 'boxstacks'
    objective: Objective = 'bin-packing'
    optimizationMode: OptimizationMode = 'anytime'
    unloadingConstraint: UnloadingConstraint = 'none'  # boxstacks only
    timeMode: TimeMode = 'auto'
    # quality-versus-waiting dial of the recommendation; None = packingsolver3d's per-solver default (box 4, boxstacks 8)
    alpha: Optional[float] = Field(default=None, gt=0)
    # machine speed relative to the estimator's reference machine; the interface fills it from its calibration store
    # before each request, so it is a per-machine value that happens to travel inside the settings
    speed: float = Field(default=1.0, gt=0)
    # manual mode only
    timeLimit: float = Field(default=30.0, gt=0)
    stopWhenUnimprovedFor: Optional[float] = Field(default=None, gt=0)
    stopWhenUnimprovedAfter: Optional[float] = Field(default=None, ge=0)


class Project(BaseModel):
    schema_: str = Field(default='stowly/1', alias='schema')
    name: str = ''
    unit: Literal['mm', 'cm', 'm', 'in'] = 'mm'
    bins: List[BinSpec] = Field(default_factory=list)
    items: List[ItemSpec] = Field(default_factory=list)
    settings: Settings = Field(default_factory=Settings)

    model_config = {'populate_by_name': True}


class Placement(BaseModel):
    itemId: str
    itemIndex: int
    x: int
    y: int
    z: int
    lx: int
    ly: int
    lz: int
    rotation: str


class PackedBin(BaseModel):
    binId: str
    binIndex: int
    copies: int
    x: int
    y: int
    z: int
    placements: List[Placement]
    volumeUtilization: float
    weight: float


class ItemCount(BaseModel):
    itemId: str
    packed: int
    total: int


class SolveResult(BaseModel):
    status: str
    solver: Solver = 'box'
    objective: str
    value: Optional[float]
    bound: Optional[float]
    solveTime: Optional[float]
    wallTime: float
    bins: List[PackedBin]
    counts: List[ItemCount]
    statistics: Dict[str, Any]
    options: Dict[str, Any]
    stopReason: Optional[str] = None  # None (time limit / proof), 'unimproved' (stall stop) or 'callback'
    firstSolutionTime: Optional[float] = None  # seconds to the first reported solution, for machine-speed calibration


class Budget(BaseModel):
    """The stopping policy a solve runs with: packingsolver3d's recommendation or the manual values, in seconds."""

    source: TimeMode
    timeLimit: float
    stopWhenUnimprovedFor: Optional[float] = None
    stopWhenUnimprovedAfter: Optional[float] = None
    path: str  # upstream algorithm path the estimator predicted (TSMS / TS / SSK / SVC / SOR)
    latency: float  # predicted seconds to the first solution
    improvement: float  # predicted seconds worth waiting after it
    alpha: float
    speed: float


class ProgressEvent(BaseModel):
    time: float
    items: int
    bins: int
    profit: float
    cost: float
    label: str


class Progress(BaseModel):
    """Live view of a running solve, updated from packingsolver3d's progress callback."""

    startedAt: float  # time.time() when the solve started
    elapsed: float = 0.0
    events: List[ProgressEvent] = []


class JobState(BaseModel):
    id: str
    status: Literal['running', 'done', 'failed']
    result: Optional[SolveResult] = None
    error: Optional[str] = None
    budget: Optional[Budget] = None
    progress: Optional[Progress] = None
