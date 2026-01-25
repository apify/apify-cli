import type { Actor, Build } from 'apify-client';

import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { waitForBuildToFinish } from '../../../__setup__/build-utils.js';
import { testUserClient } from '../../../__setup__/config.js';
import { safeLogin, useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useUniqueId } from '../../../__setup__/hooks/useUniqueId.js';

const { BuildsAddTagCommand } = await import('../../../../src/commands/builds/add-tag.js');
const { BuildsRemoveTagCommand } = await import('../../../../src/commands/builds/remove-tag.js');

const ACTOR_NAME = useUniqueId('cli-builds-tag-test');

useAuthSetup({ perTest: false });

const { lastErrorMessage, lastLogMessage } = useConsoleSpy();

const TEST_TIMEOUT = 120_000;

describe('[api] apify builds add-tag / remove-tag', () => {
	let testActor: Actor;
	let testBuild: Build;

	beforeAll(async () => {
		await safeLogin();

		// Create a test actor with a simple source
		testActor = await testUserClient.actors().create({
			name: ACTOR_NAME,
			versions: [
				{
					versionNumber: '0.0',
					sourceType: 'SOURCE_FILES' as any,
					buildTag: 'latest',
					sourceFiles: [
						{
							name: 'Dockerfile',
							format: 'TEXT',
							content: 'FROM apify/actor-node:20\nCOPY . ./\nCMD ["node", "main.js"]',
						},
						{
							name: 'main.js',
							format: 'TEXT',
							content: 'console.log("Hello");',
						},
					],
				},
			],
		});

		// Build the actor and wait for it to finish
		const buildStarted = await testUserClient.actor(testActor.id).build('0.0');
		testBuild = (await waitForBuildToFinish(testUserClient, buildStarted.id))!;
	}, TEST_TIMEOUT);

	afterAll(async () => {
		if (testActor) {
			await testUserClient.actor(testActor.id).delete();
		}
	});

	describe('builds add-tag', () => {
		it('should add a tag to a build', async () => {
			await testRunCommand(BuildsAddTagCommand, {
				flags_build: testBuild.id,
				flags_tag: 'beta',
			});

			expect(lastLogMessage()).toMatch(/tag.*beta.*added/i);

			// Verify via API
			const actor = await testUserClient.actor(testActor.id).get();
			expect(actor?.taggedBuilds?.beta?.buildId).toBe(testBuild.id);
		});

		it('should show error when build is already tagged with the same tag', async () => {
			// First, ensure the tag exists
			await testRunCommand(BuildsAddTagCommand, {
				flags_build: testBuild.id,
				flags_tag: 'existing-tag',
			});

			// Try to add the same tag again
			await testRunCommand(BuildsAddTagCommand, {
				flags_build: testBuild.id,
				flags_tag: 'existing-tag',
			});

			expect(lastLogMessage()).toMatch(/already tagged/i);
		});

		it('should show error when build does not exist', async () => {
			await testRunCommand(BuildsAddTagCommand, {
				flags_build: 'nonexistent-build-id',
				flags_tag: 'test-tag',
			});

			expect(lastErrorMessage()).toMatch(/not found/i);
		});

		it(
			'should show previous build info when reassigning a tag',
			async () => {
				// Tag the build with 'reassign-test'
				await testRunCommand(BuildsAddTagCommand, {
					flags_build: testBuild.id,
					flags_tag: 'reassign-test',
				});

				// Create another build
				const buildStarted2 = await testUserClient.actor(testActor.id).build('0.0');
				const testBuild2 = (await waitForBuildToFinish(testUserClient, buildStarted2.id))!;

				// Reassign the tag to the new build
				await testRunCommand(BuildsAddTagCommand, {
					flags_build: testBuild2.id,
					flags_tag: 'reassign-test',
				});

				expect(lastLogMessage()).toMatch(/previously pointed to build/i);

				// Verify via API
				const actor = await testUserClient.actor(testActor.id).get();
				expect(actor?.taggedBuilds?.['reassign-test']?.buildId).toBe(testBuild2.id);
			},
			TEST_TIMEOUT,
		);
	});

	describe('builds remove-tag', () => {
		it('should remove a tag from a build', async () => {
			// First add a tag
			await testRunCommand(BuildsAddTagCommand, {
				flags_build: testBuild.id,
				flags_tag: 'to-remove',
			});

			// Verify it was added
			let actor = await testUserClient.actor(testActor.id).get();
			expect(actor?.taggedBuilds?.['to-remove']?.buildId).toBe(testBuild.id);

			// Remove the tag with --yes flag to skip confirmation
			await testRunCommand(BuildsRemoveTagCommand, {
				flags_build: testBuild.id,
				flags_tag: 'to-remove',
				flags_yes: true,
			});

			expect(lastLogMessage()).toMatch(/tag.*to-remove.*removed/i);

			// Verify via API
			actor = await testUserClient.actor(testActor.id).get();
			expect(actor?.taggedBuilds?.['to-remove']).toBeUndefined();
		});

		it('should show error when tag does not exist', async () => {
			await testRunCommand(BuildsRemoveTagCommand, {
				flags_build: testBuild.id,
				flags_tag: 'nonexistent-tag',
				flags_yes: true,
			});

			expect(lastErrorMessage()).toMatch(/does not exist/i);
		});

		it(
			'should show error when tag points to a different build',
			async () => {
				// Create another build and tag it
				const buildStarted2 = await testUserClient.actor(testActor.id).build('0.0');
				const testBuild2 = (await waitForBuildToFinish(testUserClient, buildStarted2.id))!;

				await testRunCommand(BuildsAddTagCommand, {
					flags_build: testBuild2.id,
					flags_tag: 'other-build-tag',
				});

				// Try to remove the tag using the first build's ID
				await testRunCommand(BuildsRemoveTagCommand, {
					flags_build: testBuild.id,
					flags_tag: 'other-build-tag',
					flags_yes: true,
				});

				expect(lastErrorMessage()).toMatch(/not associated with build/i);
			},
			TEST_TIMEOUT,
		);

		it('should show error when build does not exist', async () => {
			await testRunCommand(BuildsRemoveTagCommand, {
				flags_build: 'nonexistent-build-id',
				flags_tag: 'test-tag',
				flags_yes: true,
			});

			expect(lastErrorMessage()).toMatch(/not found/i);
		});
	});
});
