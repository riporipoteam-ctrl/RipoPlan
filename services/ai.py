"""Gemini-backed AI service helpers."""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, Optional

import requests
from fastapi import HTTPException


class GeminiService:
    """Wrapper for Gemini API calls with timeout/retry and structured outputs."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
        retries: Optional[int] = None,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise HTTPException(
                status_code=500,
                detail="Missing Gemini API key. Set GEMINI_API_KEY in environment.",
            )

        self.model = model or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        self.timeout_seconds = timeout_seconds or int(os.getenv("GEMINI_TIMEOUT_SECONDS", "20"))
        self.retries = retries or int(os.getenv("GEMINI_RETRIES", "2"))

    def generate_structured(self, prompt: str) -> Dict[str, Any]:
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.3,
            },
        }
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )

        last_error: Optional[Exception] = None
        for attempt in range(self.retries + 1):
            try:
                response = requests.post(
                    endpoint,
                    json=payload,
                    timeout=self.timeout_seconds,
                )
                response.raise_for_status()
                return self._parse_structured_response(response.json())
            except (requests.RequestException, ValueError, KeyError, json.JSONDecodeError) as exc:
                last_error = exc
                if attempt < self.retries:
                    time.sleep(0.75 * (attempt + 1))

        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed after retries: {last_error}",
        )

    def _parse_structured_response(self, response_data: Dict[str, Any]) -> Dict[str, Any]:
        candidates = response_data.get("candidates", [])
        if not candidates:
            raise ValueError("No candidates returned by Gemini")

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts or "text" not in parts[0]:
            raise ValueError("Gemini response missing text content")

        raw_text = parts[0]["text"].strip()
        parsed = json.loads(raw_text)

        return {
            "vehicle_summary": parsed.get("vehicle_summary", ""),
            "diagnosis_steps": parsed.get("diagnosis_steps", []),
            "parts_tools": parsed.get("parts_tools", []),
            "cautions": parsed.get("cautions", []),
            "media_references": parsed.get("media_references", []),
            "raw": parsed,
            "model": self.model,
        }
