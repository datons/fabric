/* Ejecuta cada consulta de queries_dir con sus parámetros `example` en su lakehouse (`-- lakehouse:` o el de por defecto) y comprueba que devuelve filas y que no hay duplicados en el grano declarado. Uso: bun validate.ts [fabric.toml] [consulta.sql ...]. Mismas reglas que validate.py. */
import { dirname, join, basename } from 'node:path';
import { connect, errorText, exampleParams, header, headerProblems, lakehouse, readProject, resultProblems } from './lib.ts';

const [cfgPath = 'fabric.toml', ...given] = process.argv.slice(2);
const project = await readProject(cfgPath);
const queriesDir = join(dirname(cfgPath), project.queries_dir ?? 'queries');
const files = given.length ? given : (await Array.fromAsync(new Bun.Glob('*.sql').scan(queriesDir))).sort().map((f) => join(queriesDir, f));

/* One connection per lakehouse, opened the first time a query needs it. */
const connections = new Map<string, Awaited<ReturnType<typeof connect>>>();
async function db(name?: string) {
	const cfg = lakehouse(project, name);
	if (!connections.has(cfg.name)) connections.set(cfg.name, await connect(cfg));
	return connections.get(cfg.name)!;
}

let failed = 0;
try {
	for (const file of files) {
		const sql = await Bun.file(file).text();
		const meta = header(sql);
		let problems = headerProblems(sql, meta);
		let rows = 0;
		if (!problems.length) {
			try {
				const result = await (await db(meta.lakehouse)).query(sql, exampleParams(meta));
				rows = result.rows.length;
				problems = resultProblems(meta, result.columns, result.rows);
			} catch (error) {
				problems = [errorText(error)];
			}
		}
		if (problems.length) failed++;
		console.log((problems.length ? `[FALLO] ${basename(file)}` : `[OK] ${basename(file)} (${rows} filas)`) + problems.map((p) => `\n       ${p}`).join(''));
	}
} finally {
	for (const c of connections.values()) c.close();
}

console.log(`\n${files.length - failed}/${files.length} consultas válidas.`);
process.exit(failed ? 1 : 0);
