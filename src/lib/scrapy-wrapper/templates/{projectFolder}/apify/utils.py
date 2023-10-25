import asyncio

from scrapy import Request

from apify import Actor
from apify.storages import RequestQueue, StorageClientManager

nested_event_loop: asyncio.AbstractEventLoop = asyncio.new_event_loop()


def to_apify_request(scrapy_request: Request) -> dict:
    """
    Convert a Scrapy request to an Apify request.

    Args:
        scrapy_request: The Scrapy request to be converted.

    Returns:
        The converted Apify request.
    """
    apify_request_id = None
    if scrapy_request.meta.get('apify_request_id'):
        apify_request_id = scrapy_request.meta.pop('apify_request_id')

    apify_request_unique_key = None
    if scrapy_request.meta.get('apify_request_unique_key'):
        apify_request_unique_key = scrapy_request.meta.pop('apify_request_unique_key')

    apify_request = {
        'url': scrapy_request.url,
        'method': scrapy_request.method,
        'userData': {
            'meta': scrapy_request.meta,
        },
    }

    if apify_request_id:
        apify_request['id'] = apify_request_id

    if apify_request_unique_key:
        apify_request['uniqueKey'] = apify_request_unique_key

    return apify_request


def to_scrapy_request(apify_request: dict) -> Request:
    """
    Convert an Apify request to a Scrapy request.

    Args:
        apify_request: The Apify request to be converted.

    Returns:
        The converted Scrapy request.
    """
    scrapy_request = {
        'url': apify_request['url'],
        'meta': {
            'apify_request_id': apify_request['id'],
            'apify_request_unique_key': apify_request['uniqueKey'],
        },
    }

    if apify_request.get('method'):
        scrapy_request['method'] = apify_request['method']

    if apify_request.get('userData'):
        assert isinstance(apify_request['userData'], dict)
        if apify_request['userData'].get('meta'):
            assert isinstance(apify_request['userData']['meta'], dict)
            scrapy_request['meta'] = {
                **scrapy_request['meta'],
                **apify_request['userData']['meta'],
            }

    return Request(**scrapy_request)


def get_running_event_loop_id() -> int:
    """
    Get the ID of the currently running event loop.

    It could be useful mainly for debugging purposes.

    Returns:
        The ID of the event loop.
    """
    return id(asyncio.get_running_loop())


async def open_queue_with_custom_client() -> RequestQueue:
    """
    Open a Request Queue with custom Apify Client.

    TODO: add support for custom client to Actor.open_request_queue(), so that
    we don't have to do this hacky workaround
    """
    # Create a new Apify Client with its httpx client in the custom event loop
    custom_loop_apify_client = Actor.new_client()

    # Set the new Apify Client as the default client, back up the old client
    old_client = Actor.apify_client
    StorageClientManager.set_cloud_client(custom_loop_apify_client)

    # Create a new Request Queue in the custom event loop,
    # replace its Apify client with the custom loop's Apify client
    rq = await Actor.open_request_queue()

    if Actor.config.is_at_home:
        rq._request_queue_client = custom_loop_apify_client.request_queue(
            rq._id, client_key=rq._client_key,
        )

    # Restore the old Apify Client as the default client
    StorageClientManager.set_cloud_client(old_client)
    return rq
