from __future__ import annotations

import logging
import os
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from routes._state import SHOPPER_FRONT_ROOT

from backend.logging_config import configure_logging  # noqa: E402

configure_logging()

_is_prod = os.environ.get("ENV", "").lower() == "production"
app = FastAPI(
    title="Enderecamento Local",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
)
app.mount("/shopper-static", StaticFiles(directory=SHOPPER_FRONT_ROOT), name="shopper-static")

_http_logger = logging.getLogger("enderecamento.http")


class _RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        _http_logger.info(
            '"method": "%s", "path": "%s", "status": %d, "duration_ms": %s',
            request.method, request.url.path, response.status_code, duration_ms,
        )
        return response


app.add_middleware(_RequestLoggingMiddleware)

from backend.application.jobs.job_service import JobService  # noqa: E402
from backend.entrypoints.api.routes import router as new_router  # noqa: E402
from routes.agent import router as agent_router  # noqa: E402
from routes.catalog import router as catalog_router  # noqa: E402
from routes.connection import router as connection_router  # noqa: E402
from routes.equipment import router as equipment_router  # noqa: E402
from routes.etl import router as etl_router  # noqa: E402
from routes.moves import router as moves_router  # noqa: E402
from routes.versioning import router as versioning_router  # noqa: E402

app.include_router(new_router, prefix="")
app.include_router(connection_router)
app.include_router(moves_router)
app.include_router(equipment_router)
app.include_router(catalog_router)
app.include_router(versioning_router)
app.include_router(etl_router)
app.include_router(agent_router)


@app.exception_handler(Exception)
async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    print("Unhandled error:", repr(exc))
    return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@app.post("/api/{func_name}")
def api_not_implemented(func_name: str, _=None) -> JSONResponse:
    return JSONResponse(
        {"success": False, "error": f"Função '{func_name}' não disponível no modo local."}
    )
