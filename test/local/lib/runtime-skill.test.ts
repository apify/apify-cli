import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	describeSkillSource,
	frameSkillForReading,
	RUNTIME_SKILL_NAME,
	skillTargets,
	stampSkill,
	writeSkillTo,
} from '../../../src/lib/runtime/skill.js';

const SKILL = ['---', 'name: apify-actor-runtime', 'description: drives the runtime', '---', '', '# Body', 'text'].join(
	'\n',
);

describe('frameSkillForReading', () => {
	it('replaces the frontmatter with a header saying what the reader is holding', () => {
		const framed = frameSkillForReading(SKILL, { kind: 'runtime', baseUrl: 'http://localhost:3333' });

		// Frontmatter is metadata for a skill loader; a caller that is printing has none.
		expect(framed).not.toContain('description: drives the runtime');
		expect(framed).toContain('Follow these instructions when working with Actors against this runtime');
		expect(framed).toContain('apify runtime skill --install');
		expect(framed).toContain('# Body');
	});

	it('names where the skill came from', () => {
		expect(frameSkillForReading(SKILL, { kind: 'image', image: 'apify/actor-runtime:latest' })).toContain(
			`the 'apify/actor-runtime:latest' image`,
		);
	});

	it('passes through a file that has no frontmatter', () => {
		expect(frameSkillForReading('# Body only', { kind: 'image', image: 'x' })).toContain('# Body only');
	});
});

describe('stampSkill', () => {
	it('records the source and date below the frontmatter, leaving the frontmatter first', () => {
		const stamped = stampSkill(SKILL, { kind: 'image', image: 'apify/actor-runtime:latest' }, new Date('2026-09-11'));

		// A loader reads the frontmatter from the top of the file - the stamp must not displace it.
		expect(stamped.startsWith('---\nname: apify-actor-runtime')).toBe(true);
		expect(stamped).toContain('2026-09-11');
		expect(stamped).toContain(`the 'apify/actor-runtime:latest' image`);
		expect(stamped).toContain('# Body');
	});

	it('still stamps a file with no frontmatter', () => {
		const stamped = stampSkill('# Body only', { kind: 'runtime', baseUrl: 'http://localhost:3333' });

		expect(stamped).toContain('Installed by');
		expect(stamped).toContain('# Body only');
	});
});

describe('describeSkillSource', () => {
	it('distinguishes a live runtime from a stopped image', () => {
		expect(describeSkillSource({ kind: 'runtime', baseUrl: 'http://localhost:3333' })).toBe(
			'the runtime at http://localhost:3333',
		);
		expect(describeSkillSource({ kind: 'image', image: 'apify/actor-runtime:latest' })).toBe(
			`the 'apify/actor-runtime:latest' image`,
		);
	});
});

describe('skillTargets', () => {
	it('covers Claude Code and the open-standard location under the home directory', () => {
		const targets = skillTargets('/home/someone', '/work/project-without-agent-dirs');

		expect(targets.map((target) => target.directory)).toEqual([
			join('/home/someone', '.claude', 'skills', RUNTIME_SKILL_NAME),
			join('/home/someone', '.agents', 'skills', RUNTIME_SKILL_NAME),
		]);
	});

	it('adds a project location only when that project already keeps skills of its own', async () => {
		const project = await mkdtemp(join(tmpdir(), 'apify-skill-project-'));

		try {
			expect(skillTargets('/home/someone', project)).toHaveLength(2);

			await mkdir(join(project, '.agents', 'skills'), { recursive: true });

			const targets = skillTargets('/home/someone', project);
			expect(targets).toHaveLength(3);
			expect(targets[2].directory).toBe(join(project, '.agents', 'skills', RUNTIME_SKILL_NAME));
		} finally {
			await rm(project, { recursive: true, force: true });
		}
	});

	it('returns nothing rather than writing into an unrelated directory when there is no home', () => {
		expect(skillTargets('', '/work/project-without-agent-dirs')).toEqual([]);
	});
});

describe('writeSkillTo', () => {
	it('creates the whole skill directory and writes SKILL.md into it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'apify-skill-test-'));

		try {
			const directory = join(root, 'nested', '.claude', 'skills', RUNTIME_SKILL_NAME);
			await writeSkillTo({ directory, label: 'test' }, SKILL);

			expect(await readFile(join(directory, 'SKILL.md'), 'utf8')).toBe(SKILL);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
