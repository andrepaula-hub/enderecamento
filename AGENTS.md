# Instructions For Agents

This is the canonical local checkout for the enderecamento app currently used by the user.

- Canonical Git remote: `https://github.com/andrepaula-hub/enderecamento.git`
- Local app URL: `http://localhost:8000`
- Server entrypoint: `app.py`
- Active UI: `shopper_front/` served through `/shopper-static/`
- Do not edit `frontend/` for the user's current localhost UI unless explicitly requested.
- Do not edit or rely on `Dahsboard.html`; it is legacy and is not served by this app.
- A separate old local clone exists at `/Users/andrelobo/Downloads/enderecamento`; treat it as legacy unless the user explicitly asks about that clone.
- Allocation/addressing algorithms must have a single source of truth in the backend, currently `core/agent_scoring.py` via the addressing use cases/API.
- The frontend may render state, collect user intent, send scope/options to the API, and display validation. It must not implement or fork placement/scoring logic.
- If a UI action allocates products, it should call the backend engine. Do not add new local greedy/scoring code in `shopper_front/`.

To verify what is being served:

```bash
curl -fsS http://localhost:8000/health
curl -fsS http://localhost:8000/ | rg '/shopper-static/'
```
