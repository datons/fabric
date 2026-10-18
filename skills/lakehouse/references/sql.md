# SQL a medida en el SQL analytics endpoint

## Explora antes de consultar

No inventes nombres de tablas ni de columnas. Lista y describe primero:

```sql
SELECT TABLE_SCHEMA, TABLE_NAME, '[' + TABLE_SCHEMA + '].[' + TABLE_NAME + ']' AS sql_name
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA', 'queryinsights', '_mlv_system');

SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION;
```

Mira unas filas (`SELECT TOP 5 *`) y, antes de agregar, el rango de fechas de cada valor de las columnas de categoría (resolución, versión, sesión):

- Las categorías que se solapan en el tiempo cuentan dos veces al sumar.
- Las versiones acumuladas (una foto completa por sesión) no se suman nunca.

Lo que aprendas de una tabla va al `tables_guide` del proyecto, no a comentarios en el código.

## Reglas de T-SQL

- Los nombres de tabla pueden llevar puntos (`origen.tabla` dentro del esquema `dbo`). Usa siempre el `sql_name` entre corchetes: `[dbo].[origen.tabla]`.
- `TOP n`, no `LIMIT n`.
- Filtra por fecha y agrega en SQL; no traigas tablas enteras a pandas.
- Los valores van como parámetros `?`, nunca formateados dentro del SQL.
- Hay columnas guardadas como texto (fechas, cuartos de hora): mira `DATA_TYPE` y convierte explícitamente.
- El endpoint es de solo lectura: solo SELECT.
- En tablas que son accesos directos, `INFORMATION_SCHEMA.COLUMNS` puede venir vacío; entonces usa `SELECT TOP 5 *` para ver las columnas.
