# TypeScript y SvelteKit: cuadros de mando sobre el lakehouse

Para una aplicación o un cuadro de mando, la consulta vive en el servidor de SvelteKit y la página recibe solo las filas. El navegador nunca habla con Fabric ni ve un token. Para un análisis puntual, un cuaderno o un informe, usa Python (`SKILL.md`, apartado 3).

Esta receta es para **SvelteKit 3** (`@sveltejs/kit` 3.x, lo que instala hoy `bunx sv create`). Si `package.json` tiene `@sveltejs/kit` 2.x, el proyecto es anterior: los cambios están en «Si el proyecto viene de SvelteKit 2», al final.

## Crear la aplicación

La aplicación va en `app/`, dentro del proyecto, al lado de `fabric.toml` y `queries/`:

```bash
bunx sv@latest create app --template minimal --types ts --no-add-ons --install bun
cd app
bun add tedious @azure/identity smol-toml
```

`tedious` habla con el SQL analytics endpoint; `@azure/identity` obtiene el token de la sesión de Azure CLI del usuario; `smol-toml` lee `fabric.toml`. No hace falta driver ODBC.

Lo que SvelteKit 3 cambia respecto a la documentación y los ejemplos antiguos:

- **No hay `$lib`.** Se importa con `#lib/...`, el alias que `sv create` declara en `imports` de `package.json`, y **con la extensión del fichero**: `#lib/server/fabric.ts`. Sin extensión, `svelte-check` falla con «Cannot find module '#lib/server/fabric'».
- **No hay `svelte.config.js`.** La configuración va dentro de `sveltekit({...})` en `vite.config.ts`.
- **Variables de entorno** en `src/env.ts` con `defineEnvVars` e importadas de `$app/env/private` (apartado «Variables de entorno»). `$env/dynamic/private` está obsoleto.

## El módulo de servidor

Va en `src/lib/server/` para que SvelteKit impida importarlo desde código que llegue al navegador. La aplicación se arranca desde `app/`, así que el módulo busca `fabric.toml` subiendo carpetas y lee `queries/` de esa misma raíz; con rutas relativas al directorio actual daría `ENOENT`. Lee `fabric.toml` la primera vez que se consulta, no al importar el módulo: `bun run build` ejecuta los módulos del servidor para analizarlos y no necesita ni `fabric.toml` ni sesión de Azure.

```ts
// src/lib/server/fabric.ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AzureCliCredential } from '@azure/identity';
import { parse } from 'smol-toml';
import { Connection, Request, TYPES } from 'tedious';

type Lakehouse = { sql_server: string; database: string };
type Fabric = Lakehouse & { tenant: string; default?: string; queries_dir?: string; lakehouses?: Record<string, Lakehouse> };

/* La raíz del proyecto es la carpeta con fabric.toml, buscada hacia arriba desde donde corre la aplicación (app/ → ..). */
function findRoot(dir = resolve('.')): string {
	if (existsSync(join(dir, 'fabric.toml'))) return dir;
	const parent = dirname(dir);
	if (parent === dir) throw new Error('No encuentro fabric.toml en esta carpeta ni en las superiores.');
	return findRoot(parent);
}

let project: { root: string; fabric: Fabric; lakehouses: Record<string, Lakehouse>; credential: AzureCliCredential } | undefined;

/* fabric.toml se lee en la primera consulta, no al importar el módulo. */
function config() {
	if (!project) {
		const root = findRoot();
		const fabric = (parse(readFileSync(join(root, 'fabric.toml'), 'utf8')) as { fabric: Fabric }).fabric;
		project = { root, fabric, lakehouses: fabric.lakehouses ?? { [fabric.database]: fabric }, credential: new AzureCliCredential({ tenantId: fabric.tenant }) };
	}
	return project;
}

/* Sin `lakehouse` usa el `default` de fabric.toml (o el único que haya). */
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = [], lakehouse?: string): Promise<T[]> {
	const { fabric, lakehouses, credential } = config();
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

/* El texto de una consulta del equipo, de queries/ (o queries_dir) en la raíz del proyecto. */
export function querySql(file: string): string {
	const { root, fabric } = config();
	return readFileSync(join(root, fabric.queries_dir ?? 'queries', file), 'utf8');
}

/* Una consulta validada del equipo, tal cual: sus parámetros en el orden de su cabecera y el lakehouse de su línea `-- lakehouse:`. */
export function validated<T = Record<string, unknown>>(file: string, params: unknown[] = []) {
	const sql = querySql(file);
	return query<T>(sql, params, sql.match(/^-- lakehouse:\s*(\S+)/m)?.[1]);
}

/* El estado de la cabecera (`-- validated: pending`), para rotular la vista. */
export function queryStatus(file: string): string {
	return querySql(file).match(/^-- validated:\s*(.+)$/m)?.[1].trim() ?? 'pending';
}
```

