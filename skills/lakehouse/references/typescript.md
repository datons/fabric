# TypeScript y SvelteKit: cuadros de mando sobre el lakehouse

Para una aplicación o un cuadro de mando, la consulta vive en el servidor de SvelteKit y la página recibe solo las filas. El navegador nunca habla con Fabric ni ve un token. Para un análisis puntual, un cuaderno o un informe, usa Python (`SKILL.md`, apartado 3).

## Dependencias

```bash
bun add tedious @azure/identity smol-toml
```

`tedious` habla con el SQL analytics endpoint; `@azure/identity` obtiene el token de la sesión de Azure CLI del usuario; `smol-toml` lee `fabric.toml`. No hace falta driver ODBC.

## El módulo de servidor

Va en `src/lib/server/` para que SvelteKit impida importarlo desde código que llegue al navegador:

```ts
// src/lib/server/fabric.ts
import { readFileSync } from 'node:fs';
import { AzureCliCredential } from '@azure/identity';
import { parse } from 'smol-toml';
import { Connection, Request, TYPES } from 'tedious';

type Lakehouse = { sql_server: string; database: string };
const fabric = (parse(readFileSync('fabric.toml', 'utf8')) as { fabric: Lakehouse & { tenant: string; default?: string; lakehouses?: Record<string, Lakehouse> } }).fabric;
const lakehouses = fabric.lakehouses ?? { [fabric.database]: fabric };
const credential = new AzureCliCredential({ tenantId: fabric.tenant });

/* Sin `lakehouse` usa el `default` de fabric.toml (o el único que haya). */
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = [], lakehouse?: string): Promise<T[]> {
	const cfg = lakehouses[lakehouse ?? fabric.default ?? Object.keys(lakehouses)[0]];
	const { token } = await credential.getToken('https://database.windows.net/.default');
	const connection = new Connection({
		server: cfg.sql_server,
		options: { database: cfg.database, encrypt: true, rowCollectionOnRequestCompletion: false },
		authentication: { type: 'azure-active-directory-access-token', options: { token } }
	});
	await new Promise<void>((resolve, reject) => connection.connect((e) => (e ? reject(e) : resolve())));
	try {
		return await new Promise<T[]>((resolve, reject) => {
			const rows: T[] = [];
			let n = 0;
			const request = new Request(sql.replace(/\?/g, () => `@p${++n}`), (e) => (e ? reject(e) : resolve(rows)));
			params.forEach((value, i) => request.addParameter(`p${i + 1}`, TYPES.NVarChar, String(value)));
			request.on('row', (columns: { metadata: { colName: string }; value: unknown }[]) => rows.push(Object.fromEntries(columns.map((c) => [c.metadata.colName, c.value])) as T));
			connection.execSql(request);
		});
	} finally {
		connection.close();
	}
}

/* Una consulta validada del equipo, tal cual: el fichero de queries/, sus parámetros en el orden de su cabecera y el lakehouse de su línea `-- lakehouse:`. */
export function validated<T = Record<string, unknown>>(file: string, params: unknown[] = []) {
	const sql = readFileSync(`queries/${file}`, 'utf8');
	return query<T>(sql, params, sql.match(/^-- lakehouse:\s*(\S+)/m)?.[1]);
}
```

Los `?` de las consultas del equipo se convierten en parámetros con nombre (`@p1`, `@p2`…) y los valores se pasan aparte, nunca dentro del SQL. Si una consulta tuviera un `?` dentro de un texto entre comillas, escríbela con parámetros con nombre.

## Usarlo en una página

```ts
// src/routes/+page.server.ts
import { validated } from '$lib/server/fabric';

export const load = async ({ url }) => ({
	days: await validated<{ dia: Date; energia: number }>('produccion-diaria.sql', [url.searchParams.get('planta'), '2026-01-01'])
});
```

La página recibe `data.days` y lo dibuja; las fechas llegan como `Date`. Valida en el servidor cualquier valor que venga de la URL antes de pasarlo como parámetro.

## Reglas

- Las mismas que en Python: primero una consulta validada (`references/queries.md`) y SQL a medida solo si ninguna encaja (`references/sql.md`), marcado como no validado.
- `fabric.toml` se lee del disco al arrancar; no copies sus valores en el código.
- Agrega en SQL y envía a la página solo lo que se va a dibujar.
- La aplicación funciona en el equipo de quien tiene sesión de Azure CLI. Para publicarla para otras personas hace falta otra identidad (una identidad administrada o un principal de servicio) que decide el equipo de IT; no reutilices tu sesión en un servidor.
