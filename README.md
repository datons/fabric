# fabric

Plugin for Claude Code and Codex to work with a Microsoft Fabric lakehouse from TypeScript or Python on your own machine, with your own Microsoft identity. Fabric applies your existing permissions to every query; nothing is stored besides your Azure CLI session.

There is no wrapper library and no MCP server: Claude writes plain code against official libraries, TypeScript (`tedious` in a SvelteKit server) for dashboards and apps, Python (`mssql-python`, `deltalake` for OneLake Delta tables) for ad hoc analysis, following the skill `/fabric:lakehouse`.

## Install

Claude Code:

```
/plugin install fabric --marketplace datons/fabric
```

Codex:

```bash
codex plugin marketplace add datons/fabric
codex plugin add fabric@datons-fabric
```

Other agents that read Agent Skills (Cursor, Copilot…): copy `skills/lakehouse/` into your agent's skills folder.

It is also listed in the [`datons/agent-plugins`](https://github.com/datons/agent-plugins) catalog together with the rest of the `datons` plugins.

## Requirements

- Azure CLI, signed in with `az login --tenant <tenant-id>`.
- Bun, which runs the access check and the query validator and installs their dependencies on first run. `uv` for Python work; the same checks also exist as `check.py` and `validate.py`.
- Read access to the lakehouse's SQL analytics endpoint, granted by your IT team.

## Start a team repository

Copy [`templates/`](templates) into a new repository and fill in `fabric.toml`:

```
your-team-queries/
├── .claude/settings.json   # installs this plugin for anyone who opens the repo
├── fabric.toml             # tenant, SQL endpoint, lakehouse
├── docs/tablas.md          # what each table means: grain, units, traps
├── docs/marca.md           # brand for reports: colours, typeface, logo
└── consultas/*.sql         # the team's validated queries
```

Then ask Claude to check your access (`/fabric:lakehouse comprueba mi acceso`), or just ask a question about the data.

## Validated queries

A team keeps its agreed queries as `.sql` files with a header (`description`, `params`, `example`, `grain`, `validated`, `reviewer`). The skill uses a validated query when one fits and labels anything else as not validated. `skills/lakehouse/scripts/validate.py` runs every query with its example parameters and fails on empty results or duplicate rows for the declared grain; the reviewer, not the validator, marks a query as validated.

## Where it works

Claude Code (terminal, IDE, and the Code tab of Claude Desktop) and Codex. Not in claude.ai chat: its sandbox has no access to your Azure CLI session or your network.

## Development

```bash
bun install && bun run check && bun test tests
uvx ruff check skills tests
uv run --python 3.12 --with pytest pytest -q tests
claude plugin validate .
```
