const Apify = require('apify');

Apify.main(async () => {
    const requestListState = 'my-request-list-state';
    const pages = [];

    // Get urls for crawl
    if (!await Apify.getValue(requestListState)) {
        const browser = await Apify.launchPuppeteer();

        const page = await browser.newPage();
        await page.goto('https://www.apify.com/library?type=acts&search=user%3Aapify%20example');

        const links = await page.$$eval('.crawler-card a', links => links.map(link => link.href));

        links.forEach(link => pages.push({ url: link }));

        await browser.close();
    }

    const requestList = new Apify.RequestList({
        sources: pages,
        // Initialize from previous state if act was restarted due to some error
        state: await Apify.getValue(requestListState),
    });

    await requestList.initialize();

    /**
     * This crawls all links using Puppeteer crawler
     *
     * How puppeteer crawler works:
     * https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler
     */
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        disableProxy: true,
        // Parameter page here is an intance of Puppeteer.Page with page.goto(request.url) already called
        handlePageFunction: async ({ page, request }) => {
            console.log(`Go to ---> ${request.url}`);
            await Apify.pushData({
                title: await page.title(),
                url: request.url,
                succeeded: true,
            });
        },
        handleFailedRequestFunction: async ({ request }) => {
            await Apify.pushData({
                url: request.url,
                succeeded: false,
                errors: request.errorMessages,
            });
        },
    });

    await crawler.run();

    console.log('Done.');
});
