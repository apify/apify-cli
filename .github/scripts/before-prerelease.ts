import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const PKG_JSON_PATH = path.join(import.meta.dirname, '..', '..', 'package.json');

const { values } = parseArgs({
	options: {
		'tag': { type: 'string', default: 'beta' },
		// Side channels are published from branches whose package.json version is usually the last
		// released one, so the base version has to be moved forward instead of failing the release.
		'bump-base-if-published': { type: 'boolean', default: false },
	},
});

const PRERELEASE_TAG = values.tag!;
const BUMP_BASE_IF_PUBLISHED = values['bump-base-if-published'];

// The tag ends up both as an npm dist-tag and as a semver prerelease identifier.
if (!/^[a-z][a-z0-9-]*$/.test(PRERELEASE_TAG)) {
	console.error(
		`before-prerelease: '${PRERELEASE_TAG}' is not a usable prerelease tag - use lowercase letters, digits and hyphens, starting with a letter.`,
	);
	process.exit(1);
}

if (PRERELEASE_TAG === 'latest') {
	console.error(`before-prerelease: 'latest' is the stable dist-tag and cannot be used for a prerelease.`);
	process.exit(1);
}

const pkgJson = JSON.parse(await readFile(PKG_JSON_PATH, { encoding: 'utf8' }));

const PACKAGE_NAME = pkgJson.name;
const VERSION = pkgJson.version;

const nextVersion = getNextVersion(VERSION);
console.log(`before-prerelease: Setting version to ${nextVersion}`);
pkgJson.version = nextVersion;

await writeFile(PKG_JSON_PATH, `${JSON.stringify(pkgJson, null, 4)}\n`);

function getPublishedVersions() {
	const versionString = execSync(`npm show ${PACKAGE_NAME} versions --json`, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	});

	const parsed = JSON.parse(versionString) as string[] | string;

	// npm returns a bare string when the package has exactly one published version.
	return Array.isArray(parsed) ? parsed : [parsed];
}

function nextFreeBaseVersion(version: string, publishedVersions: string[]) {
	const [major, minor, patch] = version.split('-')[0].split('.').map(Number);

	if ([major, minor, patch].some((part) => !Number.isInteger(part))) {
		console.error(`before-prerelease: Cannot parse '${version}' in package.json as a semver version.`);
		process.exit(1);
	}

	let candidate = `${major}.${minor}.${patch}`;
	let nextPatch = patch;

	while (publishedVersions.includes(candidate)) {
		nextPatch += 1;
		candidate = `${major}.${minor}.${nextPatch}`;
	}

	return candidate;
}

function getNextVersion(version: string) {
	const versions = getPublishedVersions();

	let baseVersion = version;

	if (versions.includes(baseVersion)) {
		if (!BUMP_BASE_IF_PUBLISHED) {
			console.error(
				`before-prerelease: A release with version ${baseVersion} already exists. Please increment version accordingly.`,
			);
			process.exit(1);
		}

		baseVersion = nextFreeBaseVersion(baseVersion, versions);
		console.log(`before-prerelease: ${version} is already published, basing the prerelease on ${baseVersion}`);
	}

	const prereleasePattern = new RegExp(`^${baseVersion.replace(/\./g, '\\.')}-${PRERELEASE_TAG}\\.(\\d+)$`);

	const prereleaseNumbers = versions
		.map((v) => v.match(prereleasePattern)?.[1])
		.filter((number) => number !== undefined)
		.map(Number);

	const lastPrereleaseNumber = Math.max(-1, ...prereleaseNumbers);

	return `${baseVersion}-${PRERELEASE_TAG}.${lastPrereleaseNumber + 1}`;
}
