# RipoPlan

RipoPlan is a FastAPI backend with a static single-page frontend served by the same app.

## Expected deployment layout (Vercel + FastAPI)

Keep these files in the repository root (same directory as `index.py`):

- `index.py` (FastAPI app entrypoint)
- `index.html`
- `script.js`
- `style.css`
- `logo.png`
- `tasks.json`, `users.json` (data files)

Optional runtime directory:

- `uploads/` (created automatically for uploaded task images)

This layout is required because `FRONTEND_DIR` points to the repository root, and `/` is mounted with Starlette `StaticFiles(..., html=True)`. That setup serves `index.html` at `/`, while relative asset paths like `script.js`, `style.css`, and `logo.png` resolve from the same directory.

## Run locally

```bash
uvicorn index:app --reload --host 0.0.0.0 --port 8000
```
