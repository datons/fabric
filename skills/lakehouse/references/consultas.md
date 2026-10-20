# Consultas validadas del equipo

Una consulta validada es la respuesta acordada por el equipo a una pregunta. Viven en `queries_dir` (ver `fabric.toml`), una por fichero `.sql`, y se cambian mediante la revisión del repositorio del equipo.

## Usarlas

- Ejecútala tal cual con `query(Path(fichero).read_text(), params, lakehouse)`, con los parámetros en el orden de `params` y el lakehouse de su línea `lakehouse` si la tiene.
- Di qué fichero has usado y si está validada (`validated` con fecha) o pendiente.
- No cambies su SQL sobre la marcha. Si necesita un cambio, propón el cambio en el fichero.

## Proponer una nueva

Si el usuario va a reutilizar una consulta a medida, ofrece guardarla en `queries_dir` como borrador con `validated: pendiente`. La valida el revisor del equipo; tú nunca pones la fecha en `validated`.

## Formato

Fichero `.sql` con una cabecera de comentarios. Todas las claves son obligatorias salvo `lakehouse` y `notes`:

```sql
-- description: qué pregunta responde, en una frase
-- params: nombre (significado/formato), en el orden de los ?
-- example: valor1, valor2
-- grain: una fila por <col> y <col>
-- validated: AAAA-MM-DD o pendiente
-- reviewer: equipo o rol que la valida
-- lakehouse: nombre del bloque en fabric.toml (sin esta línea, el default)
-- notes: trampas que resuelve
SELECT ...
```

Con un solo lakehouse, omite `lakehouse`. Con varios, ponlo siempre: la misma tabla puede existir en desarrollo y en producción con datos distintos.

## Validar

```bash
bun scripts/validate.ts fabric.toml [fichero.sql ...]
```

Con solo Python: `uv run scripts/validate.py fabric.toml [fichero.sql ...]`. Las dos versiones aplican las mismas reglas.

Ejecuta cada consulta con sus valores de `example` y falla si:

- falta una clave de la cabecera,
- no cuadra el número de valores de `example` con los `?`,
- no devuelve filas,
- hay filas duplicadas para las columnas que nombra `grain`.

Pasar el validador no hace válida una consulta: solo el revisor pone la fecha en `validated`.
