import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { execa } from 'execa';

import { APIFY_CLIENT_DEFAULT_HEADERS } from '../consts.js';
import { userHomeDir } from '../utils.js';
import { ACTOR_RUNTIME_API_URL, findRunningRuntimeEngine, imageExistsLocally, type ContainerEngine } from './docker.js';
import { installedActorRuntimeImage } from './ensure.js';
import { resolveApiBaseUrl } from './target.js';

/** The skill's directory name wherever it is installed, and its `name` in the file's own frontmatter. */
export const RUNTIME_SKILL_NAME = 'apify-actor-runtime';

/** Where the skill lives inside the runtime image - `skills/actor-runtime/` under the image's WORKDIR. */
const SKILL_DIR_IN_IMAGE = '/usr/src/app/skills/actor-runtime';

const SKILL_FILE = 'SKILL.md';

/** How the skill was obtained, for the header `--install` stamps onto the written file. */
export type SkillSource = { kind: 'runtime'; baseUrl: string } | { kind: 'image'; image: string };

export interface ResolvedSkill {
	content: string;
	source: SkillSource;
}

export function describeSkillSource(source: SkillSource): string {
	return source.kind === 'runtime' ? `the runtime at ${source.baseUrl}` : `the '${source.image}' image`;
}

/**
 * `GET /actor-runtime/skill` from a running runtime. Unauthenticated by design (see the runtime's
 * `api.md`), so this works before `apify login` - which matters, because explaining how to log in is one
 * of the things the skill does. Resolves to null for anything that isn't a runtime answering.
 */
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

/**
 * Copies the skill out of the runtime image without starting it - `create`/`cp`/`rm`, so a stopped
 * runtime (or one never started at all) still answers. `cp` takes the whole directory rather than the one
 * file so that reference material added to the skill later comes along without changing this code.
 *
 * This is what makes 'apify runtime install' the real prerequisite for 'apify runtime skill', rather than
 * 'apify runtime start', and it keeps working with no network once the image is local.
 */
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

/**
 * The skill for the runtime this CLI is pointed at, tried cheapest-first: over HTTP when a runtime is
 * up, then out of the installed image. Null means neither - the caller should say to run
 * 'apify runtime install'.
 *
 * There is deliberately no copy bundled with the CLI to fall back to. The skill describes the image that
 * is actually present, and a CLI-side copy could only ever describe the image the CLI was released
 * against.
 */
export async function resolveRuntimeSkill(): Promise<ResolvedSkill | null> {
	const baseUrl = resolveApiBaseUrl() ?? ACTOR_RUNTIME_API_URL;

	const overHttp = await fetchSkillFromRuntime(baseUrl);
	if (overHttp) return { content: overHttp, source: { kind: 'runtime', baseUrl } };

	const engine = await findRunningRuntimeEngine();
	const image = installedActorRuntimeImage();

	// A running container whose HTTP answer we did not get means an older runtime without the endpoint;
	// its own image is still the right place to look. Otherwise fall back to whichever engine has the
	// image on disk.
	for (const candidate of engine ? [engine] : (['docker', 'podman'] as const)) {
		if (!(await imageExistsLocally(candidate, image))) continue;

		const fromImage = await readSkillFromImage(candidate, image);
		if (fromImage) return { content: fromImage, source: { kind: 'image', image } };
	}

	return null;
}

/**
 * Replaces the YAML frontmatter with a sentence naming what the reader is holding and which runtime it
 * describes. Frontmatter is metadata for a skill *loader*; a caller that is printing has no loader, and
 * an agent reading raw `name:`/`description:` lines in a tool result gets nothing from them. Everything
 * after the frontmatter is passed through untouched.
 */
export function frameSkillForReading(content: string, source: SkillSource): string {
	const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart();

	return [
		`<!-- Agent Skill '${RUNTIME_SKILL_NAME}', read from ${describeSkillSource(source)}. -->`,
		'',
		`> Follow these instructions when working with Actors against this runtime. To keep them loaded in`,
		`> later sessions instead of only this one, run \`apify runtime skill --install\`.`,
		'',
		body,
	].join('\n');
}

/** A skills directory an agent reads, and whether it is the user's or this project's. */
export interface SkillTarget {
	directory: string;
	label: string;
}

/**
 * Where to install, per the Agent Skills convention: `~/.claude/skills` for Claude Code, `~/.agents/skills`
 * for the agents that follow the open standard (Codex and most others), and the project-local
 * `.agents/skills` when the caller is sitting in a directory that already has one - never created
 * speculatively, since writing an agent directory into someone's repo uninvited is its own problem.
 */
export function skillTargets(home = userHomeDir(), cwd = process.cwd()): SkillTarget[] {
	const targets: SkillTarget[] = [];

	if (home) {
		targets.push(
			{ directory: join(home, '.claude', 'skills', RUNTIME_SKILL_NAME), label: 'Claude Code' },
			{ directory: join(home, '.agents', 'skills', RUNTIME_SKILL_NAME), label: 'Codex and other agents' },
		);
	}

	// Only when the project already keeps agent skills of its own. Creating '.claude/' or '.agents/' in
	// whatever repository the user happened to be standing in - very likely a tracked, committable change
	// they did not ask for - is worse than not installing there at all.
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

/**
 * Stamps the source and date into the installed copy, as an HTML comment under the frontmatter so it
 * survives in every renderer without disturbing the frontmatter a loader reads. An installed skill is a
 * snapshot; this is what makes an old one recognisable as one.
 */
export function stampSkill(content: string, source: SkillSource, now = new Date()): string {
	const stamp = `<!-- Installed by 'apify runtime skill --install' from ${describeSkillSource(source)} on ${now.toISOString().slice(0, 10)}. Re-run it after upgrading the runtime. -->`;
	const frontmatter = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/.exec(content);

	return frontmatter ? `${frontmatter[1]}\n${stamp}\n${content.slice(frontmatter[1].length)}` : `${stamp}\n${content}`;
}

export async function writeSkillTo(target: SkillTarget, content: string): Promise<void> {
	await mkdir(target.directory, { recursive: true });
	await writeFile(join(target.directory, SKILL_FILE), content);
}
