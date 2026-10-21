import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { REQUIRED, header, headerProblems, lakehouse, layoutProblems, namedParams, parseConfig, resultProblems } from '../skills/lakehouse/scripts/lib.ts';

const GOOD = `-- description: energía diaria por unidad
-- params: unidad, desde
-- example: U1, 2026-01-01
-- grain: una fila por fecha y programa
-- validated: pending
-- reviewer: equipo de datos
SELECT fecha, programa, SUM(energia) FROM [dbo].[t] WHERE unidad = ? AND fecha >= ? GROUP BY fecha, programa
`;

describe('same rules as validate.py', () => {
	it('reads the header up to the first SQL line', () => {
		const meta = header(GOOD + '-- trailing: ignored\n');
		expect(meta.grain).toBe('una fila por fecha y programa');
		expect(meta.trailing).toBeUndefined();
	});

	it('passes a complete header and reports missing keys or a parameter mismatch', () => {
		expect(headerProblems(GOOD, header(GOOD))).toEqual([]);
		expect(headerProblems('SELECT 1', {})).toEqual(REQUIRED.map((k) => `falta '${k}' en la cabecera`));
		const bad = GOOD.replace('-- example: U1, 2026-01-01', '-- example: U1');
		expect(headerProblems(bad, header(bad))[0]).toContain('example tiene 1 valores');
	});

	it('fails on an empty result or a duplicated grain', () => {
		const meta = header(GOOD);
		const cols = ['fecha', 'programa', 'energia'];
		expect(resultProblems(meta, cols, [])).toEqual(['no devuelve filas con los parámetros de example']);
		expect(resultProblems(meta, cols, [['2026-01-01', 'A', 1], ['2026-01-01', 'A', 2]])).toEqual(['filas duplicadas para el grano (fecha, programa)']);
		expect(resultProblems(meta, cols, [['2026-01-01', 'A', 1], ['2026-01-01', 'B', 2]])).toEqual([]);
	});
});

describe('named parameters for Tedious', () => {
	it('numbers each ? and skips quotes, brackets and comments', () => {
		const { sql, count } = namedParams("-- why?\nSELECT '?' AS q, [a?b] FROM t WHERE x = ? AND y = ?");
		expect(count).toBe(2);
		expect(sql).toBe("-- why?\nSELECT '?' AS q, [a?b] FROM t WHERE x = @p1 AND y = @p2");
	});

	it('counts only real placeholders when checking the header', () => {
		expect(headerProblems(GOOD.replace('SELECT fecha', "SELECT '¿?' AS nota, fecha"), header(GOOD))).toEqual([]);
	});
});

describe('fabric.toml with one or several lakehouses', () => {
	const MULTI = `[fabric]
tenant = "t"
default = "pro"
queries_dir = "queries"

[fabric.lakehouses.dev]
sql_server = "dev.example"
database = "lh_dev"

[fabric.lakehouses.pro]
sql_server = "pro.example"
database = "lh_pro"
`;

	it('picks the named lakehouse, else default, and carries the shared keys', () => {
		const project = parseConfig(MULTI);
		expect(Object.keys(project.lakehouses)).toEqual(['dev', 'pro']);
		expect(lakehouse(project)).toMatchObject({ name: 'pro', database: 'lh_pro', tenant: 't', queries_dir: 'queries' });
		expect(lakehouse(project, 'dev').sql_server).toBe('dev.example');
		expect(() => lakehouse(project, 'otro')).toThrow("No hay lakehouse 'otro'");
	});

	it('needs default or a name when there are several', () => {
		expect(() => lakehouse(parseConfig(MULTI.replace('default = "pro"\n', '')))).toThrow('varios lakehouses');
	});

	it('reads the single-lakehouse form as one lakehouse named after its database', () => {
		const project = parseConfig('[fabric]\ntenant = "t"\nsql_server = "s"\ndatabase = "lh_x"\n');
		expect(lakehouse(project)).toMatchObject({ name: 'lh_x', sql_server: 's', tenant: 't' });
	});
});

describe('project layout advice (templates/layout.json)', () => {
	const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
	const { tmpdir } = require('node:os') as typeof import('node:os');

	function project(files: Record<string, string>): string {
		const dir = mkdtempSync(join(tmpdir(), 'fabric-layout-'));
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(join(dir, path, '..'), { recursive: true });
			writeFileSync(join(dir, path), text);
		}
		return dir;
	}

	const CURRENT = {
		'AGENTS.md': 'Usa /fabric:lakehouse',
		'.claude/settings.json': '{"enabledPlugins":{"fabric@datons-fabric":true}}',
		'.gitignore': 'output/\n',
		'pyproject.toml': '[project.scripts]\nquery = "p.lakehouse:main"\n',
		'queries/.gitkeep': '',
		'docs/tables.md': '',
		'random/chart.py': 'from p.lakehouse import query\n',
		'fabric.toml': '[fabric]\ntenant = "t"\n[fabric.lakehouses.a]\nsql_server = "s"\ndatabase = "d"\n'
	};

	it('has nothing to say about a current project', async () => {
		const dir = project(CURRENT);
		expect(await layoutProblems(dir, CURRENT['fabric.toml'])).toEqual([]);
	});

	it('names each legacy piece with its fix', async () => {
		const legacy = { ...CURRENT, 'CLAUDE.md': '', 'consultar.py': 'mssql_python.connect(x)', 'fabric.toml': '[fabric]\ntenant = "t"\nsql_server = "s"\ndatabase = "d"\n' };
		const problems = await layoutProblems(project(legacy), legacy['fabric.toml']);
		expect(problems.some((p) => p.startsWith('CLAUDE.md es de una estructura anterior'))).toBe(true);
		expect(problems.some((p) => p.startsWith('scripts sueltos en la raíz (consultar.py)'))).toBe(true);
		expect(problems.some((p) => p.startsWith('conexión repetida en consultar.py'))).toBe(true);
		expect(problems.some((p) => p.startsWith('fabric.toml con un solo lakehouse'))).toBe(true);
	});
});
