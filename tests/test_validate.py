import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("validate", Path(__file__).parents[1] / "skills/lakehouse/scripts/validate.py")
validate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validate)

GOOD = """-- description: energía diaria por unidad
-- params: unidad, desde
-- example: U1, 2026-01-01
-- grain: una fila por fecha y programa
-- validated: pendiente
-- reviewer: equipo de datos
SELECT fecha, programa, SUM(energia) FROM [dbo].[t] WHERE unidad = ? AND fecha >= ? GROUP BY fecha, programa
"""


def test_header_stops_at_first_sql_line():
    meta = validate.header(GOOD + "-- trailing: ignored\n")
    assert meta["grain"] == "una fila por fecha y programa"
    assert "trailing" not in meta


def test_complete_header_passes():
    assert validate.header_problems(GOOD, validate.header(GOOD)) == []


def test_missing_keys_and_param_mismatch_are_reported():
    assert validate.header_problems("SELECT 1", {}) == [f"falta '{k}' en la cabecera" for k in validate.REQUIRED]
    bad = GOOD.replace("-- example: U1, 2026-01-01", "-- example: U1")
    assert "example tiene 1 valores" in validate.header_problems(bad, validate.header(bad))[0]


def test_empty_result_and_duplicate_grain_fail():
    meta = validate.header(GOOD)
    cols = ["fecha", "programa", "energia"]
    assert validate.result_problems(meta, cols, []) == ["no devuelve filas con los parámetros de example"]
    dup = [("2026-01-01", "A", 1.0), ("2026-01-01", "A", 2.0)]
    assert validate.result_problems(meta, cols, dup) == ["filas duplicadas para el grano (fecha, programa)"]
    assert validate.result_problems(meta, cols, [("2026-01-01", "A", 1.0), ("2026-01-01", "B", 2.0)]) == []
