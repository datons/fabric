# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["mssql-python==1.6.0", "azure-identity"]
# ///
"""Ejecuta cada consulta de queries_dir con sus parámetros `example` en su lakehouse (`-- lakehouse:` o el de por defecto) y comprueba que devuelve filas y que no hay duplicados en el grano declarado. Uso: uv run validate.py [fabric.toml] [consulta.sql ...]"""

import sys
import tomllib
from pathlib import Path

REQUIRED = ("description", "params", "example", "grain", "validated", "reviewer")
LAKEHOUSE_KEYS = ("sql_server", "database", "workspace_id", "lakehouse_id")


def parse_config(text: str) -> dict:
    """`[fabric.lakehouses.<name>]` tables, or the single-lakehouse form with sql_server and database directly under `[fabric]`, which becomes one lakehouse named after its database."""
    fabric = tomllib.loads(text)["fabric"]
    single = {k: fabric.pop(k) for k in LAKEHOUSE_KEYS if k in fabric}
    if "lakehouses" not in fabric:
        fabric["lakehouses"] = {single["database"]: single} if "database" in single else {}
    return fabric


def lakehouse(project: dict, name: str | None = None) -> dict:
    """The named lakehouse, else `default`, else the only one, merged with the project's shared keys."""
    names = list(project["lakehouses"])
    chosen = name or project.get("default") or (names[0] if len(names) == 1 else None)
    if not chosen:
        raise ValueError(f"fabric.toml tiene varios lakehouses ({', '.join(names)}): indica cuál o pon default.")
    if chosen not in project["lakehouses"]:
        raise ValueError(f"No hay lakehouse '{chosen}' en fabric.toml (hay: {', '.join(names) or 'ninguno'}).")
    shared = {k: v for k, v in project.items() if k not in ("lakehouses", "default")}
    return {**shared, **project["lakehouses"][chosen], "name": chosen}


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


LAYOUT_PATH = Path(__file__).parent.parent / "templates" / "layout.json"


def layout_problems(directory: Path, config_text: str, layout: dict | None = None) -> list[str]:
    """What separates the project in `directory` from the current layout (templates/layout.json), as "problem → fix" lines. Advice, not failures: access works with an older layout."""
    import json

    rules = layout or json.loads(LAYOUT_PATH.read_text())
    fabric = tomllib.loads(config_text)["fabric"]

    def fill(s: str) -> str:
        return s.replace("{queries_dir}", str(fabric.get("queries_dir", "queries"))).replace("{tables_guide}", str(fabric.get("tables_guide", "docs/tables.md")))

    problems, missing = [], set()
    for rule in rules["expected"]:
        path = fill(rule["path"])
        if not (directory / path).exists():
            # One line per missing file, with the fix of its first rule (the one that creates it).
            if path not in missing:
                problems.append(f"falta {path} → {fill(rule['fix'])}")
            missing.add(path)
        elif "contains" in rule and rule["contains"] not in (directory / path).read_text():
            problems.append(f"{path} no incluye {rule['contains']} → {fill(rule['fix'])}")
    problems += [f"{r['path']} es de una estructura anterior → {r['fix']}" for r in rules["legacy"] if (directory / r["path"]).exists()]
    loose = sorted(f.name for f in directory.glob(rules["loose_root"]["glob"]))
    if loose:
        problems.append(f"scripts sueltos en la raíz ({', '.join(loose)}) → {rules['loose_root']['fix']}")
    copied = sorted({f.relative_to(directory).as_posix() for g in rules["copied_connection"]["globs"] for f in directory.glob(g) if rules["copied_connection"]["pattern"] in f.read_text()})
    if copied:
        problems.append(f"conexión repetida en {', '.join(copied)} → {rules['copied_connection']['fix']}")
    if "lakehouses" not in fabric and "database" in fabric:
        problems.append(f"fabric.toml con un solo lakehouse bajo [fabric] → {rules['single_lakehouse_form']['fix']}")
    return problems


def main(argv: list[str]) -> int:
    import mssql_python

    cfg_path = Path(argv[0] if argv else "fabric.toml")
    project = parse_config(cfg_path.read_text())
    queries_dir = cfg_path.parent / project.get("queries_dir", "queries")
    files = [Path(f) for f in argv[1:]] or sorted(queries_dir.glob("*.sql"))

    # One connection per lakehouse, opened the first time a query needs it.
    connections: dict = {}

    def conn_for(name: str | None):
        cfg = lakehouse(project, name)
        if cfg["name"] not in connections:
            connections[cfg["name"]] = mssql_python.connect(f"Server={cfg['sql_server']};Database={cfg['database']};Authentication=ActiveDirectoryDefault;Encrypt=yes")
        return connections[cfg["name"]]

    failed = 0
    try:
        for f in files:
            sql = f.read_text()
            meta = header(sql)
            problems = header_problems(sql, meta)
            rows: list[tuple] = []
            if not problems:
                params = example_params(meta)
                try:
                    with conn_for(meta.get("lakehouse")).cursor() as cur:
                        cur.execute(sql, params) if params else cur.execute(sql)
                        cols = [c[0] for c in cur.description]
                        rows = [tuple(r) for r in cur.fetchall()]
                    problems = result_problems(meta, cols, rows)
                except Exception as e:  # noqa: BLE001 (report the driver error verbatim)
                    problems = [f"{type(e).__name__}: {str(e)[:300]}"]
            failed += bool(problems)
            status = f"[OK] {f.name} ({len(rows)} filas)" if not problems else f"[FALLO] {f.name}"
            print(status + "".join(f"\n       {p}" for p in problems))
    finally:
        for c in connections.values():
            c.close()

    print(f"\n{len(files) - failed}/{len(files)} consultas válidas.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
