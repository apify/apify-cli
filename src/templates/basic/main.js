const Apify = require('apify');

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');

    console.log(`My test input: ${input.test}`);

    console.log('Done.');
});
