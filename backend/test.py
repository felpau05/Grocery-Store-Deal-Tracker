import asyncio
import json
import httpx
from pprint import pprint

from flipp_scraper import (
    DETAIL_CONCURRENCY,
    HEADERS,
    MERCHANTS,
    TIMEOUT,
    enrich_items,
    fetch_flyer_items,
    fetch_flyers,
    filter_merchants,
    generate_sid,
)
from config import Config



async def test(postal_code: str | None, merchants: list[str] | None):
    
    # Check for postal code
    if postal_code is None:
        raise RuntimeError("Missing required environment variable: TEST_POSTAL_CODE")
    
    if merchants is None:
        merchants = Config.DEFAULT_MERCHANTS

    # Fetch all flyers then filter to only wanted flyers
    raw_flyers = await fetch_flyers(postal_code)
    flyers = filter_merchants(raw_flyers, merchants)
    
    with open(Config.TEST_OUTPUTS_PATH/"raw_flyers.json", "w", encoding="utf-8") as f:
        json.dump(raw_flyers, f, indent=4)
    
    with open(Config.TEST_OUTPUTS_PATH/"flyers.json", "w", encoding="utf-8") as f:
        json.dump(flyers, f, indent=4)

    print("Done")

    # Get items (should filter out invalid date ranegs here tho like the flyers)

    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        headers=HEADERS,
        limits=httpx.Limits(
            max_connections=DETAIL_CONCURRENCY,
            max_keepalive_connections=DETAIL_CONCURRENCY,
        )
    ) as client:
        
        lst = []
        for flyer in flyers:
            flyer_id: int | None= flyer.get("id")

            try:
                basic_items = await fetch_flyer_items(
                    client=client,
                    flyer_id=flyer_id,
                    postal_code=postal_code
                )
            except Exception:
                print("error")
                continue

            lst += basic_items
        
        with open(Config.TEST_OUTPUTS_PATH/"items.json", "w", encoding="utf-8") as f:
            json.dump(lst, f, indent=4)
    




if __name__ == "__main__":
    asyncio.run(test(Config.TEST_POSTAL_CODE, merchants=None))
