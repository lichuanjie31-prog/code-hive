from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.modules.auth.router import router as auth
from app.modules.competitions.router import router as competitions
from app.modules.favorites.router import router as favorites
from app.modules.membership.router import router as membership
from app.modules.subscriptions.router import router as subscriptions


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="code-hive API", version="2.0.0")
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token"])

    @app.middleware("http")
    async def private_responses(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(("/api/auth", "/api/me", "/api/admin")):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    for router in (auth, membership, competitions, favorites, subscriptions):
        app.include_router(router)
    return app


app = create_app()
