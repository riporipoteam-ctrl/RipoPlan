"""
RipoPlan Backend API for Vercel
================================

This module contains a FastAPI application that exposes endpoints for
managing to‑do tasks and basic user authentication. It also serves
static assets for the front‑end from the ``public`` directory and
provides access to uploaded images. The application is designed to
work on Vercel's serverless platform where the ``public`` directory
is automatically served as static files.

The data for tasks and users are stored in JSON files within the same
directory as this module. Authentication tokens are kept in memory.

To run locally:

```
uvicorn api.index:app --reload --host 0.0.0.0 --port 8000
```

On Vercel the app will be discovered automatically because this file
exposes an ``app`` object.
"""

import hashlib
import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import (Depends, FastAPI, File, Form, HTTPException, Request,
                     UploadFile)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from prompts.automotive import (DIAGNOSIS_PROMPT, FOLLOW_UP_PROMPT,
                                REPAIR_TUTORIAL_PROMPT)
from services.ai import GeminiService

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------

# Base directory of this module
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "tasks.json")
USERS_FILE = os.path.join(BASE_DIR, "users.json")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

# The ``public`` directory sits alongside ``api`` in the repo root.
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "public")

os.makedirs(UPLOAD_DIR, exist_ok=True)

# In‑memory token store.  In a production system this should be persisted in a
# database and use JWT or another secure mechanism.
TOKENS = {}
AI_SESSIONS: Dict[str, Dict[str, Any]] = {}

# Create the FastAPI application
app = FastAPI(
    title="RipoPlan API",
    description="Simple task management API for the RipoPlan application.",
    version="1.0.0",
)

# Allow all origins for demonstration purposes. In production restrict this
# accordingly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images at /uploads
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve the static front‑end files from the public directory.  The html=True
# option ensures that index.html is returned for the root path.
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

# ----------------------------------------------------------------------------
# Utility functions for loading and saving JSON data
# ----------------------------------------------------------------------------

def _load_json(path: str):
    """Return the contents of ``path`` as a Python object or an empty list."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        # If the file exists but contains invalid JSON start fresh
        return []


def _save_json(path: str, data):
    """Persist ``data`` to ``path`` as formatted JSON."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _hash_password(password: str, salt: str) -> str:
    """Return a SHA‑256 hash of the given password concatenated with a salt."""
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


# ----------------------------------------------------------------------------
# Authentication helper
# ----------------------------------------------------------------------------

