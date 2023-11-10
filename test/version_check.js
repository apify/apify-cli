const chai = require('chai');

const { getLatestNpmVersion } = require('../src/lib/version_check');

chai.use(require('chai-match'));

describe('VersionCheck', () => {
    describe('getLatestNpmVersion()', () => {
        it('should return package version', async () => {
            const latestVersion = await getLatestNpmVersion();
            chai.expect(latestVersion).to.match(/^\d+\.\d+\.\d+$/);
        });
    });
});
