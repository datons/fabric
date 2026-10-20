/* Lista los lakehouses que tu cuenta puede ver en Fabric, con lo que necesita fabric.toml: tenant, workspace, endpoint SQL y lakehouse. Uso: bun discover.ts [--tenant <id>] [--json]. Misma salida que discover.py. */
import { AzureCliCredential } from '@azure/identity';

const API = 'https://api.fabric.microsoft.com/v1';
const args = process.argv.slice(2);
const tenant = args.includes('--tenant') ? args[args.indexOf('--tenant') + 1] : undefined;

interface Found {
	workspace: string;
	workspace_id: string;
	lakehouse: string;
	lakehouse_id: string;
	sql_server: string | null;
}

let token: string;
try {
	token = (await new AzureCliCredential(tenant ? { tenantId: tenant } : {}).getToken('https://api.fabric.microsoft.com/.default')).token;
} catch (error) {
	console.error(`Sin sesión de Azure CLI. Inicia sesión: az login --allow-no-subscriptions\n${String((error as Error)?.message ?? error).slice(0, 300)}`);
	process.exit(1);
}
const tid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).tid as string;

/* Fabric throttles bursts (429) and drops sockets under load: retry those with a growing pause. */
async function get(url: string, attempt = 0): Promise<Response> {
	try {
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		if (res.status !== 429 || attempt >= 4) return res;
		await Bun.sleep(Number(res.headers.get('Retry-After') ?? 2 ** attempt) * 1000);
	} catch (error) {
		if (attempt >= 4) throw error;
		await Bun.sleep(2 ** attempt * 500);
	}
	return get(url, attempt + 1);
}

/* Runs fn over items with at most `limit` in flight, keeping the input order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let i = 0;
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (i < items.length) {
			const n = i++;
			out[n] = await fn(items[n]);
		}
	}));
	return out;
}

/* Follows continuationUri until the list ends. Returns null when the caller cannot read it (no role on that workspace). */
async function list<T>(url: string): Promise<T[] | null> {
	const items: T[] = [];
	for (let next: string | undefined = url; next; ) {
		const res = await get(next);
		if (res.status === 401 || res.status === 403 || res.status === 404) return null;
		if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
		const body = (await res.json()) as { value: T[]; continuationUri?: string };
		items.push(...body.value);
		next = body.continuationUri;
	}
	return items;
}

type Workspace = { id: string; displayName: string };
type LakehouseItem = { id: string; displayName: string; properties?: { sqlEndpointProperties?: { connectionString?: string } } };

const workspaces = (await list<Workspace>(`${API}/workspaces`)) ?? [];
/* Workspaces whose lakehouses could not be listed after the retries: reported, not fatal. */
const unchecked: string[] = [];
const found: Found[] = (
	await pool(workspaces, 6, async (w) =>
			((await list<LakehouseItem>(`${API}/workspaces/${w.id}/lakehouses`).catch(() => (unchecked.push(w.displayName), null))) ?? []).map((l) => ({
				workspace: w.displayName,
				workspace_id: w.id,
				lakehouse: l.displayName,
				lakehouse_id: l.id,
				sql_server: l.properties?.sqlEndpointProperties?.connectionString ?? null
			}))
	)
)
	.flat()
	.sort((a, b) => a.workspace.localeCompare(b.workspace) || a.lakehouse.localeCompare(b.lakehouse));

if (args.includes('--json')) {
	console.log(JSON.stringify({ tenant: tid, lakehouses: found, unchecked }, null, 2));
} else {
	console.log(`Tenant: ${tid}\n${workspaces.length} workspaces, ${found.length} lakehouses visibles con tu cuenta.\n`);
	for (const f of found) console.log(`${f.workspace} / ${f.lakehouse}${f.sql_server ? '' : '  (sin endpoint SQL todavía)'}`);
	if (unchecked.length) console.log(`\nNo se pudieron consultar (repite para reintentar): ${unchecked.join(', ')}`);
	if (!found.length) console.log('Ninguno: tu cuenta no tiene rol en ningún workspace. Pide a IT el endpoint SQL y el nombre del lakehouse.');
}
