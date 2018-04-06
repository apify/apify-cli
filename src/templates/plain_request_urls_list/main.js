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
        handleRequestFunction,
        handleFailedRequestFunction,
    });

    setInterval(() => Apify.setValue('request-list-state', requestList.getState()), 60000);

    await basicCrawler.run();
});
