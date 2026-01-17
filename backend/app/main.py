"""VIP Afterparty FastAPI Application."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.errors import not_implemented_response
from app.middleware import ErrorHandlerMiddleware, PlayerIdMiddleware
from app.protocol import InitResponse, SpinRequest

app = FastAPI(
    title="VIP Afterparty RGS",
    version="0.1.0",
    description="Remote Game Server for VIP Afterparty slot game",
)

# Add middleware per protocol_v1.md
app.add_middleware(ErrorHandlerMiddleware)
app.add_middleware(PlayerIdMiddleware)


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"ok": True}


@app.get("/init")
async def init(request: Request) -> JSONResponse:
    """
    GET /init per protocol_v1.md.

    Returns 501 NOT_IMPLEMENTED until game logic is complete.
    """
    return not_implemented_response("/init")


@app.post("/spin")
async def spin(request: Request, body: SpinRequest) -> JSONResponse:
    """
    POST /spin per protocol_v1.md.

    Returns 501 NOT_IMPLEMENTED until game logic is complete.
    """
    return not_implemented_response("/spin")
