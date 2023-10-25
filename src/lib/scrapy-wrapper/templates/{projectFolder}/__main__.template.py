# This file is executed only when the project is run as an Apify Actor,
# not when you run it locally using `scrapy crawl`.

# We need to configure the logging first before we import anything else,
# so that nothing else imports `scrapy.utils.log` before we patch it.
import logging
import scrapy.utils.log
from apify.log import ActorLogFormatter

# If you want to change the logging level, change it here
LOGGING_LEVEL = logging.INFO

handler = logging.StreamHandler()
handler.setFormatter(ActorLogFormatter(include_logger_name=True))

apify_logger = logging.getLogger('apify')
apify_logger.setLevel(LOGGING_LEVEL)
apify_logger.addHandler(handler)

apify_client_logger = logging.getLogger('apify_client')
apify_client_logger.setLevel(LOGGING_LEVEL)
apify_client_logger.addHandler(handler)


# We can't attach our log handler to the loggers normally,
# because Scrapy would remove them in the `configure_logging` call here:
# https://github.com/scrapy/scrapy/blob/a5c1ef82762c6c0910abea00c0a6249c40005e44/scrapy/utils/log.py#L95
# (even though `disable_existing_loggers` is set to False :facepalm:).
# We need to monkeypatch Scrapy's `configure_logging` method like this,
# so that our handler is attached right after Scrapy calls the `configure_logging` method,
# because otherwise we would lose some log messages.
old_configure_logging = scrapy.utils.log.configure_logging

def new_configure_logging(*args, **kwargs):
    old_configure_logging(*args, **kwargs)

    # Scrapy uses these four main loggers:
    # https://github.com/scrapy/scrapy/blob/a5c1ef82762c6c0910abea00c0a6249c40005e44/scrapy/utils/log.py#L44-L61
    scrapy_logger = logging.getLogger('scrapy')
    twisted_logger = logging.getLogger('twisted')
    filelock_logger = logging.getLogger('filelock')
    hpack_logger = logging.getLogger('hpack')

    # Set handlers
    scrapy_logger.addHandler(handler)
    twisted_logger.addHandler(handler)
    filelock_logger.addHandler(handler)
    hpack_logger.addHandler(handler)

    # Set levels
    scrapy_logger.setLevel(LOGGING_LEVEL)
    twisted_logger.setLevel(LOGGING_LEVEL)
    filelock_logger.setLevel(LOGGING_LEVEL)
    hpack_logger.setLevel(LOGGING_LEVEL)

scrapy.utils.log.configure_logging = new_configure_logging


# Now we can do the rest of the setup
import asyncio
import os
import nest_asyncio
from scrapy.utils.reactor import install_reactor
from .apify.main import main

# This is necessary so that twisted and asyncio work well together
install_reactor('twisted.internet.asyncioreactor.AsyncioSelectorReactor')
nest_asyncio.apply()

os.environ['SCRAPY_SETTINGS_MODULE'] = '{{scrapy_settings_module}}'

asyncio.run(main())
