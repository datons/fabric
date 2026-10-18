/* Comprueba paso a paso el acceso a un lakehouse de Fabric descrito en fabric.toml. Uso: bun check.ts [ruta/a/fabric.toml]. Misma salida que check.py. */
import { connect, errorText, readConfig } from './lib.ts';

let ok = true;
function step(label: string, passed: boolean, detail = ''): boolean {
	ok &&= passed;
	console.log(`[${passed ? 'OK' : 'FALLO'}] ${label}${detail ? `\n       ${detail}` : ''}`);
	return passed;
}

const path = process.argv[2] ?? 'fabric.toml';
const exists = await Bun.file(path).exists();
if (!step(`Configuración (${path})`, exists, exists ? '' : 'Crea fabric.toml con los datos que te ha dado tu equipo de IT.')) process.exit(1);
const cfg = await readConfig(path);

const hasAz = Bun.which('az') !== null;
if (!step('Azure CLI instalado', hasAz, hasAz ? '' : 'Instala Azure CLI y abre un terminal nuevo.')) process.exit(1);

try {
	const db = await connect(cfg);
	try {
		const [[user]] = (await db.query('SELECT USER_NAME()')).rows;
		step(`Conexión al lakehouse ${cfg.database}`, true, `como ${user}`);
		const [[n]] = (await db.query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA', 'queryinsights', '_mlv_system')")).rows as number[][];
		step('Tablas visibles con tus permisos', n > 0, n ? `${n} tablas` : 'Pide a IT permiso de lectura sobre el lakehouse.');
	} finally {
		db.close();
	}
} catch (error) {
	const message = String((error as Error)?.message ?? error);
	const signedOut = /AzureCliCredential|az login|Please run/i.test(message);
	const hint = signedOut ? `Inicia sesión: az login --tenant ${cfg.tenant} --allow-no-subscriptions` : 'Pide a IT permiso de lectura sobre el SQL analytics endpoint.';
	step(`Conexión al lakehouse ${cfg.database}`, false, `${hint}\n       ${errorText(error)}`);
}

console.log(ok ? '\nTodo listo.' : '\nAlgo ha fallado: copia este resultado y envíaselo a tu equipo de datos.');
process.exit(ok ? 0 : 1);
