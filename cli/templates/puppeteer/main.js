const Apify = require('apify');

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await page.goto(input.url);

    console.log('Closing Puppeteer...');
    await browser.close();

    console.log('Done.');
});
