import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { execa } from 'execa';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { userHomeDir } from '../utils.js';
import { findRunningRuntimeEngine, imageExistsLocally, runtimeApiUrl, type ContainerEngine } from './docker.js';
import { installedActorRuntimeImage } from './ensure.js';
import { configuredRuntimePorts, resolveApiBaseUrl } from './target.js';

/** Matches the `name` in the file's own frontmatter. */
export const RUNTIME_SKILL_NAME = 'apify-actor-runtime';

/** Under the image's WORKDIR. */
const SKILL_DIR_IN_IMAGE = '/usr/src/app/skills/actor-runtime';

const SKILL_FILE = 'SKILL.md';

export type SkillSource = { kind: 'runtime'; baseUrl: string } | { kind: 'image'; image: string };

export interface ResolvedSkill {
	content: string;
	source: SkillSource;
}

export function describeSkillSource(source: SkillSource): string {
	return source.kind === 'runtime' ? `the runtime at ${source.baseUrl}` : `the '${source.image}' image`;
}

/** Unauthenticated by design, so it works before `apify login`. Null for anything that isn't a runtime. */
async function fetchSkillFromRuntime(baseUrl: string): Promise<string | null> {
	try {
		const response = await fetch(`${baseUrl.replace(/\/v2\/?$/, '')}/actor-runtime/skill`, {
			headers: APIFY_CLIENT_DEFAULT_HEADERS,
		});
		if (!response.ok) return null;

		const content = await response.text();
		return content.trim() ? content : null;
	} catch {
		return null;
	}
}

/** Without starting the image, so 'apify runtime install' is the prerequisite rather than a running
 * container. Copies the whole directory so material added to the skill later comes along unchanged. */
async function readSkillFromImage(engine: ContainerEngine, image: string): Promise<string | null> {
	const scratch = await mkdtemp(join(tmpdir(), 'apify-runtime-skill-'));
	let container: string | undefined;

	try {
		const { stdout } = await execa(engine, ['create', image]);
		container = stdout.trim().split('\n').at(-1)?.trim();
		if (!container) return null;

		await execa(engine, ['cp', `${container}:${SKILL_DIR_IN_IMAGE}/.`, scratch]);
		return await readFile(join(scratch, SKILL_FILE), 'utf8');
	} catch {
		return null;
	} finally {
		if (container) await execa(engine, ['rm', '-f', container]).catch(() => {});
		await rm(scratch, { recursive: true, force: true });
	}
}

/** Cheapest-first: HTTP, then the installed image. Deliberately no copy bundled with the CLI - one could
 * only ever describe the image the CLI was released against, not the one present. */
export async function resolveRuntimeSkill(): Promise<ResolvedSkill | null> {
	const baseUrl = resolveApiBaseUrl() ?? runtimeApiUrl(configuredRuntimePorts().api);

	const overHttp = await fetchSkillFromRuntime(baseUrl);
	if (overHttp) return { content: overHttp, source: { kind: 'runtime', baseUrl } };

	const engine = await findRunningRuntimeEngine();
	const image = installedActorRuntimeImage();

	// A running container that did not answer means an older runtime without the endpoint; its image is
	// still worth reading. Otherwise try whichever engine has the image on disk.
	for (const candidate of engine ? [engine] : (['docker', 'podman'] as const)) {
		if (!(await imageExistsLocally(candidate, image))) continue;

		const fromImage = await readSkillFromImage(candidate, image);
		if (fromImage) return { content: fromImage, source: { kind: 'image', image } };
	}

	return null;
}

/** Frontmatter is metadata for a skill loader; a caller that prints has none, so swap it for a line
 * saying what the reader is holding. The body is passed through untouched. */
export function frameSkillForReading(content: string, source: SkillSource): string {
	const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart();

	return [
		`<!-- Agent Skill '${RUNTIME_SKILL_NAME}', read from ${describeSkillSource(source)}. -->`,
		'',
		`> The local Actor runtime's own instructions for using it. To keep them loaded in later sessions`,
		`> instead of only this one, run \`apify runtime skill --install\`.`,
		'',
		body,
	].join('\n');
}

export interface SkillTarget {
	directory: string;
	label: string;
}

/** The directories of the Agent Skills convention. */
export function skillTargets(home = userHomeDir(), cwd = process.cwd()): SkillTarget[] {
	const targets: SkillTarget[] = [];

	if (home) {
		targets.push(
			{ directory: join(home, '.claude', 'skills', RUNTIME_SKILL_NAME), label: 'Claude Code' },
			{ directory: join(home, '.agents', 'skills', RUNTIME_SKILL_NAME), label: 'Codex and other agents' },
		);
	}

	// Only where the project already keeps skills: creating these in whatever repository the user happens
	// to be standing in is a tracked, committable change they did not ask for.
	for (const [directory, label] of [
		['.claude', 'this project (Claude Code)'],
		['.agents', 'this project'],
	] as const) {
		if (existsSync(join(cwd, directory, 'skills'))) {
			targets.push({ directory: join(cwd, directory, 'skills', RUNTIME_SKILL_NAME), label });
		}
	}

	return targets;
}

/** Under the frontmatter, so a loader still reads that first. An installed skill is a snapshot; this is
 * what makes a stale one recognisable. */
export function stampSkill(content: string, source: SkillSource, now = new Date()): string {
	const stamp = `<!-- Installed by 'apify runtime skill --install' from ${describeSkillSource(source)} on ${now.toISOString().slice(0, 10)}. Re-run it after upgrading the runtime. -->`;
	const frontmatter = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/.exec(content);

	return frontmatter ? `${frontmatter[1]}\n${stamp}\n${content.slice(frontmatter[1].length)}` : `${stamp}\n${content}`;
}

export async function writeSkillTo(target: SkillTarget, content: string): Promise<void> {
	await mkdir(target.directory, { recursive: true });
	await writeFile(join(target.directory, SKILL_FILE), content);
}
