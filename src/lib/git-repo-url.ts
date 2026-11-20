import process from 'node:process';

export interface ParsedGitRepoUrl {
	url: string;
	branch?: string;
	subdir?: string;
}

export const ALLOWED_GIT_PROTOCOLS = 'https:ssh';

const SEGMENT = String.raw`[\w.~][\w.~-]*`;
const HOST = String.raw`[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?`;
const USER = String.raw`[\w.][\w.-]*`;

const HTTPS_URL = new RegExp(String.raw`^https://(?:${USER}(?::[\w.~-]+)?@)?${HOST}(?::\d+)?(?:/${SEGMENT})+$`);
const SSH_URL = new RegExp(String.raw`^ssh://(?:${USER}@)?${HOST}(?::\d+)?(?:/${SEGMENT})+$`);
const SCP_URL = new RegExp(String.raw`^${USER}@${HOST}:/?${SEGMENT}(?:/${SEGMENT})*$`);

// eslint-disable-next-line no-control-regex
const UNSAFE_REF_CHARS = /[\s\u0000-\u001F\u007F#:]/;

const hasUnsafeSegment = (path: string) =>
	path.split('/').some((segment) => segment.startsWith('-') || segment === '..');

const isSafeRef = (value: string) => !UNSAFE_REF_CHARS.test(value) && !hasUnsafeSegment(value);

export function parseGitRepoUrl(gitRepoUrl: string): ParsedGitRepoUrl {
	const hashIndex = gitRepoUrl.indexOf('#');
	const url = hashIndex === -1 ? gitRepoUrl : gitRepoUrl.slice(0, hashIndex);
	const fragment = hashIndex === -1 ? '' : gitRepoUrl.slice(hashIndex + 1);

	const colonIndex = fragment.indexOf(':');
	const branch = colonIndex === -1 ? fragment : fragment.slice(0, colonIndex);
	const subdir = colonIndex === -1 ? '' : fragment.slice(colonIndex + 1);

	const isAllowedUrl = [HTTPS_URL, SSH_URL, SCP_URL].some((pattern) => pattern.test(url)) && !hasUnsafeSegment(url);

	if (!isAllowedUrl) {
		throw new Error(`Can't pull Actor from Git URL '${gitRepoUrl}'. Only https and ssh repository URLs are supported.`);
	}

	if (!isSafeRef(branch) || !isSafeRef(subdir)) {
		throw new Error(`Can't pull Actor from Git URL '${gitRepoUrl}'. The branch or directory in the URL isn't valid.`);
	}

	return {
		url,
		...(branch && { branch }),
		...(subdir && { subdir }),
	};
}

export async function withAllowedGitProtocols<T>(fn: () => Promise<T>): Promise<T> {
	const previous = process.env.GIT_ALLOW_PROTOCOL;
	process.env.GIT_ALLOW_PROTOCOL = ALLOWED_GIT_PROTOCOLS;

	try {
		return await fn();
	} finally {
		if (previous === undefined) {
			delete process.env.GIT_ALLOW_PROTOCOL;
		} else {
			process.env.GIT_ALLOW_PROTOCOL = previous;
		}
	}
}
