# <Proyecto>

<Qué responde este proyecto y para quién, en una frase.>

## Datos

Todo lo que toque los datos pasa por la skill `/fabric:lakehouse` (plugin `fabric`, que `.claude/settings.json` instala al abrir el proyecto). Úsala para:

- responder una pregunta con datos, explorar tablas o escribir SQL;
- usar, guardar o validar una consulta de `queries/`;
- escribir código que conecte con el lakehouse, en `src/`, `random/` o `app/`;
- añadir un lakehouse, comprobar el acceso o entender un error de conexión;
- leer tablas Delta de OneLake.

- Lakehouses en `fabric.toml`; cada persona consulta con su propia identidad (Azure CLI). Sin secretos en el repositorio.
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
