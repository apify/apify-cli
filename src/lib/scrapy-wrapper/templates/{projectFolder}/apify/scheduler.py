import traceback

from scrapy import Spider
from scrapy.core.scheduler import BaseScheduler
from scrapy.http.request import Request
from scrapy.utils.reactor import is_asyncio_reactor_installed

from apify.storages import RequestQueue

from .utils import nested_event_loop, open_queue_with_custom_client, to_apify_request, to_scrapy_request


class ApifyScheduler(BaseScheduler):
    """
    A Scrapy scheduler that uses the Apify Request Queue to manage requests.

    This scheduler requires the asyncio Twisted reactor to be installed.
    """

    def __init__(self) -> None:
        if not is_asyncio_reactor_installed():
            raise ValueError(
                f'{ApifyScheduler.__qualname__} requires the asyncio Twisted reactor. '
                'Make sure you have it configured in the TWISTED_REACTOR setting. See the asyncio '
                'documentation of Scrapy for more information.',
            )
        self._rq: RequestQueue | None = None
        self.spider: Spider | None = None

    def open(self, spider: Spider) -> None:
        """
        Open the scheduler.

        Args:
            spider: The spider that the scheduler is associated with.
        """
        self.spider = spider

        try:
            self._rq = nested_event_loop.run_until_complete(open_queue_with_custom_client())
        except BaseException:
            traceback.print_exc()

    def close(self, reason: str) -> None:
        """
        Close the scheduler.

        Args:
            reason: The reason for closing the scheduler.
        """
        nested_event_loop.stop()
        nested_event_loop.close()

    def has_pending_requests(self) -> bool:
        """
        Check if the scheduler has any pending requests.

        Returns:
            True if the scheduler has any pending requests, False otherwise.
        """
        try:
            is_finished = nested_event_loop.run_until_complete(self._rq.is_finished())
        except BaseException:
            traceback.print_exc()

        return not is_finished

    def enqueue_request(self, request: Request) -> bool:
        """
        Add a request to the scheduler.

        Args:
            request: The request to add to the scheduler.

        Returns:
            True if the request was successfully enqueued, False otherwise.
        """
        apify_request = to_apify_request(request)

        try:
            result = nested_event_loop.run_until_complete(self._rq.add_request(apify_request))
        except BaseException:
            traceback.print_exc()

        return bool(result['wasAlreadyPresent'])

    def next_request(self) -> Request | None:
        """
        Fetch the next request from the scheduler.

        Returns:
            The next request, or None if there are no more requests.
        """
        try:
            apify_request = nested_event_loop.run_until_complete(self._rq.fetch_next_request())
        except BaseException:
            traceback.print_exc()

        if apify_request is None:
            return None

        return to_scrapy_request(apify_request)
