-- description: Ventas diarias de un producto desde una fecha.
-- params: producto (código), desde (fecha YYYY-MM-DD, incluida)
-- example: P001, 2026-01-01
-- grain: una fila por fecha
-- validated: pendiente
-- reviewer: equipo de datos
-- notes: Ejemplo sintético; sustitúyelo por las consultas de tu equipo.
SELECT fecha, SUM(importe) AS importe
FROM [dbo].[ventas]
WHERE producto = ? AND fecha >= ?
GROUP BY fecha
