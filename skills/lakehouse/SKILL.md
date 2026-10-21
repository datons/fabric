---
name: lakehouse
description: "Consulta uno o varios lakehouses de Microsoft Fabric en el ordenador del usuario y con su propia identidad de Microsoft: cuadros de mando en SvelteKit/TypeScript con tedious y análisis puntuales en Python con mssql-python, más tablas Delta de OneLake con deltalake. Configura el proyecto descubriendo los lakehouses que ve su cuenta, prioriza las consultas validadas del equipo y comprueba el acceso. Use when the project has a fabric.toml, or the user says 'configura este proyecto', 'configura esta carpeta como mi proyecto', 'configura Fabric en este proyecto', 'conecta este proyecto al datalake', 'consulta el lakehouse', 'qué tablas hay en Fabric', 'lee la tabla X del datalake', 'comprueba mi acceso a Fabric', 'conéctate a OneLake', 'guarda esta consulta como validada', 'haz un cuadro de mando con los datos del lakehouse'."
argument-hint: "[pregunta sobre los datos]"
---

# Lakehouse de Microsoft Fabric desde TypeScript o Python

Escribe código normal sobre librerías oficiales. No hay paquete intermedio: la conexión son pocas líneas y el usuario debe poder leerlas.

Elige el lenguaje por lo que se va a construir:

- **Cuadro de mando o aplicación** → SvelteKit y TypeScript, con la consulta en el servidor (`references/typescript.md`).
- **Análisis puntual, cuaderno o informe** → Python con `uv` (apartado 3).

Si el usuario no lo dice, pregúntale qué quiere obtener; si el proyecto ya tiene `package.json` con SvelteKit o un `pyproject.toml`, sigue con ese lenguaje.

Las rutas `scripts/...` y `references/...` son relativas a la carpeta de esta skill. Lee cada referencia solo cuando la necesites:

| Cuándo | Referencia |
|---|---|
| Si falta `fabric.toml`, la carpeta está vacía, piden configurar el proyecto o añadir un lakehouse | `references/setup.md` |
| Antes de escribir SQL a medida | `references/sql.md` |
| Cuadros de mando y aplicaciones en SvelteKit | `references/typescript.md` |
| Al usar, guardar o validar consultas del equipo | `references/queries.md` |
| Si el endpoint SQL falla con NaN, o hay que leer ficheros Delta | `references/onelake.md` |

## 1. Lee o crea la configuración del proyecto

Busca `fabric.toml` en la raíz del proyecto. Si no existe, o el usuario pide configurar el proyecto, sigue `references/setup.md`: crea `fabric.toml` con la sesión del usuario (sin pedirle valores a mano), comprueba el acceso y deja la estructura completa del proyecto, con su `AGENTS.md`.

```toml
[fabric]
tenant = "<tenant-id>"
default = "metering"                     # el que se usa si el código no indica otro
tables_guide = "docs/tables.md"         # opcional: qué significa cada tabla
queries_dir = "queries"               # opcional: consultas validadas del equipo

[fabric.lakehouses.metering]             # uno o varios; el nombre es el que se usa en el código
sql_server = "<id>.datawarehouse.fabric.microsoft.com"
database = "<nombre del lakehouse>"
workspace_id = "<guid del workspace>"   # solo para leer Delta desde OneLake
lakehouse_id = "<guid del lakehouse>"   # solo para leer Delta desde OneLake
```

Un proyecto con un solo lakehouse puede tener `sql_server` y `database` directamente bajo `[fabric]`, como en versiones anteriores. Si el usuario necesita otro lakehouse, añade otro bloque `[fabric.lakehouses.<name>]` con `references/setup.md`.

Si hay `tables_guide`, léelo antes de escribir ninguna consulta: ahí están el significado, el grano y las unidades de las tablas.

`fabric.toml` no contiene secretos, pero describe la infraestructura del cliente: no copies sus valores en código, ejemplos ni repositorios compartidos. Léelos del fichero al ejecutar.

El código, la configuración y las consultas viven en la carpeta del proyecto, nunca en una carpeta temporal: el usuario debe poder volver a ejecutarlos sin ti.

## 2. Comprueba el acceso

Ejecuta la comprobación una vez por equipo, o cuando falle una conexión:

```bash
bun scripts/check.ts fabric.toml
```

Bun instala solo sus dependencias la primera vez. Si el usuario trabaja únicamente en Python y no tiene Bun, la misma comprobación es `uv run scripts/check.py fabric.toml`.

Comprueba todos los lakehouses del fichero; añade su nombre para comprobar solo uno (`bun scripts/check.ts fabric.toml metering`). Informa OK/FALLO de: configuración, Azure CLI, conexión SQL de cada lakehouse (y con qué usuario) y tablas visibles. Si algo falla, muestra al usuario el arreglo exacto que imprime el script; no improvises atajos ni otras credenciales.

El inicio de sesión es `az login --tenant <tenant>` (con `--allow-no-subscriptions` si la cuenta no tiene suscripción de Azure). Fabric aplica a cada consulta los permisos del propio usuario.

## 2b. Comprueba la estructura del proyecto

La primera vez que uses esta skill en un proyecto durante la sesión, ejecuta `bun scripts/check.ts fabric.toml --layout` (sin conectar; con Python, `uv run scripts/check.py fabric.toml --layout`). Compara el proyecto con la estructura actual, definida en `templates/layout.json`, y lista cada diferencia con su arreglo. `check` sin `--layout` también imprime estos avisos al final.

Si hay avisos, antes de la tarea propón la reestructuración **una vez**:

