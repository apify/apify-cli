const { replaceSecretsValue } = require('../src/lib/secrets');

describe('Secrets', () => {
    describe('replaceSecretsValue()', () => {
        it('should work', () => {
            const spy = vitest.spyOn(console, 'log');

            const secrets = {
                myProdToken: 'mySecretToken',
                mongoUrl: 'mongo://bla@bla:supermongo.com:27017',
            };
            const env = {
                TOKEN: '@myProdToken',
                USER: 'jakub.drobnik@apify.com',
                MONGO_URL: '@mongoUrl',
                WARNING: '@doesNotExist',
            };
            const updatedEnv = replaceSecretsValue(env, secrets);

            expect(updatedEnv).to.deep.equal({
                TOKEN: secrets.myProdToken,
                USER: 'jakub.drobnik@apify.com',
                MONGO_URL: secrets.mongoUrl,
            });

            expect(spy).toHaveBeenCalled();
            expect(spy.mock.calls[0][0]).to.include('Warning:');
        });
    });
});
