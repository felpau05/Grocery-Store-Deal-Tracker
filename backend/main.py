"""App init + CORS + route registration only — no business logic here.
See api/routes/ for actual endpoint implementations.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import deals, optimize

app = FastAPI(title="flippwatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deals.router)
app.include_router(optimize.router)


@app.get("/health")
def health():
    return {"status": "ok"}