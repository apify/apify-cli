const Apify = require('apify');
const rp = require('request-promise');

Apify.main(async () => {
    const { sources } = await Apify.getValue('INPUT');

    if (!sources) throw new Error('input.sources is missing!!!!');

    const requestList = new Apify.RequestList({
        sources,
        state: await Apify.getValue('request-list-state'),
    });

    await requestList.initialize();

    const handleRequestFunction = async ({ request }) => {
        await Apify.pushData({
            request: request,
            finishedAt: new Date(),
            html: await rp(request.url),
        });
    };

    const handleFailedRequestFunction = async ({ request }) => {
        await Apify.pushData({
            request,
            finishedAt: new Date(),
            isFailed: true,
        });
    };

    const basicCrawler = new Apify.BasicCrawler({
        requestList,
        minConcurrency: 1,
        maxConcurrency: 75,
        abortInstanceAfterRequestCount: 1000,
        maxOpenPagesPerInstance: 50,
        handleRequestFunction,
        handleFailedRequestFunction,
        pageOpsTimeoutMillis: 180000,
        puppeteerConfig: { dumpio: false },
    });

    // Some info usefull for debugging.
    setInterval(() => {
        const { concurrency, runningCount } = basicCrawler.basicCrawler.autoscaledPool;
        console.log(`Concurrency: ${concurrency}, runningCount: ${runningCount}`);
    }, 10000);

    setInterval(() => Apify.setValue('request-list-state', requestList.getState()), 60000);

    await basicCrawler.run();
});
