from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import requests

from .gsheets_client import CREDENTIALS_DIR

DEFAULT_APPS_SCRIPT_ID = "1JDdT-ibih2VI6gdDQZlZaQFDrfqNy1o4-m9Tcy5cAIT8j_hJRnHMBw6w"
DEFAULT_APPS_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwxLeiBSAl4PQr5QlEjqc0SbOgkdwkDBimFXtkv794/exec"
APPS_SCRIPT_OAUTH_PATH = CREDENTIALS_DIR / "apps_script_oauth.json"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"


def _load_oauth_payload() -> dict[str, Any]:
    if not APPS_SCRIPT_OAUTH_PATH.exists():
        raise RuntimeError(
            "Credencial OAuth do Apps Script ausente em .credentials/apps_script_oauth.json."
        )
    try:
        return json.loads(APPS_SCRIPT_OAUTH_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError("Não foi possível ler .credentials/apps_script_oauth.json.") from exc


def refresh_apps_script_access_token(timeout_seconds: int = 30) -> str:
    env_token = str(os.getenv("APPS_SCRIPT_ACCESS_TOKEN", "")).strip()
    if env_token:
        return env_token

    payload = _load_oauth_payload()
    client_id = str(payload.get("client_id") or "").strip()
    client_secret = str(payload.get("client_secret") or "").strip()
    refresh_token = str(payload.get("refresh_token") or "").strip()
    if not (client_id and client_secret and refresh_token):
        raise RuntimeError("apps_script_oauth.json sem client_id/client_secret/refresh_token.")

    try:
        resp = requests.post(
            OAUTH_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=max(timeout_seconds, 10),
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"Falha ao renovar token OAuth do Apps Script: {exc}") from exc
    if resp.status_code < 200 or resp.status_code >= 300:
        raise RuntimeError(
            f"Falha ao renovar token OAuth do Apps Script: {resp.text[:1200]}"
        )

    token_payload = resp.json()
    access_token = str(token_payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("OAuth do Apps Script não retornou access_token.")
    return access_token


def call_apps_script_function(
    function_name: str,
    payload: dict[str, Any] | None = None,
    *,
    script_id: str = DEFAULT_APPS_SCRIPT_ID,
    dev_mode: bool = True,
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    access_token = refresh_apps_script_access_token(timeout_seconds=timeout_seconds)
    body = {
        "function": str(function_name or "").strip(),
        "devMode": bool(dev_mode),
        "parameters": [payload or {}],
    }
    proc = subprocess.run(
        [
            "curl",
            "-sS",
            "-L",
            "--post301",
            "--post302",
            "--post303",
            "--connect-timeout",
            "5",
            "--max-time",
            str(max(timeout_seconds, 30)),
            "-X",
            "POST",
            "-H",
            f"Authorization: Bearer {access_token}",
            "-H",
            "Content-Type: application/json",
            "-d",
            json.dumps(body, ensure_ascii=False),
            "-w",
            "\\n%{http_code}",
            f"https://script.googleapis.com/v1/scripts/{script_id}:run",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "Falha ao chamar Execution API do Apps Script.")
    if "\n" not in proc.stdout:
        raise RuntimeError(f"Resposta inválida da Execution API do Apps Script: {proc.stdout[:300]}")
    raw, status_raw = proc.stdout.rsplit("\n", 1)
    status = int(status_raw.strip() or "0")
    if status < 200 or status >= 300:
        raise RuntimeError(f"Falha ao chamar Execution API do Apps Script: {raw[:1200]}")

    response = json.loads(raw or "{}")
    if "error" in response:
        error_payload = response.get("error") or {}
        message = error_payload.get("message") or json.dumps(error_payload, ensure_ascii=False)
        raise RuntimeError(f"Execution API Apps Script falhou: {message}")

    result = ((response.get("response") or {}).get("result"))
    if not isinstance(result, dict):
        raise RuntimeError("Execution API Apps Script retornou resposta sem result.")
    return result


def call_apps_script_webapp_action(
    action: str,
    payload: dict[str, Any] | None = None,
    *,
    webapp_url: str = DEFAULT_APPS_SCRIPT_WEBAPP_URL,
    timeout_seconds: int = 120,
) -> dict[str, Any]:
    access_token = refresh_apps_script_access_token(timeout_seconds=timeout_seconds)
    body = {"performance_bq_action": str(action or "").strip()}
    webhook_token = str(os.getenv("APPS_SCRIPT_WEBHOOK_TOKEN", "")).strip()
    if webhook_token:
        body["performance_bq_token"] = webhook_token
    if payload:
        body.update(payload)
    url = str(os.getenv("APPS_SCRIPT_WEBAPP_URL", "")).strip() or webapp_url
    try:
        resp = requests.post(
            url,
            json=body,
            headers={"Authorization": f"Bearer {access_token}"},
            allow_redirects=True,
            timeout=max(timeout_seconds, 30),
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"Falha ao chamar Web App do Apps Script: {exc}") from exc
    if resp.status_code < 200 or resp.status_code >= 300:
        raise RuntimeError(f"Falha ao chamar Web App do Apps Script: {resp.text[:1200]}")
    response = resp.json()
    if response.get("ok") is not True:
        error = str(response.get("error") or "Web App do Apps Script retornou erro.")
        message = str(response.get("message") or "").strip()
        if error == "unauthorized":
            detail = message or "Token inválido para ação de sincronização."
            raise RuntimeError(
                f"{detail} Configure APPS_SCRIPT_WEBHOOK_TOKEN no ambiente do backend local."
            )
        raise RuntimeError(message or error)
    result = response.get("result")
    if not isinstance(result, dict):
        raise RuntimeError("Web App do Apps Script retornou resposta sem result.")
    return result
