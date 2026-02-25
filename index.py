"""RipoPlan backend API."""

import hashlib
import json
import os
import re
import uuid
from datetime import datetime
from typing import List, Optional

import requests
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "tasks.json")
USERS_FILE = os.path.join(BASE_DIR, "users.json")
CHATS_FILE = os.path.join(BASE_DIR, "chats.json")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOAD_DIR, exist_ok=True)

TOKENS = {}
YOUTUBE_SAFE_SEARCH_FILTER = "sp=EgIQAQ%253D%253D"


class ChatMessageIn(BaseModel):
    vin: str
    message: str


class SettingsIn(BaseModel):
    theme: str


def _load_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_json(path: str, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


def _normalize_vin(vin: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", vin).upper()


async def get_current_user(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    return TOKENS.get(token)


def _require_user(user: Optional[str]) -> str:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _vehicle_from_vin(vin: str):
    normalized_vin = _normalize_vin(vin)
    if len(normalized_vin) < 6:
        raise HTTPException(status_code=400, detail="VIN must be at least 6 characters")
    seed = int(hashlib.sha256(normalized_vin.encode("utf-8")).hexdigest()[:8], 16)
    makes = [
        ("Toyota", "Camry", "2.5L I4", "FWD"),
        ("Honda", "Civic", "2.0L I4", "FWD"),
        ("Ford", "F-150", "3.5L V6", "4WD"),
        ("BMW", "330i", "2.0L Turbo", "RWD"),
        ("Hyundai", "Elantra", "2.0L I4", "FWD"),
    ]
    make, model, engine, drivetrain = makes[seed % len(makes)]
    year = 2017 + (seed % 8)
    diagnostics = [
        {"code": "P0301", "status": "active", "description": "Cylinder 1 misfire detected"},
        {"code": "P0171", "status": "pending", "description": "System too lean (Bank 1)"},
        {"code": "B0028", "status": "historical", "description": "Passenger restraint sensor fault"},
    ]
    return {
        "vin": normalized_vin,
        "make": make,
        "model": model,
        "year": year,
        "hero_image": f"https://source.unsplash.com/1280x720/?{year},{make},{model},car",
        "specs": {
            "engine": engine,
            "drivetrain": drivetrain,
            "fuelEconomy": f"{24 + (seed % 9)} MPG combined",
            "transmission": "8-speed automatic" if seed % 2 == 0 else "CVT",
        },
        "known_issues": [
            "Coil pack wear after ~70k miles",
            "Intermittent oxygen sensor drift in cold starts",
            "Battery voltage dips from accessory drain",
        ],
        "diagnostics": diagnostics,
        "recommended_fixes": [
            "Replace spark plugs and inspect coil packs",
            "Smoke-test intake and inspect MAF calibration",
            "Run battery load test and alternator ripple check",
        ],
    }


def _safe_youtube_links(make: str, model: str, code: str) -> List[dict]:
    query = f"{make} {model} {code} repair walkthrough"
    encoded = requests.utils.quote(query)
    search_url = f"https://www.youtube.com/results?search_query={encoded}&{YOUTUBE_SAFE_SEARCH_FILTER}"
    return [{"title": f"{code} troubleshooting for {make} {model}", "url": search_url}]


app = FastAPI(title="RipoPlan API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.post("/signup")
async def signup(email: str = Form(...), password: str = Form(...)):
    users = _load_json(USERS_FILE)
    if any(u["email"] == email for u in users):
        raise HTTPException(status_code=400, detail="User already exists")
    salt = uuid.uuid4().hex
    users.append(
        {
            "email": email,
            "salt": salt,
            "password": _hash_password(password, salt),
            "settings": {"theme": "light"},
        }
    )
    _save_json(USERS_FILE, users)
    return {"message": "Signup successful"}


@app.post("/login")
async def login(email: str = Form(...), password: str = Form(...)):
    users = _load_json(USERS_FILE)
    user = next((u for u in users if u["email"] == email), None)
    if not user or _hash_password(password, user["salt"]) != user["password"]:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = uuid.uuid4().hex
    TOKENS[token] = email
    return {"token": token, "email": email}


@app.get("/profile/settings")
async def get_settings(request: Request):
    current = _require_user(await get_current_user(request))
    users = _load_json(USERS_FILE)
    user = next((u for u in users if u["email"] == current), None)
    return (user or {}).get("settings", {"theme": "light"})


@app.put("/profile/settings")
async def update_settings(request: Request, payload: SettingsIn = Body(...)):
    current = _require_user(await get_current_user(request))
    if payload.theme not in {"light", "dark"}:
        raise HTTPException(status_code=400, detail="Invalid theme")
    users = _load_json(USERS_FILE)
    for user in users:
        if user["email"] == current:
            user.setdefault("settings", {})["theme"] = payload.theme
    _save_json(USERS_FILE, users)
    return {"theme": payload.theme}


@app.get("/vehicle/{vin}/details")
async def vehicle_details(vin: str, request: Request):
    _require_user(await get_current_user(request))
    return _vehicle_from_vin(vin)


@app.get("/vehicle/{vin}/report", response_class=HTMLResponse)
async def vehicle_report(vin: str, request: Request):
    _require_user(await get_current_user(request))
    vehicle = _vehicle_from_vin(vin)
    diagnostics = "".join(
        f"<li><strong>{d['code']}</strong> ({d['status']}): {d['description']}</li>" for d in vehicle["diagnostics"]
    )
    known_issues = "".join(f"<li>{item}</li>" for item in vehicle["known_issues"])
    fixes = "".join(f"<li>{item}</li>" for item in vehicle["recommended_fixes"])
    html = f"""
    <html><head><title>Repair Report</title>
    <style>body{{font-family:Arial;max-width:900px;margin:30px auto;padding:0 20px}}h1{{margin-bottom:0}}.meta{{color:#555}}</style>
    </head><body>
    <h1>{vehicle['year']} {vehicle['make']} {vehicle['model']}</h1>
    <p class='meta'>VIN: {vehicle['vin']} · Generated: {datetime.utcnow().isoformat()}</p>
    <h2>Diagnostics</h2><ul>{diagnostics}</ul>
    <h2>Known issues</h2><ul>{known_issues}</ul>
    <h2>Recommended fixes</h2><ul>{fixes}</ul>
    <button onclick='window.print()'>Print report</button>
    </body></html>
    """
    return HTMLResponse(content=html)


@app.get("/chat/{vin}")
async def get_chat(vin: str, request: Request):
    current = _require_user(await get_current_user(request))
    normalized_vin = _normalize_vin(vin)
    history = _load_json(CHATS_FILE)
    return [m for m in history if m["user"] == current and m["vin"] == normalized_vin]


@app.post("/chat")
async def post_chat(payload: ChatMessageIn, request: Request):
    current = _require_user(await get_current_user(request))
    normalized_vin = _normalize_vin(payload.vin)
    vehicle = _vehicle_from_vin(normalized_vin)
    history = _load_json(CHATS_FILE)

    assistant_answer = {
        "type": "assistant",
        "vin": normalized_vin,
        "user": current,
        "timestamp": datetime.utcnow().isoformat(),
        "content": {
            "summary": f"Scan guidance for {vehicle['year']} {vehicle['make']} {vehicle['model']}.",
            "steps": [
                "Verify battery voltage and starter draw.",
                f"Address highest priority DTC: {vehicle['diagnostics'][0]['code']}.",
                "Road-test after clearing codes to confirm stability.",
            ],
            "images": [
                {
                    "label": "Engine bay reference",
                    "url": f"https://source.unsplash.com/800x500/?{vehicle['make']},{vehicle['model']},engine",
                }
            ],
            "videos": _safe_youtube_links(vehicle["make"], vehicle["model"], vehicle["diagnostics"][0]["code"]),
        },
    }

    user_msg = {
        "type": "user",
        "vin": normalized_vin,
        "user": current,
        "timestamp": datetime.utcnow().isoformat(),
        "content": payload.message,
    }

    history.extend([user_msg, assistant_answer])
    _save_json(CHATS_FILE, history)
    return assistant_answer


@app.get("/tasks")
async def list_tasks():
    return _load_json(DATA_FILE)


@app.post("/tasks")
async def create_task(
    title: str = Form(...),
    description: str = Form(""),
    due_date: Optional[str] = Form(None),
    status: str = Form("pending"),
):
    tasks = _load_json(DATA_FILE)
    task_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    task = {
        "id": task_id,
        "title": title,
        "description": description,
        "status": status,
        "created_at": now,
        "updated_at": now,
        "due_date": due_date,
        "image": None,
    }
    tasks.append(task)
    _save_json(DATA_FILE, tasks)
    return task


@app.put("/tasks/{task_id}")
async def update_task(
    task_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    image: UploadFile = File(None),
):
    tasks = _load_json(DATA_FILE)
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if title is not None:
        task["title"] = title
    if description is not None:
        task["description"] = description
    if due_date is not None:
        task["due_date"] = due_date
    if status is not None:
        task["status"] = status
    if image is not None:
        ext = os.path.splitext(image.filename)[1]
        filename = f"{task_id}{ext}"
        dest_path = os.path.join(UPLOAD_DIR, filename)
        with open(dest_path, "wb") as f:
            f.write(await image.read())
        task["image"] = f"/uploads/{filename}"
    task["updated_at"] = datetime.utcnow().isoformat()
    _save_json(DATA_FILE, tasks)
    return task


@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    tasks = _load_json(DATA_FILE)
    new_tasks = [t for t in tasks if t["id"] != task_id]
    if len(new_tasks) == len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")
    _save_json(DATA_FILE, new_tasks)
    return new_tasks


@app.get("/suggestions")
async def get_suggestions():
    tasks = _load_json(DATA_FILE)
    return [t for t in tasks if t.get("status") != "completed"]


@app.get("/health")
async def health_check():
    return {"status": "ok"}


app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")
