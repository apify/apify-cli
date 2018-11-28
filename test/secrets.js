const { expect } = require('chai');
const sinon = require('sinon');
const { replaceSecretsValue } = require('../src/lib/secrets');

describe('Secrets', () => {
    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    describe('replaceSecretsValue()', () => {
        it('should work', () => {
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
            expect(console.log.callCount).to.eql(1);
            expect(console.log.args[0][0]).to.include('Warning:');
        });
    });

    afterEach(() => {
        console.log.restore();
    });
});
