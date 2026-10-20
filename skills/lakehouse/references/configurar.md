# Configurar el proyecto con la sesión del usuario

`fabric.toml` se crea a partir de lo que la cuenta del usuario ya puede ver en Fabric. No le pidas que copie tenants ni cadenas de conexión.

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

Un bloque por lakehouse elegido. Nómbralo corto y con sentido para el usuario (`medidas`, `pro`), no con el nombre técnico; el nombre es el que usará en el código y en las consultas. Si hay varios, pon `default` en el que más usará.

```toml
[fabric]
tenant = "<tenant del paso 2>"
default = "medidas"
tables_guide = "docs/tablas.md"
queries_dir = "consultas"

[fabric.lakehouses.medidas]
sql_server = "<sql_server>"
database = "<lakehouse>"
workspace_id = "<workspace_id>"
lakehouse_id = "<lakehouse_id>"
```

Para añadir un lakehouse a un proyecto que ya tiene `fabric.toml`, repite el paso 2 y añade solo el bloque nuevo. Si el fichero tiene `sql_server` y `database` directamente bajo `[fabric]`, pásalos antes a su propio bloque `[fabric.lakehouses.<nombre>]` y pon `default` en él, para que el código existente siga usando el mismo.

## 4. Comprueba y documenta

1. `bun scripts/check.ts fabric.toml`: debe dar OK en cada lakehouse.
2. Si no existe `tables_guide`, ofrece crearlo con las tablas que el usuario vaya a usar (columnas de `INFORMATION_SCHEMA.COLUMNS`, ver `references/sql.md`). Lo que no se deduce de los metadatos (significado, grano, unidades) se marca **por confirmar** hasta que el usuario o su equipo lo valide.
3. Crea `queries_dir` vacío si no existe. Las consultas validadas las añade el equipo.

`fabric.toml` no lleva secretos y puede ir al repositorio del equipo; no lo publiques fuera de la organización.
