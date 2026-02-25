import hashlib
import json
import os
import random
import uuid
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(BASE_DIR, "users.json")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
FRONTEND_DIR = BASE_DIR

os.makedirs(UPLOAD_DIR, exist_ok=True)
TOKENS: dict[str, str] = {}

app = FastAPI(
    title="RipoPlan Vehicle Intelligence API",
    description="VIN decoding, vehicle profiling, diagnostics, repair planning and assistant chat.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def _load_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_json(path: str, data: Any):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


@app.post("/signup", tags=["auth"])
async def signup(email: str = Form(...), password: str = Form(...)):
    users = _load_json(USERS_FILE)
    if any(u["email"] == email for u in users):
        raise HTTPException(status_code=400, detail="User already exists")
    salt = uuid.uuid4().hex
    users.append({"email": email, "salt": salt, "password": _hash_password(password, salt)})
    _save_json(USERS_FILE, users)
    return {"message": "Signup successful"}


@app.post("/login", tags=["auth"])
async def login(email: str = Form(...), password: str = Form(...)):
    users = _load_json(USERS_FILE)
    user = next((u for u in users if u["email"] == email), None)
    if not user or _hash_password(password, user["salt"]) != user["password"]:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = uuid.uuid4().hex
    TOKENS[token] = email
    return {"token": token}


async def get_current_user(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None
    return TOKENS.get(auth_header.split(" ", 1)[1])


class DiagnosticsRequest(BaseModel):
    vin: str


class RepairPlanRequest(BaseModel):
    vin: str
    issues: list[dict[str, Any]]


class ChatRequest(BaseModel):
    vin: str
    message: str
    diagnostics: list[dict[str, Any]] = []


@app.post("/vin/decode", tags=["vehicle"])
async def decode_vin(vin: Optional[str] = Form(None), image: UploadFile = File(None)):
    extracted_vin = vin
    if image is not None and not extracted_vin:
        fake_seed = image.filename or uuid.uuid4().hex
        extracted_vin = ("IMG" + hashlib.md5(fake_seed.encode("utf-8")).hexdigest().upper())[:17]
    if not extracted_vin:
        raise HTTPException(status_code=400, detail="VIN or image is required")

    normalized = extracted_vin.strip().upper()[:17]
    return {
        "vin": normalized,
        "wmi": normalized[:3],
        "manufacturer": "Ripo Motors" if normalized.startswith("RIP") else "Decoded Auto Group",
        "country": "USA" if normalized[:1] in {"1", "4", "5"} else "Global",
        "model_year_code": normalized[9:10] if len(normalized) >= 10 else "N/A",
    }


@app.get("/vehicle/{vin}", tags=["vehicle"])
async def get_vehicle(vin: str):
    brands = ["Toyota", "Honda", "Ford", "BMW", "Hyundai"]
    models = ["Camry", "Civic", "F-150", "X3", "Tucson"]
    idx = sum(ord(ch) for ch in vin) % len(brands)

    return {
        "vin": vin,
        "brand": brands[idx],
        "model": models[idx],
        "year": 2018 + (idx % 7),
        "hero_image": f"https://placehold.co/960x420?text={brands[idx]}+{models[idx]}",
        "specs": {
            "trim": "Sport",
            "engine": "2.0L Turbo",
            "transmission": "8-speed automatic",
            "drivetrain": "AWD",
            "fuel_type": "Gasoline",
            "odometer": f"{34000 + idx * 8700} mi",
        },
    }


@app.post("/diagnostics/run", tags=["diagnostics"])
async def run_diagnostics(payload: DiagnosticsRequest):
    seeded = sum(ord(ch) for ch in payload.vin)
    random.seed(seeded)
    issue_bank = [
        ("P0301", "Cylinder 1 misfire detected", "high"),
        ("P0420", "Catalyst efficiency below threshold", "medium"),
        ("B0020", "Airbag deployment loop open", "critical"),
        ("U0100", "Lost communication with ECM", "high"),
        ("C0035", "Front-left wheel speed sensor issue", "medium"),
    ]
    picked = random.sample(issue_bank, k=2)
    return {
        "vin": payload.vin,
        "summary": "Diagnostic scan completed",
        "issues": [{"code": c, "summary": s, "severity": sev} for c, s, sev in picked],
    }


@app.post("/repair/plan", tags=["repair"])
async def build_repair_plan(payload: RepairPlanRequest):
    steps = []
    for issue in payload.issues:
        steps.append(
            {
                "issue_code": issue.get("code", "UNKNOWN"),
                "action": f"Inspect and repair root cause for {issue.get('code', 'diagnostic code')}",
                "eta": "1-2 hours" if issue.get("severity") in {"medium", "low"} else "2-4 hours",
            }
        )

    if not steps:
        steps.append({"issue_code": "NONE", "action": "No critical repairs recommended.", "eta": "N/A"})

    return {"vin": payload.vin, "steps": steps, "estimated_total": f"{len(steps) * 2} hours"}


@app.post("/chat", tags=["assistant"])
async def chat(payload: ChatRequest):
    top_issue = payload.diagnostics[0]["code"] if payload.diagnostics else "general maintenance"
    return {
        "vin": payload.vin,
        "reply": f"Based on VIN {payload.vin}, prioritize {top_issue}. Next check fluids, battery health, and schedule a road test.",
    }


@app.get("/health", tags=["meta"])
async def health_check():
    return {"status": "ok"}


if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
