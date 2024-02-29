import { test } from '@oclif/test';

import { SecretsAddCommand } from '../../../src/commands/secrets/add.js';
import { getSecretsFile } from '../../../src/lib/secrets.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';

const SECRET_KEY = 'mySecret';

useAuthSetup({ perTest: false });

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
