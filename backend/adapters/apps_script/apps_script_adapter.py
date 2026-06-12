from __future__ import annotations

from backend.ports.apps_script_gateway import AppsScriptGateway


class AppsScriptAdapter(AppsScriptGateway):
    """Implementa AppsScriptGateway delegando para core.apps_script_client."""

    def execute(self, action: str, payload: dict) -> dict:
        from core.apps_script_client import call_apps_script_webapp_action
        return call_apps_script_webapp_action(action, payload)
