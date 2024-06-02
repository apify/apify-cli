import { getLatestNpmVersion } from '../src/lib/version_check.js';

describe('VersionCheck', () => {
	describe('getLatestNpmVersion()', () => {
		it('should return package version', async () => {
			const latestVersion = await getLatestNpmVersion();
			expect(latestVersion).to.match(/^\d+\.\d+\.\d+$/);
		});
	});
});
