import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { frameSkillForReading, RUNTIME_SKILL_NAME, skillTargets, stampSkill } from '../../../src/lib/runtime/skill.js';

const SKILL = ['---', 'name: apify-actor-runtime', 'description: drives the runtime', '---', '', '# Body', 'text'].join(
	'\n',
);

describe('frameSkillForReading', () => {
	it('replaces the frontmatter with a header saying what the reader is holding', () => {
		const framed = frameSkillForReading(SKILL, { kind: 'runtime', baseUrl: 'http://localhost:3333' });

		expect(framed).not.toContain('description: drives the runtime');
		expect(framed).toContain('the runtime at http://localhost:3333');
		expect(framed).toContain('apify runtime skill --install');
		expect(framed).toContain('# Body');
	});
});

describe('stampSkill', () => {
	it('records the source and date below the frontmatter, leaving the frontmatter first', () => {
		const stamped = stampSkill(SKILL, { kind: 'image', image: 'apify/actor-runtime:latest' }, new Date('2026-09-11'));

		expect(stamped.startsWith('---\nname: apify-actor-runtime')).toBe(true);
		expect(stamped).toContain('2026-09-11');
		expect(stamped).toContain(`the 'apify/actor-runtime:latest' image`);
		expect(stamped).toContain('# Body');
	});
});

describe('skillTargets', () => {
	it('covers the home directory locations, and a project location only when the project already keeps skills', async () => {
		const project = await mkdtemp(join(tmpdir(), 'apify-skill-project-'));

		try {
			expect(skillTargets('/home/someone', project).map((target) => target.directory)).toEqual([
				join('/home/someone', '.claude', 'skills', RUNTIME_SKILL_NAME),
				join('/home/someone', '.agents', 'skills', RUNTIME_SKILL_NAME),
			]);

			await mkdir(join(project, '.agents', 'skills'), { recursive: true });

			const targets = skillTargets('/home/someone', project);
			expect(targets).toHaveLength(3);
			expect(targets[2].directory).toBe(join(project, '.agents', 'skills', RUNTIME_SKILL_NAME));
		} finally {
			await rm(project, { recursive: true, force: true });
		}
	});
});
