const Apify = require('apify');

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await page.goto(input.url);

    await page.waitFor(10000); // You have time to see opened browser window

    console.log('Closing Puppeteer...');
    await browser.close();

    console.log('Done.');
});
