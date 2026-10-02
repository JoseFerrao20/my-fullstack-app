"""The {data, error, meta} response envelope used by every endpoint."""

import logging
from typing import Any, Generic, TypeVar

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.schemas import CamelModel

logger = logging.getLogger(__name__)

T = TypeVar("T")


class ErrorBody(CamelModel):
    code: str
    message: str
    details: Any | None = None


class Envelope(CamelModel, Generic[T]):
    data: T | None = None
    error: ErrorBody | None = None
    meta: dict[str, Any] | None = None


class PageMeta(CamelModel):
    total: int
    page: int
    page_size: int


def ok(data: Any, meta: CamelModel | dict[str, Any] | None = None) -> Envelope:
    if isinstance(meta, CamelModel):
        meta = meta.model_dump(by_alias=True)
    return Envelope(data=data, meta=meta)


class ApiError(HTTPException):
    """HTTPException with a machine-readable error code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code
        self.details = details


def not_found(resource: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{resource} not found")


_DEFAULT_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
}


def error_response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    body = Envelope(error=ErrorBody(code=code, message=message, details=details))
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(body.model_dump(by_alias=True)),
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = getattr(exc, "code", None) or _DEFAULT_CODES.get(exc.status_code, "ERROR")
        response = error_response(
            exc.status_code, code, str(exc.detail), getattr(exc, "details", None)
        )
        if exc.headers:
            response.headers.update(exc.headers)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(p) for p in err["loc"][1:]), "message": err["msg"]}
            for err in exc.errors()
        ]
        return error_response(422, "VALIDATION_ERROR", "Request validation failed", details)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return error_response(500, "INTERNAL_ERROR", "Internal server error")
