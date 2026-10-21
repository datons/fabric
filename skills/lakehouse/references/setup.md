# Configurar el proyecto con la sesión del usuario

Un proyecto queda configurado cuando tiene `fabric.toml`, el acceso comprobado y la estructura de abajo. Hazlo entero cuando el usuario pida configurar el proyecto o la carpeta esté vacía; en un proyecto que ya existe, añade solo lo que falte y no sobrescribas nada suyo.

No le pidas que copie tenants ni cadenas de conexión: todo sale de lo que su cuenta ya puede ver en Fabric. Las plantillas están en `templates/`, dentro de esta skill.

## 1. Sesión de Azure

Si `az account show` falla, pide al usuario `az login --allow-no-subscriptions` (lo completa en el navegador). Si su cuenta está en varios tenants y aparece el que no es, `az login --tenant <dominio o id> --allow-no-subscriptions`.

## 2. Descubre los lakehouses

```bash
bun scripts/discover.ts --json
```

Sin Bun: `uv run scripts/discover.py --json`. Devuelve el tenant y, por cada lakehouse visible, el workspace, su id, el lakehouse, su id y `sql_server`. Con muchos workspaces tarda: es una llamada por workspace.

- Enséñale al usuario la lista agrupada por workspace y pregúntale cuáles usará en este proyecto; pueden ser varios.
- Si sabe el workspace o el lakehouse por su nombre, filtra tú la lista en vez de enseñarla entera.
- Un lakehouse con `sql_server` vacío aún no tiene endpoint SQL: no lo ofrezcas para consultas.
- Si la lista sale vacía, la cuenta tiene permiso sobre el endpoint SQL pero ningún rol en el workspace. Pide al usuario el endpoint y el nombre del lakehouse (los tiene su IT) y sigue en el paso 3.

## 3. Escribe fabric.toml

Un bloque por lakehouse elegido. Nómbralo corto y con sentido para el usuario (`metering`, `pro`), en inglés y no con el nombre técnico; el nombre es el que usará en el código y en las consultas. Si hay varios, pon `default` en el que más usará.

```toml
[fabric]
tenant = "<tenant del paso 2>"
default = "metering"
tables_guide = "docs/tables.md"
queries_dir = "queries"

[fabric.lakehouses.metering]
sql_server = "<sql_server>"
database = "<lakehouse>"
workspace_id = "<workspace_id>"
lakehouse_id = "<lakehouse_id>"
```

Para añadir un lakehouse a un proyecto que ya tiene `fabric.toml`, repite el paso 2 y añade solo el bloque nuevo. Si el fichero tiene `sql_server` y `database` directamente bajo `[fabric]`, pásalos antes a su propio bloque `[fabric.lakehouses.<name>]` y pon `default` en él, para que el código existente siga usando el mismo.

`fabric.toml` no lleva secretos y puede ir al repositorio del equipo; no lo publiques fuera de la organización.

## 4. Comprueba el acceso

`bun scripts/check.ts fabric.toml` debe dar OK en cada lakehouse. Si falla, enseña el arreglo que imprime y no sigas hasta resolverlo o hasta que el usuario decida continuar sin acceso.

## 5. Crea la estructura

```
AGENTS.md                    instrucciones del proyecto para cualquier agente
.claude/settings.json        instala este plugin a quien abra el repositorio
.gitignore
fabric.toml
pyproject.toml               paquete uv con el comando query
src/<project>/lakehouse.py   la conexión (SKILL.md, apartado 3)
random/                      scripts puntuales
queries/                     consultas validadas o pendientes
docs/tables.md               qué significa cada tabla
output/                      generado, fuera de git
```

1. Copia de `templates/`: `AGENTS.md` (rellena el nombre del proyecto, su propósito y `<project>`; si el usuario no te lo dice, pregúntaselo en una frase), `.claude/settings.json` y `.gitignore`. No copies `queries/example.sql`, que es un ejemplo sintético, ni `docs/brand.md` salvo que el usuario vaya a hacer informes con su marca.
2. Crea el paquete Python como dice el apartado 3 de `SKILL.md`: `uv init --lib`, dependencias, `lakehouse.py` y el comando `query`. `<project>` es el nombre de la carpeta en snake_case.
3. Crea `random/`, `queries/` y `output/`. Git no guarda carpetas vacías: pon un `.gitkeep` en `random/` y `queries/`.
4. Si ya hay un `AGENTS.md`, añade las secciones que le falten en vez de reemplazarlo. Si hay un `CLAUDE.md` del proyecto, pásalo a `AGENTS.md` con `git mv` y fusiónalos.

No crees `app/` hasta que haga falta un cuadro de mando (`references/typescript.md`).

## 6. Documenta las tablas

Pregunta al usuario con qué datos trabajará y documenta esas tablas en `docs/tables.md`, con el formato de `templates/docs/tables.md`: columnas y tipos de `INFORMATION_SCHEMA.COLUMNS` (ver `references/sql.md`). Lo que no se deduce de los metadatos (significado, grano, unidades, trampas) márcalo **por confirmar** y pregúntaselo; no lo inventes.

## 7. Primer commit

Si la carpeta no es un repositorio, `git init`. Haz un commit con la configuración y la estructura, sin `output/` ni datos. Termina enseñando el árbol del proyecto y el resultado de la comprobación de acceso.
