import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

import { runCli } from '../../__helpers__/run-cli.js';

// A value that is neither valid UTF-8 nor small: every byte value, repeated to ~100 KB (the command line cannot carry it).
const binaryValue = Buffer.from(Array.from({ length: 100_000 }, (_, i) => i % 256));

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

// The API client compresses larger request bodies; the mock stores what the server would store.
const decodeBody = (raw: Buffer, encoding: string | undefined) => {
	switch (encoding) {
		case 'gzip':
			return gunzipSync(raw);
		case 'br':
			return brotliDecompressSync(raw);
		case 'deflate':
			return inflateSync(raw);
		default:
			return raw;
	}
};

describe('[e2e] key-value-stores set-value reads the value from stdin (#1474)', () => {
	// Fake API: answers the store lookup and records what is PUT.
	describe('apify key-value-stores set-value', () => {
		let server: Server;
		let apiUrl: string;
		let puts: { url: string; contentType: string | undefined; body: Buffer }[];

		beforeAll(async () => {
			server = createServer((req, res) => {
				const chunks: Buffer[] = [];
				req.on('data', (chunk: Buffer) => chunks.push(chunk));
				req.on('end', () => {
					const raw = Buffer.concat(chunks);
					const reply = (data: unknown, status = 200) => {
						res.writeHead(status, { 'content-type': 'application/json' });
						res.end(JSON.stringify({ data }));
					};

					if (req.method === 'PUT') {
						puts.push({
							url: req.url!,
							contentType: req.headers['content-type'],
							body: decodeBody(raw, req.headers['content-encoding']),
						});
						return reply({}, 201);
					}

					if (req.url === '/v2/users/me') return reply({ id: 'user1', username: 'someone' });

					// The store lookup by ID or name.
					return reply({ id: 'store1', name: 'store1' });
				});
			}).listen(0, '127.0.0.1');
			await once(server, 'listening');
			apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		});

		afterAll(async () => {
			server.close();
			await once(server, 'close');
		});

		beforeEach(() => {
			puts = [];
		});

		const runSetValue = (args: string[], stdin?: string | Uint8Array) =>
			runCli('apify', ['key-value-stores', 'set-value', 'store1', ...args], {
				stdin,
				env: { APIFY_TOKEN: 'dummy-token', APIFY_CLIENT_BASE_URL: apiUrl },
			});

		it('stores the JSON piped on stdin', async () => {
			const result = await runSetValue(['stdin-test', '--content-type', 'application/json'], '{"a":1}');

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(puts).toHaveLength(1);
			expect(puts[0].url).toContain('/records/stdin-test');
			expect(puts[0].contentType).toContain('application/json');
			expect(puts[0].body.toString('utf8')).toBe('{"a":1}');
		});

		it('stores a ~100 KB binary value piped on stdin byte for byte', async () => {
			const result = await runSetValue(['big', '--content-type', 'application/octet-stream'], binaryValue);

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(puts).toHaveLength(1);
			expect(puts[0].body.length).toBe(binaryValue.length);
			expect(sha256(puts[0].body)).toBe(sha256(binaryValue));
		});

		it('prefers the value argument over stdin', async () => {
			const result = await runSetValue(['key', '{"from":"argument"}'], 'from stdin');

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(puts).toHaveLength(1);
			expect(puts[0].body.toString('utf8')).toBe('{"from":"argument"}');
		});

		it('fails without writing a record when there is no value', async () => {
			const result = await runSetValue(['key']);

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('No value was provided');
			expect(puts).toHaveLength(0);
		});
	});
});
