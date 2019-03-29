const Apify = require('apify');
const rp = require('request-promise');

Apify.main(async () => {
    const { sources } = await Apify.getInput();

    if (!sources) throw new Error('input.sources is missing!!!!');

    const requestList = await Apify.openRequestList('my-request-list', sources);

    const handleRequestFunction = async ({ request }) => {
        await Apify.pushData({
            request,
            finishedAt: new Date(),
            html: await rp(request.url),
        });
    };

    const handleFailedRequestFunction = async ({ request }) => {
        await Apify.pushData({
            '#isFailed': true,
            '#debug': Apify.utils.createRequestDebugInfo(request),
        });
    };

    const basicCrawler = new Apify.BasicCrawler({
        requestList,
        handleRequestFunction,
        handleFailedRequestFunction,
    });

    await basicCrawler.run();
});
