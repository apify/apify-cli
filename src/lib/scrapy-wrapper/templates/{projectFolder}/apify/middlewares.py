import traceback

from scrapy import Spider
from scrapy.downloadermiddlewares.retry import RetryMiddleware
from scrapy.exceptions import IgnoreRequest
from scrapy.http import Request, Response
from scrapy.utils.response import response_status_message

from apify.storages import RequestQueue

from .utils import nested_event_loop, open_queue_with_custom_client, to_apify_request


class ApifyRetryMiddleware(RetryMiddleware):
    """
    Basically the default Scrapy retry middleware enriched with Apify's Request Queue interaction.
    """

    def __init__(self, *args: list, **kwargs: dict) -> None:
        super().__init__(*args, **kwargs)
        try:
            self._rq: RequestQueue = nested_event_loop.run_until_complete(open_queue_with_custom_client())
        except BaseException:
            traceback.print_exc()

    def __del__(self):
        nested_event_loop.stop()
        nested_event_loop.close()

    def process_response(self, request: Request, response: Response, spider: Spider) -> Request | Response:
        """
        Process the response and decide whether the request should be retried.

        Args:
            request: The request that was sent.
            response: The response that was received.
            spider: The Spider that sent the request.

        Returns:
            The response, or a new request if the request should be retried.
        """
        # Robots requests are bypassed directly, they don't go through a Scrapy Scheduler, and also through our
        # Request Queue. Check the scrapy.downloadermiddlewares.robotstxt.RobotsTxtMiddleware for details.
        assert isinstance(request.url, str)
        if request.url.endswith('robots.txt'):
            return response

        try:
            returned = nested_event_loop.run_until_complete(self._handle_retry_logic(request, response, spider))
        except BaseException:
            traceback.print_exc()

        return returned

    def process_exception(
        self,
        request: Request,
        exception: BaseException,
        spider: Spider,
    ) -> None | Response | Request:
        apify_request = to_apify_request(request)

        if isinstance(exception, IgnoreRequest):
            try:
                nested_event_loop.run_until_complete(self._rq.mark_request_as_handled(apify_request))
            except BaseException:
                traceback.print_exc()
        else:
            nested_event_loop.run_until_complete(self._rq.reclaim_request(apify_request))

        return super().process_exception(request, exception, spider)

    async def _handle_retry_logic(
        self,
        request: Request,
        response: Response,
        spider: Spider,
    ) -> Request | Response:
        apify_request = to_apify_request(request)

        if request.meta.get('dont_retry', False):
            await self._rq.mark_request_as_handled(apify_request)
            return response

        if response.status in self.retry_http_codes:
            await self._rq.reclaim_request(apify_request)
            reason = response_status_message(response.status)
            return self._retry(request, reason, spider) or response

        await self._rq.mark_request_as_handled(apify_request)
        return response
