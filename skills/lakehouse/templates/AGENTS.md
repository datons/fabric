# <Proyecto>

<Qué responde este proyecto y para quién, en una frase.>

## Datos

- Lakehouses en `fabric.toml`; se consultan con `/fabric:lakehouse` y la identidad de cada persona (Azure CLI). Sin secretos en el repositorio.
- `docs/tables.md`: qué significa cada tabla (grano, unidades, trampas). Léelo antes de escribir SQL.
- `queries/`: una consulta por fichero `.sql` con su cabecera. Si una encaja, se usa tal cual; si no, la nueva se guarda con `validated: pending` y la valida el revisor.

## Estructura

- `src/<project>/`: código que se reutiliza; la conexión vive en `lakehouse.py` (`query()`, `query_file()`, comando `uv run query`).
- `random/`: scripts puntuales; importan el paquete, no repiten la conexión. Lo que se reutiliza pasa a `src/` con su comando.
- `app/`: aplicaciones y cuadros de mando (SvelteKit con Bun).
- `output/`: gráficos y ficheros generados; fuera de git.
- Nada suelto en la raíz. Nombres de ficheros, carpetas, funciones y comandos en inglés.

## Reglas

- Python con `uv`, nunca `pip`.
- Nunca datos descargados, credenciales ni `.env` en git.
