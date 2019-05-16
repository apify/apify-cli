// This is the main Node.js source code file of your actor.
// It is referenced from the "scripts" section of the package.json file,
// so that it can be started by running "npm start".

// Include Apify SDK. For more information, see https://sdk.apify.com/
const Apify = require('apify');

Apify.main(async () => {
    // Get input of the actor (here only for demonstration purposes).
    // If you'd like to have your input checked and have Apify display
    // a user interface for it, add INPUT_SCHEMA.json file to your actor.
    // For more information, see https://apify.com/docs/actor/input-schema
    const input = await Apify.getInput();
    console.log('Input:');
    console.dir(input);

    // Open a request queue and add a start URL to it
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://www.iana.org/' });

    // Define a pattern of URLs that the crawler should visit
    const pseudoUrls = [new Apify.PseudoUrl('https://www.iana.org/[.*]')];

    // Create a crawler that will use headless Chrome / Puppeteer to extract data
    // from pages and recursively add links to newly-found pages
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,

        // This function is called for every page the crawler visits
        handlePageFunction: async ({ request, page }) => {
            const title = await page.title();
            console.log(`Title of ${request.url}: ${title}`);
            await Apify.pushData({
                title,
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
            await Apify.utils.enqueueLinks({ page, selector: 'a', pseudoUrls, requestQueue });
        },

        // This function is called for every page the crawler failed to load
        // or for which the handlePageFunction() throws at least "maxRequestRetries"-times
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },

        maxRequestRetries: 2,
        maxRequestsPerCrawl: 100,
        maxConcurrency: 10,
    });

    await crawler.run();
});
