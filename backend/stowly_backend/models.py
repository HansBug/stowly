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


class Settings(BaseModel):
    solver: Solver = 'box'
    objective: Objective = 'bin-packing'
    timeLimit: float = Field(default=10.0, gt=0)
    optimizationMode: OptimizationMode = 'anytime'
    unloadingConstraint: UnloadingConstraint = 'none'  # boxstacks only


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


class JobState(BaseModel):
    id: str
    status: Literal['running', 'done', 'failed']
    result: Optional[SolveResult] = None
    error: Optional[str] = None
