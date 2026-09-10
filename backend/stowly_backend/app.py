"""The FastAPI application. Every route except /api/health requires the X-Stowly-Token header the shell generated."""
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from . import __version__
from .exporters import placements_csv
from .importers import ImportError_, import_files
from .models import JobState, Project, SolveResult
from .presets import load_presets
from .solver import JobManager


class ExportRequest(BaseModel):
    project: Project
    result: SolveResult


def create_app(token: str = '') -> FastAPI:
    app = FastAPI(title='Stowly backend', version=__version__)
    app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
    jobs = JobManager()

    def authorised(x_stowly_token: Optional[str] = Header(default=None)):
        if token and x_stowly_token != token:
            raise HTTPException(status_code=401, detail='missing or wrong X-Stowly-Token')

    @app.get('/api/health')
    def health():
        import packingsolver3d
        from packingsolver3d.config.meta import __UPSTREAM_COMMIT__
        return {'status': 'ok', 'backend': __version__, 'packingsolver3d': packingsolver3d.__version__, 'upstream': __UPSTREAM_COMMIT__}

    @app.get('/api/presets', dependencies=[Depends(authorised)])
    def presets():
        return load_presets()

    @app.post('/api/solve', dependencies=[Depends(authorised)], response_model=JobState)
    def solve(project: Project):
        if not project.bins or not project.items:
            raise HTTPException(status_code=422, detail='the project needs at least one container and one item')
        return jobs.start(project)

    @app.get('/api/jobs/{job_id}', dependencies=[Depends(authorised)], response_model=JobState)
    def job(job_id: str):
        state = jobs.get(job_id)
        if state is None:
            raise HTTPException(status_code=404, detail='unknown job')
        return state

    @app.delete('/api/jobs/{job_id}', dependencies=[Depends(authorised)])
    def forget(job_id: str):
        return {'forgotten': jobs.forget(job_id)}

    @app.post('/api/import', dependencies=[Depends(authorised)], response_model=Project)
    async def import_(files: List[UploadFile] = File(...), unit: str = Form('mm'), instanceIndex: int = Form(0)):
        payload = [(f.filename or 'upload', await f.read()) for f in files]
        try:
            return import_files(payload, unit=unit, instance_index=instanceIndex)
        except (ImportError_, ValueError, KeyError) as err:
            raise HTTPException(status_code=422, detail=str(err))

    @app.post('/api/export/placements', dependencies=[Depends(authorised)], response_class=PlainTextResponse)
    def export_placements(request: ExportRequest):
        return PlainTextResponse(placements_csv(request.project, request.result), media_type='text/csv')

    return app
