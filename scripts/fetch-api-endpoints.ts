/**
 * Fetches the Apify OpenAPI spec and extracts a minimal endpoint catalog
 * (method, path, summary) for use by the `apify api --list-endpoints` flag.
 */

import { writeFile } from 'node:fs/promises';

const OPENAPI_URL = 'https://docs.apify.com/api/openapi.json';
const OUTPUT_PATH = new URL('../src/commands/api-endpoints.json', import.meta.url);

interface OpenAPISpec {
	paths: Record<string, Record<string, { summary?: string }>>;
}

interface Endpoint {
	method: string;
	path: string;
	summary: string;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);

const response = await fetch(OPENAPI_URL);

if (!response.ok) {
	throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
}

const spec = (await response.json()) as OpenAPISpec;

const endpoints: Endpoint[] = [];

for (const [path, methods] of Object.entries(spec.paths)) {
	for (const [method, details] of Object.entries(methods)) {
		if (HTTP_METHODS.has(method)) {
			endpoints.push({
				method: method.toUpperCase(),
				path,
				summary: details.summary || '',
			});
		}
	}
}

// Sort by path, then method
endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

await writeFile(OUTPUT_PATH, `${JSON.stringify(endpoints, null, '\t')}\n`);

console.log(`Extracted ${endpoints.length} endpoints to ${OUTPUT_PATH.pathname}`);
