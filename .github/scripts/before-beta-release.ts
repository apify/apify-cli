import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

const PKG_JSON_PATH = path.join(import.meta.dirname, '..', '..', 'package.json');

const pkgJson = JSON.parse(await readFile(PKG_JSON_PATH, { encoding: 'utf8' }));

const PACKAGE_NAME = pkgJson.name;
const VERSION = pkgJson.version;

const nextVersion = getNextVersion(VERSION);
console.log(`before-deploy: Setting version to ${nextVersion}`);
pkgJson.version = nextVersion;

await writeFile(PKG_JSON_PATH, JSON.stringify(pkgJson, null, 4) + '\n');

function getNextVersion(version: string) {
	const versionString = execSync(`npm show ${PACKAGE_NAME} versions --json`, { encoding: 'utf8' });
	const versions = JSON.parse(versionString) as string[];

	if (versions.some((v) => v === VERSION)) {
		console.error(
			`before-deploy: A release with version ${VERSION} already exists. Please increment version accordingly.`,
		);
		process.exit(1);
	}

	const prereleaseNumbers = versions
		.filter((v) => v.startsWith(VERSION) && v.includes('-'))
		.map((v) => Number(v.match(/\.(\d+)$/)![1]));
	const lastPrereleaseNumber = Math.max(-1, ...prereleaseNumbers);
	return `${version}-beta.${lastPrereleaseNumber + 1}`;
}
