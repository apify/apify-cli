import { test } from '@oclif/test';

import { SecretRmCommand } from '../../../src/commands/secrets/rm.js';
import { getSecretsFile } from '../../../src/lib/secrets.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';

const SECRET_KEY = 'mySecret';
const SECRET_KEY_2 = 'mySecret2';
const SECRET_VALUE = 'mySecretValue';

useAuthSetup({ perTest: false });

describe('apify secrets:add', () => {
    beforeAll(async () => {
        const secrets = getSecretsFile();
        if (secrets[SECRET_KEY]) {
            await SecretRmCommand.run([SECRET_KEY], import.meta.url);
        }
    });

    // test
    //     .command(['secrets:add', SECRET_KEY, SECRET_VALUE])
    //     .it('should work', async () => {
    //         const secrets = getSecretsFile();
    //         expect(secrets[SECRET_KEY]).to.eql(SECRET_VALUE);
    //     });

    test
        .command(['secrets add', SECRET_KEY_2, SECRET_VALUE])
        .it('should work with alias', async () => {
            const secrets = getSecretsFile();
            expect(secrets[SECRET_KEY_2]).to.eql(SECRET_VALUE);
        });

    afterAll(async () => {
        const secrets = getSecretsFile();

        if (secrets[SECRET_KEY]) {
            await SecretRmCommand.run([SECRET_KEY], import.meta.url);
        }

        if (secrets[SECRET_KEY_2]) {
            await SecretRmCommand.run([SECRET_KEY_2], import.meta.url);
        }
    });
});
