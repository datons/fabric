/* Ejecuta cada consulta de queries_dir con sus parámetros `example` y comprueba que devuelve filas y que no hay duplicados en el grano declarado. Uso: bun validate.ts [fabric.toml] [consulta.sql ...]. Mismas reglas que validate.py. */
import { dirname, join, basename } from 'node:path';
import { connect, errorText, exampleParams, header, headerProblems, readConfig, resultProblems } from './lib.ts';

const [cfgPath = 'fabric.toml', ...given] = process.argv.slice(2);
const cfg = await readConfig(cfgPath);
const queriesDir = join(dirname(cfgPath), cfg.queries_dir ?? 'consultas');
const files = given.length ? given : (await Array.fromAsync(new Bun.Glob('*.sql').scan(queriesDir))).sort().map((f) => join(queriesDir, f));

let failed = 0;
const db = await connect(cfg);
try {
	for (const file of files) {
		const sql = await Bun.file(file).text();
		const meta = header(sql);
		let problems = headerProblems(sql, meta);
		let rows = 0;
		if (!problems.length) {
			try {
				const result = await db.query(sql, exampleParams(meta));
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
	db.close();
}

console.log(`\n${files.length - failed}/${files.length} consultas válidas.`);
process.exit(failed ? 1 : 0);
