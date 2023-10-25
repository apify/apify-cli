from scrapy.crawler import CrawlerProcess
from scrapy.settings import Settings
from scrapy.utils.project import get_project_settings

from apify import Actor
from {{spider_module_name}} import {{spider_class_name}}

def _get_scrapy_settings(max_depth: int) -> Settings:
    """
    Get Scrapy project settings.
    """
    settings = get_project_settings()
    # Add our Actor Push Pipeline with the lowest priority
    settings['ITEM_PIPELINES']['{{apify_module_path}}.pipelines.ActorDatasetPushPipeline'] = 1
    # Disable default Retry Middleware
    settings['DOWNLOADER_MIDDLEWARES']['scrapy.downloadermiddlewares.retry.RetryMiddleware'] = None
    # Add our custom Retry Middleware with the top priority
    settings['DOWNLOADER_MIDDLEWARES']['{{apify_module_path}}.middlewares.ApifyRetryMiddleware'] = 999
    # Add our custom Scheduler
    settings['SCHEDULER'] = '{{apify_module_path}}.scheduler.ApifyScheduler'
    settings['DEPTH_LIMIT'] = max_depth
    return settings


async def main():
    async with Actor:
        Actor.log.info('Actor is being executed...')

        # Process Actor input
        actor_input = await Actor.get_input() or {}
        max_depth = actor_input.get('max_depth', 1)
        start_urls = [start_url.get('url') for start_url in actor_input.get('start_urls', [{'url': 'https://apify.com'}])]
        settings = _get_scrapy_settings(max_depth)

        # Add start URLs to the request queue
        rq = await Actor.open_request_queue()
        for url in start_urls:
            await rq.add_request({'url': url})

        # Currently, execution of only one Spider is supported
        process = CrawlerProcess(settings, install_root_handler=False)
        process.crawl({{spider_class_name}})
        process.start()
