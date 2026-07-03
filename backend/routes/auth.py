"""Authentication + private account routes.

Email/password:
    POST /auth/signup   {name, email, password}  -> {token, user}
    POST /auth/login    {email, password}        -> {token, user}

Google OAuth (authorization-code flow — returns 503 until
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are filled in .env):
    GET  /auth/google/login     -> redirect to Google's consent screen
    GET  /auth/google/callback  -> exchanges the code, then redirects to
                                   {FRONTEND_URL}/login#token=... where
                                   the frontend stores the session

Session (Bearer JWT in the Authorization header):
    GET  /me              -> the caller's account + merchant selection
    PUT  /me/preferences  -> update postal code / merchant selection

There is intentionally no way to list or read other accounts.
"""

import datetime
import logging
import re
from urllib.parse import urlencode

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field

import db
from config import Config
from flipp_scraper.service import run_background_scrape, scrape_running, scrape_status_for

logger = logging.getLogger("flippwatch.routes.auth")

router = APIRouter(tags=["auth"])

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

_POSTAL_RE = re.compile(r"^[A-Z]\d[A-Z]\d[A-Z]\d$")


# ── Tokens / password helpers ────────────────────────────────────────

def _issue_token(user_id: int) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + datetime.timedelta(hours=Config.JWT_TTL_HOURS),
        },
        Config.JWT_SECRET,
        algorithm="HS256",
    )


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False  # Google-only account — no password to check
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency: resolve the Bearer token to an account or 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not signed in")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expired — sign in again")
    user = db.get_user(int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return user


def _public(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user.get("email"),
        "postal_code": user.get("postal_code"),
        "merchants": user.get("merchants", []),
    }


def _normalize_postal(raw: str) -> str:
    code = raw.replace(" ", "").replace("-", "").upper()
    if not _POSTAL_RE.match(code):
        raise HTTPException(
            status_code=422,
            detail=f"{raw!r} is not a valid Canadian postal code (e.g. A1A 1A1)",
        )
    return code


# ── Email / password ─────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/auth/signup", status_code=201)
def signup(body: SignupRequest):
    user = db.create_user(
        name=body.name.strip(),
        email=body.email,
        password_hash=_hash_password(body.password),
    )
    if user is None:
        if not db.storage_status()["ok"]:
            raise HTTPException(status_code=503, detail="Storage limit reached — try again later")
        raise HTTPException(status_code=409, detail="That email is already registered — sign in instead")
    return {"token": _issue_token(user["id"]), "user": _public(user)}


@router.post("/auth/login")
def login(body: LoginRequest):
    user = db.get_user_by_email(body.email)
    # Same error either way — don't reveal which emails have accounts.
    if user is None or not _check_password(body.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    full = db.get_user(user["id"])
    return {"token": _issue_token(user["id"]), "user": _public(full or user)}


# ── Google OAuth ─────────────────────────────────────────────────────

def _google_configured() -> bool:
    return bool(Config.GOOGLE_CLIENT_ID and Config.GOOGLE_CLIENT_SECRET)


@router.get("/auth/google/login")
def google_login():
    if not _google_configured():
        raise HTTPException(
            status_code=503,
            detail="Google sign-in isn't configured yet — set GOOGLE_CLIENT_ID "
                   "and GOOGLE_CLIENT_SECRET in .env",
        )
    params = urlencode(
        {
            "client_id": Config.GOOGLE_CLIENT_ID,
            "redirect_uri": Config.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{params}")


@router.get("/auth/google/callback")
async def google_callback(code: str = Query(...)):
    if not _google_configured():
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured yet")

    async with httpx.AsyncClient(timeout=15) as client:
        token_res = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": Config.GOOGLE_CLIENT_ID,
                "client_secret": Config.GOOGLE_CLIENT_SECRET,
                "redirect_uri": Config.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            logger.warning("Google token exchange failed: %s", token_res.text[:200])
            return RedirectResponse(f"{Config.FRONTEND_URL}/login#error=google")
        access_token = token_res.json().get("access_token")

        info_res = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info_res.status_code != 200:
            return RedirectResponse(f"{Config.FRONTEND_URL}/login#error=google")
        info = info_res.json()

    google_sub = info.get("sub")
    email = info.get("email")
    name = info.get("name") or (email.split("@")[0] if email else "Shopper")
    if not google_sub or not email:
        return RedirectResponse(f"{Config.FRONTEND_URL}/login#error=google")

    user = db.get_user_by_google_sub(google_sub)
    if user is None:
        existing = db.get_user_by_email(email)
        if existing is not None:
            # Same email signed up by password earlier — link the identity.
            db.link_google_sub(existing["id"], google_sub)
            user = db.get_user(existing["id"])
        else:
            user = db.create_user(name=name, email=email, google_sub=google_sub)
    if user is None:
        return RedirectResponse(f"{Config.FRONTEND_URL}/login#error=storage")

    return RedirectResponse(f"{Config.FRONTEND_URL}/login#token={_issue_token(user['id'])}")


# ── Session ──────────────────────────────────────────────────────────

class PreferencesRequest(BaseModel):
    postal_code: str | None = None
    merchants: list[dict] | None = None  # [{"id": 234, "name": "Walmart"}]


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return _public(user)


@router.put("/me/preferences")
def update_preferences(
    body: PreferencesRequest,
    background: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    postal = _normalize_postal(body.postal_code) if body.postal_code else None
    merchants = None
    if body.merchants is not None:
        try:
            merchants = [{"id": int(m["id"]), "name": str(m["name"])} for m in body.merchants]
        except (KeyError, TypeError, ValueError):
            raise HTTPException(status_code=422, detail="merchants must be [{id, name}, …]")

    updated = db.update_user(user["id"], postal_code=postal, merchants=merchants)
    if updated is None:
        if not db.storage_status()["ok"]:
            raise HTTPException(status_code=503, detail="Storage limit reached — preferences not saved")
        raise HTTPException(status_code=404, detail="Account not found")

    # Kick off a scrape when the saved prefs need data we don't have:
    # a different postal code, or newly selected stores that were never
    # scraped. Runs in the background — the save itself returns instantly.
    scrape_postal = updated.get("postal_code")
    selection = {m["id"] for m in updated.get("merchants", [])}
    postal_changed = postal is not None and postal != user.get("postal_code")
    # Scoped to THIS postal code, not "tracked anywhere" — a merchant
    # scraped for a different region has zero items for scrape_postal,
    # so it must count as new here too, or a store re-picked under a
    # postal code change never gets scraped (its global merchant row
    # already existed from the old region, so `new_stores` came out
    # empty and neither condition below fired — the exact bug that left
    # a selected, Flipp-confirmed-live store with 0 deals indefinitely).
    tracked = {m["id"] for m in db.list_merchants(postal_code=scrape_postal)}
    new_stores = selection - tracked

    scrape_started = False
    if scrape_postal and selection and (postal_changed or new_stores) and not scrape_running():
        background.add_task(run_background_scrape, scrape_postal, selection)
        scrape_started = True

    return {**_public(updated), "scrape_started": scrape_started}


@router.get("/scrape/status")
def get_scrape_status(user: dict = Depends(get_current_user)):
    """Progress of the on-demand background scrape for the CALLER's own
    postal code — scoped so one user never sees another user's scrape
    (the scraper itself is single-flight process-wide, but its status
    is not shared across accounts)."""
    return scrape_status_for(user.get("postal_code"))
