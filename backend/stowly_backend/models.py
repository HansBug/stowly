"""Project model shared with the renderer (mirrors src/renderer/src/lib/project.ts). All lengths are millimetres, weights kilograms."""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

Rotations = Literal['all', 'upright', 'fixed']
Solver = Literal['box', 'boxstacks']
Objective = Literal['bin-packing', 'knapsack', 'variable-sized-bin-packing']
OptimizationMode = Literal['anytime', 'not-anytime', 'not-anytime-deterministic', 'not-anytime-sequential']


class BinSpec(BaseModel):
    id: str
    name: str = ''
    x: int = Field(gt=0)
    y: int = Field(gt=0)
    z: int = Field(gt=0)
    copies: int = Field(default=1, ge=1)
    cost: Optional[float] = None
    maxWeight: Optional[float] = None


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


class Settings(BaseModel):
    solver: Solver = 'box'
    objective: Objective = 'bin-packing'
    timeLimit: float = Field(default=10.0, gt=0)
    optimizationMode: OptimizationMode = 'anytime'


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
