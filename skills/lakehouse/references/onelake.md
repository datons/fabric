# Tablas Delta directamente desde OneLake

El endpoint SQL no transporta NaN ni Infinity en columnas decimales: la lectura entera falla con un error de conversión, antes de que se evalúe ninguna expresión del SELECT. Para esas tablas lee los ficheros Delta directamente; los NaN llegan intactos y los limpias en pandas.

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["deltalake", "pandas", "pyarrow"]
# ///
import tomllib
from pathlib import Path

from deltalake import DeltaTable

fabric = tomllib.loads(Path("fabric.toml").read_text())["fabric"]
lakehouses = fabric.get("lakehouses") or {fabric["database"]: fabric}
cfg = lakehouses[fabric.get("default") or next(iter(lakehouses))]  # o lakehouses["<name>"]
url = f"abfss://{cfg['workspace_id']}@onelake.dfs.fabric.microsoft.com/{cfg['lakehouse_id']}/Tables/dbo/<table>"
df = DeltaTable(url, storage_options={"use_azure_cli": "true", "use_fabric_endpoint": "true"}).to_pandas()
```

Necesita `workspace_id` y `lakehouse_id` en el bloque del lakehouse en `fabric.toml`; `scripts/discover.ts` los da si faltan. Para tablas grandes, filtra con `DeltaTable(...).to_pandas(filters=[...])` o `columns=[...]` en vez de leerla entera.

## Errores

Un 403 `User is not authorized ... for workspace` en una tabla que es un acceso directo significa que el usuario no tiene lectura en OneLake sobre el workspace *de origen* del acceso directo, aunque sí la tenga sobre el que lo monta. Es un permiso que da su equipo de IT, no un problema del código.
