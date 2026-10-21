# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["mssql-python==1.6.0", "azure-identity"]
# ///
"""Comprueba paso a paso el acceso a cada lakehouse de fabric.toml y avisa de lo que no sigue la estructura actual. Uso: uv run check.py [ruta/a/fabric.toml] [lakehouse] [--layout]; con --layout solo revisa la estructura, sin conectar."""

import shutil
import sys
from pathlib import Path

import mssql_python
from validate import lakehouse, layout_problems, parse_config

NO_NETWORK = "No se llega al servidor: comprueba la red o la VPN y repite. Si sigue fallando, IT debe permitir la salida al puerto 1433."

ok = True


def step(label: str, passed: bool, detail: str = "") -> bool:
    global ok
    ok &= passed
    print(f"[{'OK' if passed else 'FALLO'}] {label}" + (f"\n       {detail}" if detail else ""))
    return passed


layout_only = "--layout" in sys.argv
args = [a for a in sys.argv[1:] if a != "--layout"]
path = Path(args[0] if args else "fabric.toml")


def print_advice() -> None:
    """Structure advice: never changes the result, the skill proposes the restructuring."""
    advice = layout_problems(path.parent, path.read_text())
    print(f"\nEstructura del proyecto: {len(advice)} avisos (templates/layout.json)\n" + "\n".join(f"[AVISO] {a}" for a in advice) if advice else "\nEstructura del proyecto: al día.")

if not step(f"Configuración ({path})", path.exists(), "" if path.exists() else "Pide a Claude que lo cree con /fabric:lakehouse: descubre tus lakehouses con tu sesión de Azure."):
    sys.exit(1)
if layout_only:
    print_advice()
    sys.exit(0)
project = parse_config(path.read_text())
names = args[1:2] or list(project["lakehouses"])
if not step("Lakehouses configurados", bool(names), ", ".join(names) or "Añade al menos uno en [fabric.lakehouses.<name>]."):
    sys.exit(1)

has_az = shutil.which("az") is not None
if not step("Azure CLI instalado", has_az, "" if has_az else "Instala Azure CLI y abre un terminal nuevo."):
    sys.exit(1)

for name in names:
    try:
        cfg = lakehouse(project, name)
    except ValueError as e:
        step(f"Lakehouse {name}", False, str(e))
        continue
    conn_str = f"Server={cfg['sql_server']};Database={cfg['database']};Authentication=ActiveDirectoryDefault;Encrypt=yes"
    try:
        with mssql_python.connect(conn_str) as conn, conn.cursor() as cur:
            cur.execute("SELECT USER_NAME()")
            step(f"Conexión a {name} ({cfg['database']})", True, f"como {cur.fetchone()[0]}")
            cur.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA', 'queryinsights', '_mlv_system')")
            n = cur.fetchone()[0]
            step(f"Tablas visibles en {name}", n > 0, f"{n} tablas" if n else "Pide a IT permiso de lectura sobre el lakehouse.")
    except Exception as e:  # noqa: BLE001 (show the driver error verbatim)
        msg = str(e)
        signed_out = "Credential" in msg or "az login" in msg
        unreachable = any(s in msg for s in ("TCP Provider", "timeout", "Timeout", "timed out", "Login timeout"))
        hint = f"Inicia sesión: az login --tenant {cfg['tenant']} --allow-no-subscriptions" if signed_out else NO_NETWORK if unreachable else "Pide a IT permiso de lectura sobre el SQL analytics endpoint."
        step(f"Conexión a {name} ({cfg['database']})", False, f"{hint}\n       {type(e).__name__}: {msg[:300]}")

print_advice()

print("\nTodo listo." if ok else "\nAlgo ha fallado: copia este resultado y envíaselo a tu equipo de datos.")
sys.exit(0 if ok else 1)