1. Enseña la lista de cambios concretos: qué se mueve con `git mv`, qué se crea desde `templates/`, qué imports y claves de `fabric.toml` cambian.
2. Espera a que el usuario acepte. Si dice que no, sigue con la tarea y no lo vuelvas a proponer en esta sesión.
3. Si acepta, aplícalo en un commit propio, separado de la tarea, sin cambiar lo que hace el código. Vuelve a ejecutar `--layout` hasta que diga «al día» y comprueba que los scripts movidos siguen funcionando.

En un repositorio con una estructura propia deliberada (una aplicación o un producto que usa este plugin), menciona solo los avisos de datos (`AGENTS.md`, `fabric.toml`, consultas) y no propongas mover su código.

## 3. Conecta y consulta desde Python

Para TypeScript y SvelteKit, sigue `references/typescript.md`. En Python, el proyecto es un paquete de uv:

```
src/<project>/lakehouse.py    la conexión, una sola vez: query() y query_file()
random/                       scripts puntuales: importan el paquete, no repiten la conexión
output/                       gráficos y ficheros generados (fuera de git)
queries/                      SQL validado o pendiente
```

- Créalo con `uv init --lib --name <project> --python 3.12 --vcs none` y `uv add "mssql-python==1.6.0" azure-identity pandas`. `<project>` es el nombre de la carpeta en snake_case. Nombres de ficheros, carpetas, funciones y comandos en inglés; los mensajes y la documentación, en el idioma del usuario. Fija `mssql-python==1.6.0`: la 1.7.0 falla en macOS con Python 3.12.
- Registra el comando `query` en `pyproject.toml` (`[project.scripts]` → `query = "<project>.lakehouse:main"`), para ejecutar una consulta sin escribir código: `uv run query daily-energy.sql EX02AL 2026-08-01 2026-08-08`.
- Un análisis puntual va en `random/` y se ejecuta con `uv run random/<script>.py`. Cuando se vaya a reutilizar, pásalo a un módulo de `src/<project>/` con su comando en `[project.scripts]`; nada en `src/` importa de `random/`.
- Nunca dejes scripts sueltos en la raíz ni en una carpeta temporal.

```python
# src/<project>/lakehouse.py
"""Connection to the lakehouses in fabric.toml with the Azure CLI session."""

import sys
import tomllib
from pathlib import Path

import mssql_python
import pandas as pd


def _root() -> Path:
    """The folder holding fabric.toml, searched upwards, so it works from any subfolder."""
    for d in [Path.cwd(), *Path.cwd().parents]:
        if (d / "fabric.toml").exists():
            return d
    sys.exit("No encuentro fabric.toml en esta carpeta ni en las superiores.")


ROOT = _root()
fabric = tomllib.loads((ROOT / "fabric.toml").read_text())["fabric"]
lakehouses = fabric.get("lakehouses") or {fabric["database"]: fabric}


def query(sql: str, params: tuple = (), lakehouse: str | None = None) -> pd.DataFrame:
    cfg = lakehouses[lakehouse or fabric.get("default") or next(iter(lakehouses))]
    conn_str = f"Server={cfg['sql_server']};Database={cfg['database']};Authentication=ActiveDirectoryDefault;Encrypt=yes"
    with mssql_python.connect(conn_str) as conn, conn.cursor() as cur:
        cur.execute(sql, params) if params else cur.execute(sql)
        return pd.DataFrame.from_records([tuple(r) for r in cur.fetchall()], columns=[c[0] for c in cur.description])


def query_file(name: str, params: tuple = ()) -> pd.DataFrame:
    """A query from queries_dir as is, on the lakehouse named in its `-- lakehouse:` line."""
    sql = (ROOT / fabric.get("queries_dir", "queries") / name).read_text()
    target = next((line.split(":", 1)[1].strip() for line in sql.splitlines() if line.startswith("-- lakehouse:")), None)
    return query(sql, params, target)


def main() -> None:
    """uv run query <file.sql> [params...]"""
    if len(sys.argv) < 2:
        sys.exit("Uso: uv run query <consulta.sql> [parámetros...]")
    print(query_file(Path(sys.argv[1]).name, tuple(sys.argv[2:])).to_string(index=False))
```

`ActiveDirectoryDefault` usa la sesión de Azure CLI: no hace falta gestionar tokens ni instalar el driver ODBC. Con varios lakehouses, indica cuál en cada llamada (`query(sql, params, lakehouse="pro")`); sin indicarlo se usa `default`.

## 4. Primero, las consultas validadas

Si hay `queries_dir`, busca ahí antes de escribir SQL. Si una consulta encaja, ejecútala tal cual con `query_file(fichero, params)`, que usa el lakehouse de su línea `-- lakehouse:`, y di qué fichero has usado. Si ninguna encaja, escribe una a medida siguiendo `references/sql.md` y marca el resultado como **no validado**. El formato de las consultas, cómo proponer una nueva y cómo validarlas están en `references/queries.md`.

## 5. Errores frecuentes

| Error | Qué significa | Arreglo |
|---|---|---|
| `DefaultAzureCredential failed` / sin sesión de Azure CLI | No ha iniciado sesión, o la tiene en otro tenant | `az login --tenant <tenant>` |
| `Login failed` / `Cannot open database` | Sesión correcta, pero sin acceso a ese lakehouse | Pedir a IT lectura sobre el SQL analytics endpoint |
| `Invalid object name` | Esquema equivocado o nombre con puntos sin corchetes | Ver `references/sql.md` |
| Error de conversión / NaN en una columna decimal | El endpoint SQL no transporta NaN | Ver `references/onelake.md` |
