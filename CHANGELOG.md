# Changelog

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