async def get_current_user(request: Request) -> Optional[str]:
    """Return the email of the currently authenticated user or ``None``.

    The client should include an Authorization header in the form
    ``Bearer <token>``.  If no valid token is provided, ``None`` is
    returned.  Endpoints that require authentication should check the
    returned value and raise an HTTP 401 if it is ``None``.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    return TOKENS.get(token)


# ----------------------------------------------------------------------------
# User Management Endpoints
# ----------------------------------------------------------------------------

@app.post("/signup", tags=["auth"])
async def signup(email: str = Form(...), password: str = Form(...)):
    """Create a new user account.

    Expects ``email`` and ``password`` form fields.  If the email already
    exists a 400 error is returned.  The password is hashed with a random
    salt and stored on disk.
    """
    users = _load_json(USERS_FILE)
    if any(u["email"] == email for u in users):
        raise HTTPException(status_code=400, detail="User already exists")
    salt = uuid.uuid4().hex
    hashed_pw = _hash_password(password, salt)
    users.append({"email": email, "salt": salt, "password": hashed_pw})
    _save_json(USERS_FILE, users)
    return {"message": "Signup successful"}


@app.post("/login", tags=["auth"])
async def login(email: str = Form(...), password: str = Form(...)):
    """Authenticate an existing user.

    Returns a random token on success which should be included in future
    requests via an Authorization header: ``Bearer <token>``.
    """
    users = _load_json(USERS_FILE)
    user = next((u for u in users if u["email"] == email), None)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    hashed_pw = _hash_password(password, user["salt"])
    if hashed_pw != user["password"]:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = uuid.uuid4().hex
    TOKENS[token] = email
    return {"token": token}


# ----------------------------------------------------------------------------
# Task Management Endpoints
# ----------------------------------------------------------------------------

@app.get("/tasks", tags=["tasks"])
async def list_tasks():
    """Return the list of all tasks.

    Tasks are stored in ``tasks.json``.  No authentication is required for
    demonstration purposes.  Each task is a dictionary containing the
    following keys: ``id``, ``title``, ``description``, ``status``,
    ``created_at``, ``updated_at``, ``due_date``, ``image``.
    """
    return _load_json(DATA_FILE)


@app.post("/tasks", tags=["tasks"])
async def create_task(
    title: str = Form(...),
    description: str = Form(""),
    due_date: Optional[str] = Form(None),
    status: str = Form("pending"),
):
    """Create a new task.

    Requires a ``title`` and optionally accepts a ``description``,
    ``due_date`` (ISO date string), and ``status`` (e.g. "pending", "completed").
    Returns the created task with a unique ``id``.
    """
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


@app.put("/tasks/{task_id}", tags=["tasks"])
async def update_task(
    task_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    image: UploadFile = File(None),
):
    """Update an existing task.

    Allows updating any of the task fields.  If ``image`` is provided, it
    will be stored and the ``image`` field of the task will be updated with
    the relative URL.
    """
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


@app.delete("/tasks/{task_id}", tags=["tasks"])
async def delete_task(task_id: str):
    """Remove the specified task and return the remaining tasks."""
    tasks = _load_json(DATA_FILE)
    new_tasks = [t for t in tasks if t["id"] != task_id]
    if len(new_tasks) == len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")
    _save_json(DATA_FILE, new_tasks)
    return new_tasks


@app.get("/suggestions", tags=["tasks"])
async def get_suggestions():
    """Return a list of pending tasks as suggestions.

    For demonstration purposes this simply returns tasks whose ``status`` is
    not "completed".  A more sophisticated implementation might analyze
    chat history or use ML models to generate suggestions.
    """
    tasks = _load_json(DATA_FILE)
    return [t for t in tasks if t.get("status") != "completed"]


# Health check endpoint for readiness probes
@app.get("/health", tags=["meta"])
async def health_check():
    """Return a simple health status."""
    return {"status": "ok"}


class VehicleContext(BaseModel):
    vehicle: str
    engine: Optional[str] = "unknown"
    mileage: Optional[str] = "unknown"
    dashboard_lights: List[str] = Field(default_factory=list)
    obd_codes: List[str] = Field(default_factory=list)
    symptoms: List[str] = Field(default_factory=list)
    recent_repairs: List[str] = Field(default_factory=list)


class DiagnosisRequest(BaseModel):
    session_id: Optional[str] = None
    context: VehicleContext


class RepairTutorialRequest(BaseModel):
    session_id: Optional[str] = None
    context: VehicleContext
    repair_goal: str
    confirmed_issue: str = "Not yet confirmed"
    skill_level: str = "intermediate"
    available_tools: List[str] = Field(default_factory=list)


class FollowUpRequest(BaseModel):
    session_id: str
    question: str


def _upsert_session(session_id: str, context: Dict[str, Any], response: Dict[str, Any]):
    current = AI_SESSIONS.get(session_id, {})
    AI_SESSIONS[session_id] = {
        "context": context,
        "last_response": response,
        "updated_at": datetime.utcnow().isoformat(),
        "history": [*current.get("history", []), response],
    }


@app.post("/ai/diagnosis", tags=["ai"])
async def generate_vehicle_diagnosis(payload: DiagnosisRequest):
    session_id = payload.session_id or uuid.uuid4().hex
    service = GeminiService()
    prompt = DIAGNOSIS_PROMPT.format(
        vehicle=payload.context.vehicle,
        engine=payload.context.engine,
        mileage=payload.context.mileage,
        dashboard_lights=", ".join(payload.context.dashboard_lights) or "none provided",
        obd_codes=", ".join(payload.context.obd_codes) or "none provided",
        symptoms=", ".join(payload.context.symptoms) or "none provided",
        recent_repairs=", ".join(payload.context.recent_repairs) or "none provided",
    )
    structured = service.generate_structured(prompt)
    _upsert_session(session_id, payload.context.model_dump(), structured)

    return {
        "session_id": session_id,
        "type": "diagnosis",
        "content": structured,
    }


@app.post("/ai/repair-tutorial", tags=["ai"])
async def generate_repair_tutorial(payload: RepairTutorialRequest):
    session_id = payload.session_id or uuid.uuid4().hex
    service = GeminiService()
    prompt = REPAIR_TUTORIAL_PROMPT.format(
        vehicle=payload.context.vehicle,
        engine=payload.context.engine,
        repair_goal=payload.repair_goal,
        confirmed_issue=payload.confirmed_issue,
        skill_level=payload.skill_level,
        available_tools=", ".join(payload.available_tools) or "not specified",
    )
    structured = service.generate_structured(prompt)
    _upsert_session(session_id, payload.context.model_dump(), structured)

    return {
        "session_id": session_id,
        "type": "repair_tutorial",
        "content": structured,
    }


@app.post("/ai/follow-up", tags=["ai"])
async def generate_follow_up(payload: FollowUpRequest):
    session = AI_SESSIONS.get(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    service = GeminiService()
    prompt = FOLLOW_UP_PROMPT.format(
        session_context=json.dumps(session, indent=2),
        question=payload.question,
    )
    structured = service.generate_structured(prompt)
    _upsert_session(payload.session_id, session.get("context", {}), structured)

    return {
        "session_id": payload.session_id,
        "type": "follow_up",
        "content": structured,
    }
