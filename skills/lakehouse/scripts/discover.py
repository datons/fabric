# /// script
# requires-python = ">=3.12"
# dependencies = ["azure-identity"]
# ///
"""Lista los lakehouses que tu cuenta puede ver en Fabric, con lo que necesita fabric.toml: tenant, workspace, endpoint SQL y lakehouse. Uso: uv run discover.py [--tenant <id>] [--json]. Misma salida que discover.ts."""

import base64
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from azure.identity import AzureCliCredential

API = "https://api.fabric.microsoft.com/v1"
args = sys.argv[1:]
tenant = args[args.index("--tenant") + 1] if "--tenant" in args else None

try:
    token = AzureCliCredential(tenant_id=tenant).get_token("https://api.fabric.microsoft.com/.default").token
except Exception as e:  # noqa: BLE001 (show the credential error verbatim)
    sys.exit(f"Sin sesión de Azure CLI. Inicia sesión: az login --allow-no-subscriptions\n{str(e)[:300]}")
payload = token.split(".")[1]
tid = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["tid"]


def get(url: str, attempt: int = 0) -> dict | None:
    """One page of a list. None when the caller cannot read it (no role on that workspace). Fabric throttles bursts (429) and drops sockets under load: retry those with a growing pause."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}), timeout=60) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 404):
            return None
        if e.code != 429 or attempt >= 4:
            raise
        time.sleep(float(e.headers.get("Retry-After") or 2**attempt))
    except urllib.error.URLError:
        if attempt >= 4:
            raise
        time.sleep(2**attempt * 0.5)
    return get(url, attempt + 1)


def list_all(url: str) -> list[dict] | None:
    """Follows continuationUri until the list ends."""
    items: list[dict] = []
    while url:
        page = get(url)
        if page is None:
            return None
        items += page["value"]
        url = page.get("continuationUri")
    return items


workspaces = list_all(f"{API}/workspaces") or []
# Workspaces whose lakehouses could not be listed after the retries: reported, not fatal.
unchecked: list[str] = []


def lakehouses(w: dict) -> list[dict]:
    try:
        items = list_all(f"{API}/workspaces/{w['id']}/lakehouses") or []
    except Exception:  # noqa: BLE001 (one unreachable workspace must not hide the rest)
        unchecked.append(w["displayName"])
        return []
    return [
        {
            "workspace": w["displayName"],
            "workspace_id": w["id"],
            "lakehouse": lh["displayName"],
            "lakehouse_id": lh["id"],
            "sql_server": (lh.get("properties", {}).get("sqlEndpointProperties") or {}).get("connectionString"),
        }
        for lh in items
    ]


with ThreadPoolExecutor(6) as pool:
    found = sorted((f for fs in pool.map(lakehouses, workspaces) for f in fs), key=lambda f: (f["workspace"].lower(), f["lakehouse"].lower()))

if "--json" in args:
    print(json.dumps({"tenant": tid, "lakehouses": found, "unchecked": unchecked}, indent=2, ensure_ascii=False))
else:
    print(f"Tenant: {tid}\n{len(workspaces)} workspaces, {len(found)} lakehouses visibles con tu cuenta.\n")
    for f in found:
        print(f"{f['workspace']} / {f['lakehouse']}" + ("" if f["sql_server"] else "  (sin endpoint SQL todavía)"))
    if unchecked:
        print(f"\nNo se pudieron consultar (repite para reintentar): {', '.join(unchecked)}")
    if not found:
        print("Ninguno: tu cuenta no tiene rol en ningún workspace. Pide a IT el endpoint SQL y el nombre del lakehouse.")
