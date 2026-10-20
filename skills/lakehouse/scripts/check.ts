/* Comprueba paso a paso el acceso a cada lakehouse de fabric.toml. Uso: bun check.ts [ruta/a/fabric.toml] [lakehouse]. Misma salida que check.py. */
import { connect, errorText, lakehouse, readProject } from './lib.ts';

const NO_NETWORK = 'No se llega al servidor: comprueba la red o la VPN y repite. Si sigue fallando, IT debe permitir la salida al puerto 1433.';

let ok = true;
function step(label: string, passed: boolean, detail = ''): boolean {
	ok &&= passed;
	console.log(`[${passed ? 'OK' : 'FALLO'}] ${label}${detail ? `\n       ${detail}` : ''}`);
	return passed;
}

const [path = 'fabric.toml', only] = process.argv.slice(2);
const exists = await Bun.file(path).exists();
if (!step(`Configuración (${path})`, exists, exists ? '' : 'Pide a Claude que lo cree con /fabric:lakehouse: descubre tus lakehouses con tu sesión de Azure.')) process.exit(1);
const project = await readProject(path);
const names = only ? [only] : Object.keys(project.lakehouses);
if (!step('Lakehouses configurados', names.length > 0, names.length ? names.join(', ') : 'Añade al menos uno en [fabric.lakehouses.<nombre>].')) process.exit(1);

const hasAz = Bun.which('az') !== null;
if (!step('Azure CLI instalado', hasAz, hasAz ? '' : 'Instala Azure CLI y abre un terminal nuevo.')) process.exit(1);

for (const name of names) {
	let cfg;
	try {
		cfg = lakehouse(project, name);
	} catch (error) {
		step(`Lakehouse ${name}`, false, errorText(error));
		continue;
	}
	try {
		const db = await connect(cfg);
		try {
			const [[user]] = (await db.query('SELECT USER_NAME()')).rows;
			step(`Conexión a ${name} (${cfg.database})`, true, `como ${user}`);
			const [[n]] = (await db.query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA', 'queryinsights', '_mlv_system')")).rows as number[][];
			step(`Tablas visibles en ${name}`, n > 0, n ? `${n} tablas` : 'Pide a IT permiso de lectura sobre el lakehouse.');
		} finally {
			db.close();
		}
	} catch (error) {
		const message = String((error as Error)?.message ?? error);
		const signedOut = /AzureCliCredential|az login|Please run/i.test(message);
		const unreachable = /ETIMEOUT|ESOCKET|ECONNRESET|ENOTFOUND|timed? ?out|Failed to connect/i.test(`${(error as { code?: string })?.code} ${message}`);
		const hint = signedOut ? `Inicia sesión: az login --tenant ${cfg.tenant} --allow-no-subscriptions` : unreachable ? NO_NETWORK : 'Pide a IT permiso de lectura sobre el SQL analytics endpoint.';
		step(`Conexión a ${name} (${cfg.database})`, false, `${hint}\n       ${errorText(error)}`);
	}
}

console.log(ok ? '\nTodo listo.' : '\nAlgo ha fallado: copia este resultado y envíaselo a tu equipo de datos.');
process.exit(ok ? 0 : 1);
