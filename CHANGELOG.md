# Changelog

## 0.6.1

- La plantilla de `AGENTS.md` dice cuándo usar `/fabric:lakehouse`: preguntas con datos, SQL, consultas de `queries/`, código que conecta con el lakehouse, lakehouses nuevos, acceso y Delta.

## 0.6.0

- «Configura este proyecto» deja el proyecto completo, no solo `fabric.toml`: comprueba el acceso, crea `AGENTS.md`, `.claude/settings.json`, `.gitignore`, el paquete uv con la conexión y el comando `query`, `random/`, `queries/`, `docs/tables.md` con las tablas que usará el usuario, `output/` fuera de git y el primer commit (`references/setup.md`). En un proyecto existente solo añade lo que falta.
- Las plantillas pasan a `skills/lakehouse/templates/`, para que la skill las use al configurar, con `AGENTS.md` y `.gitignore` nuevos.

## 0.5.0

- Nombres de código en inglés; mensajes y documentación, en el idioma del usuario. `query_file()` sustituye a `consulta()` y el comando `query` a `consultar`. Plantilla y valores por defecto: `queries/`, `docs/tables.md`, `docs/brand.md`, `output/` y `validated: pending`. Las referencias de la skill pasan a `references/queries.md` y `references/setup.md`.
- Compatibilidad: sin `queries_dir`, la carpeta por defecto es ahora `queries/`. Los proyectos que declaran `queries_dir = "consultas"` no cambian.

## 0.4.1

- Python como paquete de uv: la conexión vive en `src/<proyecto>/lakehouse.py` (`query()`, `consulta()` y el comando `uv run consultar <consulta.sql> …`), los scripts puntuales en `random/` y lo que se reutiliza pasa a un módulo de `src/`. Nada suelto en la raíz. La conexión encuentra `fabric.toml` desde cualquier subcarpeta.

## 0.4.0

- Configuración sin pedir valores a IT: `scripts/discover.ts` (y `discover.py`) lista con la sesión de Azure CLI los lakehouses que ve la cuenta, y la skill escribe `fabric.toml` con los que elija el usuario (`references/configurar.md`).
- Varios lakehouses por proyecto: bloques `[fabric.lakehouses.<nombre>]` con `default`. El formato de un solo lakehouse bajo `[fabric]` sigue funcionando. Las consultas validadas pueden indicar el suyo con `-- lakehouse:`; `check` comprueba todos y `validate` usa el de cada consulta.
- La skill exige que el código, la configuración y las consultas vivan en el proyecto, con la conexión Python en `lakehouse.py`, nunca en una carpeta temporal.
- `check.ts` funciona con el plugin instalado por Claude Code: sus dependencias también están en el `package.json` raíz, porque Claude Code las instala ahí y con ese `node_modules` Bun no instalaba las de `scripts/`.
- `check` distingue un fallo de red (VPN, puerto 1433) de la falta de permisos.

## 0.3.1

- `templates/docs/marca.md`: la identidad visual del equipo (colores, tipografía, logotipo) para informes y cuadros de mando, junto a la guía de tablas.

## 0.3.0

- TypeScript junto a Python: `references/typescript.md` enseña un módulo de servidor SvelteKit con `tedious` y la sesión de Azure CLI para cuadros de mando; Python queda para análisis puntuales.
- `check.ts` y `validate.ts` con Bun, que instala sus dependencias la primera vez; `check.py` y `validate.py` siguen para quien solo usa Python, con las mismas reglas.
- El validador ya no cuenta como parámetro un `?` dentro de un texto, un nombre entre corchetes o un comentario (versión Bun).

## 0.2.0

- Repositorio propio (`datons/fabric`), separado del catálogo `datons/agent-plugins`.
- La skill `lakehouse` carga el detalle bajo demanda: `references/sql.md`, `references/consultas.md`, `references/onelake.md`.
- `templates/` para arrancar el repositorio de consultas de un equipo, con instalación automática del plugin.
- `validate.py` separa reglas y ejecución; tests de las reglas en CI.

## 0.1.x

- Primera versión dentro de `datons/agent-plugins`.
