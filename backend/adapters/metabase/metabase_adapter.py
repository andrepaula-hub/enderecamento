from __future__ import annotations

from backend.ports.metabase_gateway import MetabaseGateway


class MetabaseAdapter(MetabaseGateway):
    """Implementa MetabaseGateway delegando para core.metabase_sales."""

    def query_card(self, card_id: int, params: dict) -> list[dict]:
        from core.metabase_sales import metabase_query_card, resolve_metabase_session
        session = resolve_metabase_session()
        return metabase_query_card(card_id=card_id, session_id=session, **params)

    def get_session(self, username: str, password: str) -> str:
        from core.metabase_sales import DEFAULT_METABASE_URL, metabase_login
        return metabase_login(DEFAULT_METABASE_URL, username, password)