Los `?` de las consultas del equipo se convierten en parámetros con nombre (`@p1`, `@p2`…) y los valores se pasan aparte, nunca dentro del SQL. Si una consulta tuviera un `?` dentro de un texto entre comillas, escríbela con parámetros con nombre.

## Usarlo en una página

```ts
// src/routes/+page.server.ts
import { error } from '@sveltejs/kit';
import { queryStatus, validated } from '#lib/server/fabric.ts';
import type { PageServerLoad } from './$types';

const QUERY = 'daily-energy.sql';

export const load: PageServerLoad = async ({ url }) => {
	const from = url.searchParams.get('from') ?? '2026-01-01';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) error(400, 'Fecha no válida (AAAA-MM-DD)');
	return {
		status: queryStatus(QUERY),
		days: await validated<{ day: Date; energy: number }>(QUERY, [url.searchParams.get('plant'), from])
	};
};
```

La página recibe `data.days` y lo dibuja; las fechas llegan como `Date`. Valida en el servidor cualquier valor que venga de la URL antes de pasarlo como parámetro. Si la consulta no está validada, enséñalo en la página con `data.status`.

Arranca con `bun run dev` desde `app/`. Comprueba con `bun run check` (tipos) y `bun run build` antes de dar el trabajo por terminado; ninguno de los dos necesita conexión al lakehouse.

## Variables de entorno

El lakehouse no necesita ninguna: usa la sesión de Azure CLI. Si la aplicación necesita una clave (por ejemplo, la de Joltio Data), va en el `.env` de la raíz del proyecto, al lado de `fabric.toml`, que ya está en `.gitignore`. En SvelteKit 3 cada variable se declara en `src/env.ts` y se importa de `$app/env/private`:

```ts
// src/env.ts
import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	JOLTIO_API_KEY: {
		// Obligatoria al arrancar; opcional en `bun run build`, que no la necesita.
		schema: (value) => {
			if (!value && !building) throw new Error('Falta JOLTIO_API_KEY en el .env de la raíz del proyecto.');
			return value ?? '';
		}
	}
});
```

Para que SvelteKit lea el `.env` de la carpeta superior, añade `env: { dir: '..' }` dentro de `sveltekit({...})` en `vite.config.ts`:

```ts
// vite.config.ts (solo lo que cambia)
sveltekit({
	// ...lo que ya trae sv create
	adapter: adapter(),
	env: { dir: '..' }
})
```

Un cliente que exige la clave al crearse se crea dentro de la función `load`, no al importar el módulo: `bun run build` importa los módulos del servidor sin la clave y fallaría.

```ts
// src/lib/server/joltio.ts
import { JOLTIO_API_KEY } from '$app/env/private';
import { Joltio } from '@joltioapp/client';

let client: Joltio | undefined;
export const joltio = () => (client ??= new Joltio({ apiKey: JOLTIO_API_KEY }));
```

En la página: `await joltio().data.query(...)`. Nunca importes `$app/env/private` desde un `.svelte` ni desde código que llegue al navegador; SvelteKit lo impide.

## Si el proyecto viene de SvelteKit 2

- `$lib/...` → `#lib/....ts` (con extensión), y en `package.json`: `"imports": { "#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*" }`.
- Opciones de `svelte.config.js` (`kit.adapter`, `kit.env`…) → dentro de `sveltekit({...})` en `vite.config.ts`; borra `svelte.config.js`.
- `$env/dynamic/private` y `$env/static/private` → `src/env.ts` con `defineEnvVars` y `$app/env/private`.

La guía oficial es <https://svelte.dev/docs/kit/migrating-to-sveltekit-3>.

## Reglas

- Las mismas que en Python: primero una consulta validada (`references/queries.md`) y SQL a medida solo si ninguna encaja (`references/sql.md`), marcado como no validado.
- `fabric.toml` se lee del disco, buscando la raíz del proyecto; no copies sus valores en el código.
- Agrega en SQL y envía a la página solo lo que se va a dibujar.
- La aplicación funciona en el equipo de quien tiene sesión de Azure CLI. Para publicarla para otras personas hace falta otra identidad (una identidad administrada o un principal de servicio) que decide el equipo de IT; no reutilices tu sesión en un servidor.
