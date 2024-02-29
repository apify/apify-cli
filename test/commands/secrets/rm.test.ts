import { test } from '@oclif/test';

import { SecretsAddCommand } from '../../../src/commands/secrets/add.js';
import { getSecretsFile } from '../../../src/lib/secrets.js';

const SECRET_KEY = 'mySecret';

describe('apify secrets:rm', () => {
    beforeAll(async () => {
        const secrets = getSecretsFile();
        if (!secrets[SECRET_KEY]) {
            await SecretsAddCommand.run([SECRET_KEY, 'owo'], import.meta.url);
        }
    });

    test
        .command(['secrets:rm', SECRET_KEY])
        .it('should work', async () => {
            const secrets = getSecretsFile();
            expect(secrets[SECRET_KEY]).to.eql(undefined);
        });
});
