from itemadapter import ItemAdapter
from scrapy import Item, Spider

from apify import Actor


class ActorDatasetPushPipeline:
    """
    Used to output the items into the Actor's default dataset.

    Enabled only when the project is run as an Actor.
    """

    async def process_item(self, item: Item, spider: Spider) -> Item:
        item_dict = ItemAdapter(item).asdict()
        await Actor.push_data(item_dict)
        return item
