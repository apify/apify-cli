const Apify = require('apify');

Apify.main(async () => {
    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest(new Apify.Request({ url: 'https://news.ycombinator.com/' }));

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: async ({ page, request }) => {
            const title = await page.title();
            const posts = await page.$$('.athing');

            console.log(`Page ${request.url} succeeded and it has ${posts.length} posts.`);

            // Save data.
            await Apify.pushData({
                url: request.url,
                title,
                postsCount: posts.length,
            });
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();
});
