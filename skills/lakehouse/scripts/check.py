# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["mssql-python==1.6.0", "azure-identity"]
# ///
"""Comprueba paso a paso el acceso a un lakehouse de Fabric descrito en fabric.toml. Uso: uv run check.py [ruta/a/fabric.toml]"""

import shutil
import sys
import tomllib
from pathlib import Path

import mssql_python

ok = True


def step(label: str, passed: bool, detail: str = "") -> bool:
    global ok
    ok &= passed
    print(f"[{'OK' if passed else 'FALLO'}] {label}" + (f"\n       {detail}" if detail else ""))
    return passed


path = Path(sys.argv[1] if len(sys.argv) > 1 else "fabric.toml")
if not step(f"Configuración ({path})", path.exists(), "" if path.exists() else "Crea fabric.toml con los datos que te ha dado tu equipo de IT."):
    sys.exit(1)
cfg = tomllib.loads(path.read_text())["fabric"]

has_az = shutil.which("az") is not None
if not step("Azure CLI instalado", has_az, "" if has_az else "Instala Azure CLI y abre un terminal nuevo."):
    sys.exit(1)

conn_str = f"Server={cfg['sql_server']};Database={cfg['database']};Authentication=ActiveDirectoryDefault;Encrypt=yes"
try:
    with mssql_python.connect(conn_str) as conn, conn.cursor() as cur:
        cur.execute("SELECT USER_NAME()")
        step(f"Conexión al lakehouse {cfg['database']}", True, f"como {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA', 'queryinsights', '_mlv_system')")
        n = cur.fetchone()[0]
        step("Tablas visibles con tus permisos", n > 0, f"{n} tablas" if n else "Pide a IT permiso de lectura sobre el lakehouse.")
except Exception as e:  # noqa: BLE001 (show the driver error verbatim)
    msg = str(e)
    signed_out = "Credential" in msg or "az login" in msg
    hint = f"Inicia sesión: az login --tenant {cfg['tenant']} --allow-no-subscriptions" if signed_out else "Pide a IT permiso de lectura sobre el SQL analytics endpoint."
    step(f"Conexión al lakehouse {cfg['database']}", False, f"{hint}\n       {type(e).__name__}: {msg[:300]}")

print("\nTodo listo." if ok else "\nAlgo ha fallado: copia este resultado y envíaselo a tu equipo de datos.")
sys.exit(0 if ok else 1)
