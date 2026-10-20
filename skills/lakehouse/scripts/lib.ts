/* Shared by check.ts and validate.ts, and the same connection the TypeScript recipe in references/typescript.md teaches: Tedious with an access token from the user's own Azure CLI session. */
import { AzureCliCredential } from '@azure/identity';
import { Connection, Request, TYPES } from 'tedious';

export interface Lakehouse {
	sql_server: string;
	database: string;
	workspace_id?: string;
	lakehouse_id?: string;
}

/* One lakehouse is the connection target; tenant comes from the project. */
export interface FabricConfig extends Lakehouse {
	name: string;
	tenant: string;
	tables_guide?: string;
	queries_dir?: string;
}

export interface ProjectConfig {
	tenant: string;
	default?: string;
	tables_guide?: string;
	queries_dir?: string;
	lakehouses: Record<string, Lakehouse>;
}

export interface Result {
	columns: string[];
	rows: unknown[][];
}

export const REQUIRED = ['description', 'params', 'example', 'grain', 'validated', 'reviewer'] as const;

/* `[fabric.lakehouses.<name>]` tables, or the single-lakehouse form with sql_server and database directly under `[fabric]`, which becomes one lakehouse named after its database. */
export function parseConfig(text: string): ProjectConfig {
	const { lakehouses, sql_server, database, workspace_id, lakehouse_id, ...rest } = (Bun.TOML.parse(text) as { fabric: Omit<ProjectConfig, "lakehouses"> & Partial<Lakehouse> & { lakehouses?: Record<string, Lakehouse> } }).fabric;
	const all = lakehouses ?? (database ? { [database]: { sql_server: sql_server!, database, workspace_id, lakehouse_id } } : {});
	return { ...rest, lakehouses: all };
}

/* The named lakehouse, else `default`, else the only one. */
export function lakehouse(project: ProjectConfig, name?: string): FabricConfig {
	const names = Object.keys(project.lakehouses);
	const chosen = name ?? project.default ?? (names.length === 1 ? names[0] : undefined);
	if (!chosen) throw new Error(`fabric.toml tiene varios lakehouses (${names.join(', ')}): indica cuál o pon default.`);
	const target = project.lakehouses[chosen];
	if (!target) throw new Error(`No hay lakehouse '${chosen}' en fabric.toml (hay: ${names.join(', ') || 'ninguno'}).`);
	const { lakehouses: _, default: __, ...shared } = project;
	return { ...shared, ...target, name: chosen };
}

export async function readProject(path: string): Promise<ProjectConfig> {
	return parseConfig(await Bun.file(path).text());
}

export async function readConfig(path: string, name?: string): Promise<FabricConfig> {
	return lakehouse(await readProject(path), name);
}

/* The team's queries use `?` placeholders, as in Python; Tedious names them. Question marks inside quotes, brackets or comments are left alone. */
export function namedParams(sql: string): { sql: string; count: number } {
	let count = 0;
	let out = '';
	let quote: string | null = null;
	for (let i = 0; i < sql.length; i++) {
		const c = sql[i];
		if (quote) {
			out += c;
			if (c === quote) quote = null;
		} else if (c === "'" || c === '"') {
			quote = c;
			out += c;
		} else if (c === '[') {
			quote = ']';
			out += c;
		} else if (c === '-' && sql[i + 1] === '-') {
			const end = sql.indexOf('\n', i);
			const stop = end === -1 ? sql.length : end;
			out += sql.slice(i, stop);
			i = stop - 1;
		} else if (c === '?') {
			out += `@p${++count}`;
		} else out += c;
	}
	return { sql: out, count };
}

export async function connect(cfg: FabricConfig) {
	const { token } = await new AzureCliCredential({ tenantId: cfg.tenant }).getToken('https://database.windows.net/.default');
	const connection = new Connection({
		server: cfg.sql_server,
		options: { database: cfg.database, encrypt: true, port: 1433, connectTimeout: 30_000, requestTimeout: 120_000, rowCollectionOnRequestCompletion: false },
		authentication: { type: 'azure-active-directory-access-token', options: { token } }
	});
	await new Promise<void>((resolve, reject) => connection.connect((error) => (error ? reject(error) : resolve())));

	function query(sql: string, params: unknown[] = []): Promise<Result> {
		const named = namedParams(sql);
		return new Promise((resolve, reject) => {
			const result: Result = { columns: [], rows: [] };
			const request = new Request(named.sql, (error) => (error ? reject(error) : resolve(result)));
			params.forEach((value, i) => request.addParameter(`p${i + 1}`, TYPES.NVarChar, value == null ? null : String(value)));
			request.on('columnMetadata', (columns) => {
				result.columns = (Array.isArray(columns) ? columns : Object.values(columns)).map((c) => c.colName);
			});
			request.on('row', (row: { value: unknown }[]) => result.rows.push(row.map((c) => c.value)));
			connection.execSql(request);
		});
	}

	return { query, close: () => connection.close() };
}

/* Leading `-- key: value` comment lines, up to the first non-comment line. */
export function header(sql: string): Record<string, string> {
	const meta: Record<string, string> = {};
	for (const line of sql.split('\n')) {
		if (!line.startsWith('--')) break;
		const i = line.indexOf(':');
		if (i !== -1) meta[line.slice(2, i).trim()] = line.slice(i + 1).trim();
	}
	return meta;
}

export function exampleParams(meta: Record<string, string>): string[] {
	return meta.example ? meta.example.split(',').map((p) => p.trim()) : [];
}

export function headerProblems(sql: string, meta: Record<string, string>): string[] {
	const problems = REQUIRED.filter((k) => !(k in meta)).map((k) => `falta '${k}' en la cabecera`);
	const placeholders = namedParams(sql).count;
	if (!problems.length && exampleParams(meta).length !== placeholders) problems.push(`example tiene ${exampleParams(meta).length} valores y la consulta ${placeholders} parámetros`);
	return problems;
}

export function resultProblems(meta: Record<string, string>, columns: string[], rows: unknown[][]): string[] {
	if (!rows.length) return ['no devuelve filas con los parámetros de example'];
	/* grain reads "una fila por a y b": the result columns named there must be unique together. */
	const keys = columns.filter((c) => meta.grain.includes(c));
	if (keys.length) {
		const seen = new Set(rows.map((r) => JSON.stringify(keys.map((k) => r[columns.indexOf(k)]))));
		if (seen.size !== rows.length) return [`filas duplicadas para el grano (${keys.join(', ')})`];
	}
	return [];
}

export function errorText(error: unknown): string {
	const e = error as { name?: string; code?: string; message?: string };
	return `${e.code ?? e.name ?? 'Error'}: ${String(e.message ?? error).slice(0, 300)}`;
}
