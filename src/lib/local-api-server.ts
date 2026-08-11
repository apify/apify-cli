import { createServer, type Server, type ServerResponse } from 'node:http';

export interface LocalApiResponse {
	status(code: number): void;
	send(data: string | Record<string, unknown>): void;
	end(): void;
}

type RouteHandler = (body: Record<string, any>, res: LocalApiResponse) => void | Promise<void>;

export interface LocalApiServerOptions {
	/** Origin allowed to call the server from a browser (CORS). */
	corsOrigin: string;
	/** Random token the browser page must send back via the `token` query param or a Bearer `Authorization` header. */
	authToken: string;
	/** Handlers keyed by `<METHOD> <pathname>`, e.g. `POST /api/v1/exit`. */
	routes: Record<string, RouteHandler>;
}

const wrapResponse = (res: ServerResponse): LocalApiResponse => ({
	status(code) {
		res.statusCode = code;
	},
	send(data) {
		if (typeof data === 'string') {
			res.setHeader('Content-Type', 'text/plain; charset=utf-8');
			res.end(data);
		} else {
			res.setHeader('Content-Type', 'application/json; charset=utf-8');
			res.end(JSON.stringify(data));
		}
	},
	end() {
		res.end();
	},
});

/**
 * Minimal replacement for the express + cors servers the CLI spins up to talk to a browser page
 * (Apify Console login, input schema editor), kept dependency-free for install size. Handles CORS
 * preflight, token authorization and JSON bodies, and dispatches to the given routes.
 */
export function createLocalApiServer({ corsOrigin, authToken, routes }: LocalApiServerOptions): Server {
	return createServer(async (req, res) => {
		// Turn off keepalive, otherwise closing the server when the command is finished is lagging
		res.setHeader('Connection', 'close');
		res.setHeader('Vary', 'Origin');
		res.setHeader('Access-Control-Allow-Origin', corsOrigin);

		// Preflight requests don't carry the custom headers, so they must be answered before the auth check
		if (req.method === 'OPTIONS') {
			res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			res.statusCode = 204;
			res.end();
			return;
		}

		const url = new URL(req.url ?? '/', 'http://localhost');
		const response = wrapResponse(res);

		let token = url.searchParams.get('token');
		if (!token) {
			const authorizationHeader = req.headers.authorization;
			if (authorizationHeader) {
				const [schema, tokenFromHeader, ...extra] = authorizationHeader.trim().split(/\s+/);
				if (schema.toLowerCase() === 'bearer' && tokenFromHeader && extra.length === 0) {
					token = tokenFromHeader;
				}
			}
		}

		if (token !== authToken) {
			response.status(401);
			response.send('Authorization failed');
			return;
		}

		const handler = routes[`${req.method} ${url.pathname}`];
		if (!handler) {
			response.status(404);
			response.send('Not found');
			return;
		}

		const chunks: Buffer[] = [];
		for await (const chunk of req) {
			chunks.push(chunk as Buffer);
		}
		const rawBody = Buffer.concat(chunks).toString('utf-8');

		let body: Record<string, any> = {};
		if (rawBody) {
			try {
				body = JSON.parse(rawBody);
			} catch {
				response.status(400);
				response.send('Invalid JSON body');
				return;
			}
		}

		await handler(body, response);
	});
}
