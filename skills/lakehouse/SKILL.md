---
name: lakehouse
description: "Consulta un lakehouse de Microsoft Fabric desde Python en el ordenador del usuario y con su propia identidad de Microsoft: SQL analytics endpoint con mssql-python y tablas Delta de OneLake con deltalake. Prioriza las consultas validadas del equipo y comprueba el acceso. Use when the project has a fabric.toml, or the user says 'consulta el lakehouse', 'qué tablas hay en Fabric', 'lee la tabla X del datalake', 'comprueba mi acceso a Fabric', 'conéctate a OneLake', 'guarda esta consulta como validada'."
argument-hint: "[pregunta sobre los datos]"
---

# Lakehouse de Microsoft Fabric desde Python

Escribe Python normal sobre las librerías oficiales de Microsoft. No hay paquete intermedio: la conexión son cinco líneas y el usuario debe poder leerlas.

Las rutas `scripts/...` y `references/...` son relativas a la carpeta de esta skill. Lee cada referencia solo cuando la necesites:

| Cuándo | Referencia |
|---|---|
| Antes de escribir SQL a medida | `references/sql.md` |
| Al usar, guardar o validar consultas del equipo | `references/consultas.md` |
| Si el endpoint SQL falla con NaN, o hay que leer ficheros Delta | `references/onelake.md` |

## 1. Lee la configuración del proyecto

Busca `fabric.toml` en la raíz del proyecto. Si no existe, pide los valores al usuario (los tiene su equipo de IT) y créalo:

```toml
[fabric]
tenant = "<tenant-id>"
sql_server = "<id>.datawarehouse.fabric.microsoft.com"   # lakehouse > SQL analytics endpoint > cadena de conexión
database = "<nombre del lakehouse>"
workspace_id = "<guid del workspace>"   # solo para leer Delta desde OneLake
lakehouse_id = "<guid del lakehouse>"   # solo para leer Delta desde OneLake
tables_guide = "docs/tablas.md"         # opcional: qué significa cada tabla
queries_dir = "consultas"               # opcional: consultas validadas del equipo
```

Si hay `tables_guide`, léelo antes de escribir ninguna consulta: ahí están el significado, el grano y las unidades de las tablas.

`fabric.toml` no contiene secretos, pero describe la infraestructura del cliente: no copies sus valores en código, ejemplos ni repositorios compartidos. Léelos del fichero al ejecutar.

## 2. Comprueba el acceso

Ejecuta la comprobación una vez por equipo, o cuando falle una conexión:

```bash
uv run scripts/check.py fabric.toml
```

Informa OK/FALLO de: configuración, Azure CLI, conexión SQL (y con qué usuario) y tablas visibles. Si algo falla, muestra al usuario el arreglo exacto que imprime el script; no improvises atajos ni otras credenciales.

El inicio de sesión es `az login --tenant <tenant>` (con `--allow-no-subscriptions` si la cuenta no tiene suscripción de Azure). Fabric aplica a cada consulta los permisos del propio usuario.

## 3. Conecta y consulta

Los scripts declaran sus dependencias en la cabecera para que `uv run script.py` funcione sin instalar nada. Fija `mssql-python==1.6.0`: la 1.7.0 falla en macOS con Python 3.12.

```python
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["mssql-python==1.6.0", "azure-identity", "pandas"]
# ///
import tomllib
from pathlib import Path

import mssql_python
import pandas as pd

cfg = tomllib.loads(Path("fabric.toml").read_text())["fabric"]


def query(sql: str, params: tuple = ()) -> pd.DataFrame:
    conn_str = f"Server={cfg['sql_server']};Database={cfg['database']};Authentication=ActiveDirectoryDefault;Encrypt=yes"
    with mssql_python.connect(conn_str) as conn, conn.cursor() as cur:
        cur.execute(sql, params) if params else cur.execute(sql)
        return pd.DataFrame.from_records([tuple(r) for r in cur.fetchall()], columns=[c[0] for c in cur.description])
```

`ActiveDirectoryDefault` usa la sesión de Azure CLI: no hace falta gestionar tokens ni instalar el driver ODBC.

## 4. Primero, las consultas validadas

Si hay `queries_dir`, busca ahí antes de escribir SQL. Si una consulta encaja, ejecútala tal cual con `query(Path(fichero).read_text(), params)` y di qué fichero has usado. Si ninguna encaja, escribe una a medida siguiendo `references/sql.md` y marca el resultado como **no validado**. El formato de las consultas, cómo proponer una nueva y cómo validarlas están en `references/consultas.md`.

## 5. Errores frecuentes

| Error | Qué significa | Arreglo |
|---|---|---|
| `DefaultAzureCredential failed` / sin sesión de Azure CLI | No ha iniciado sesión, o la tiene en otro tenant | `az login --tenant <tenant>` |
| `Login failed` / `Cannot open database` | Sesión correcta, pero sin acceso a ese lakehouse | Pedir a IT lectura sobre el SQL analytics endpoint |
| `Invalid object name` | Esquema equivocado o nombre con puntos sin corchetes | Ver `references/sql.md` |
| Error de conversión / NaN en una columna decimal | El endpoint SQL no transporta NaN | Ver `references/onelake.md` |
