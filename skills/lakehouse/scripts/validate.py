# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["mssql-python==1.6.0", "azure-identity"]
# ///
"""Ejecuta cada consulta de queries_dir con sus parámetros `example` y comprueba que devuelve filas y que no hay duplicados en el grano declarado. Uso: uv run validate.py [fabric.toml] [consulta.sql ...]"""

import sys
import tomllib
from pathlib import Path

REQUIRED = ("description", "params", "example", "grain", "validated", "reviewer")


def header(sql: str) -> dict[str, str]:
    """Leading `-- key: value` comment lines, up to the first non-comment line."""
    meta = {}
    for line in sql.splitlines():
        if not line.startswith("--"):
            break
        key, sep, value = line[2:].partition(":")
        if sep:
            meta[key.strip()] = value.strip()
    return meta


def example_params(meta: dict[str, str]) -> tuple[str, ...]:
    return tuple(p.strip() for p in meta["example"].split(",")) if meta.get("example") else ()


def header_problems(sql: str, meta: dict[str, str]) -> list[str]:
    problems = [f"falta '{k}' en la cabecera" for k in REQUIRED if k not in meta]
    if not problems and len(example_params(meta)) != sql.count("?"):
        problems.append(f"example tiene {len(example_params(meta))} valores y la consulta {sql.count('?')} parámetros")
    return problems


def result_problems(meta: dict[str, str], cols: list[str], rows: list[tuple]) -> list[str]:
    if not rows:
        return ["no devuelve filas con los parámetros de example"]
    # grain reads "una fila por a y b": the result columns named there must be unique together.
    keys = [c for c in cols if c in meta["grain"]]
    if keys and len({tuple(r[cols.index(k)] for k in keys) for r in rows}) != len(rows):
        return [f"filas duplicadas para el grano ({', '.join(keys)})"]
    return []


def main(argv: list[str]) -> int:
    import mssql_python

    cfg_path = Path(argv[0] if argv else "fabric.toml")
    cfg = tomllib.loads(cfg_path.read_text())["fabric"]
    queries_dir = cfg_path.parent / cfg.get("queries_dir", "consultas")
    files = [Path(f) for f in argv[1:]] or sorted(queries_dir.glob("*.sql"))
    conn_str = f"Server={cfg['sql_server']};Database={cfg['database']};Authentication=ActiveDirectoryDefault;Encrypt=yes"

    failed = 0
    with mssql_python.connect(conn_str) as conn:
        for f in files:
            sql = f.read_text()
            meta = header(sql)
            problems = header_problems(sql, meta)
            rows: list[tuple] = []
            if not problems:
                params = example_params(meta)
                try:
                    with conn.cursor() as cur:
                        cur.execute(sql, params) if params else cur.execute(sql)
                        cols = [c[0] for c in cur.description]
                        rows = [tuple(r) for r in cur.fetchall()]
                    problems = result_problems(meta, cols, rows)
                except Exception as e:  # noqa: BLE001 (report the driver error verbatim)
                    problems = [f"{type(e).__name__}: {str(e)[:300]}"]
            failed += bool(problems)
            status = f"[OK] {f.name} ({len(rows)} filas)" if not problems else f"[FALLO] {f.name}"
            print(status + "".join(f"\n       {p}" for p in problems))

    print(f"\n{len(files) - failed}/{len(files)} consultas válidas.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
