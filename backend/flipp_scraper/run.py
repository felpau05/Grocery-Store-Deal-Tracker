import asyncio
import json
import logging
import argparse

from config import Config
from .client import (
    create_client,
    fetch_flyers, fetch_flyer_items, enrich_items,
    filter_merchants, generate_sid, filter_flyers,
    fetch_merchants
)
from .pipeline import run_pipeline_batch
from .parser import is_food_item
from models import Item, Merchant

logger = logging.getLogger("flippwatch.scraper.run")


# Scrape Steps
#
# 1. Fetch and Filter to Valid FLyers
# 2. Extract Items, use name to filter out non food items and save item ids of all food items
# 3. Extract detailed items with item id


async def scrape(
    postal_code: str,
    valid_merchants: set[int] | None = None,
    output_file: str | None = None,
) -> list[Item]:
    """Full scrape pipeline: fetch flyers → items → parse → return.

    Args:
        postal_code: Canadian postal code to scrape for.
        merchants: merchant names to include (defaults to Config).
        enrich: if True, fetch per-item detail data (slower, more fields).
        output_file: if set, write parsed results as JSON to this path.
    """

    # Roadmap:
    # 1. Fetch Merchants, Convert to dataclass, filter to relavent merchants
    # 2. Fetch and filter to valif flyers

    

    async with create_client() as client:

        # Step 0. Fetch and filter to valid merchants
        logger.info("Fetching Merchants for %s", postal_code)
        all_merchants = await fetch_merchants(client, postal_code)
        _: list[Merchant] = [Merchant.from_dict(m) for m in filter_merchants(all_merchants, valid_merchants)]
        merchants: dict[int, Merchant] = {m.id: m for m in _}
        
        # Step 1. Fetch and filter to valid flyers
        logger.info("Fetching flyers for %s", postal_code)
        all_flyers = await fetch_flyers(client, postal_code)
        flyers = filter_flyers(all_flyers, valid_merchants)
        logger.info("Found %d flyers from %d total", len(flyers), len(all_flyers))

        # Step 2. Fetch items, filter out non-food items and keep their ids
        food_items: list[dict] = []

        for flyer in flyers:
            flyer_id: int = flyer["id"]
            merchant_id: int = flyer["merchant_id"]

            try:
                items = await fetch_flyer_items(client, flyer_id, postal_code)

                for item in items:
                    item["merchant_id"] = merchant_id
                # Filter out non food items 
                kept = [item for item in items if is_food_item(item.get("name") or "")]
                food_items.extend(kept)
                

                logger.info("Merchant %s (flyer %s): %d items", merchant_id, flyer_id, len(items))

            except Exception as exc:
                logger.warning("Merchant %s (flyer %s): failed — %s", merchant_id, flyer_id, exc)
        
        with open(Config.TEST_OUTPUTS_PATH/"basic_items.json", "w", encoding="utf-8") as f:
            json.dump(food_items, f, indent=2, ensure_ascii=False)

        # Step 3. Extract deatiled items via item id 
        sid = generate_sid()
        logger.info("Enriching %d items", len(food_items))
        raw_items = await enrich_items(client, food_items, postal_code, sid)
        with open(Config.TEST_OUTPUTS_PATH/"enriched_items.json", "w", encoding="utf-8") as f:
            json.dump(raw_items, f, indent=2, ensure_ascii=False)

    # 4. Run the parsing pipeline
    logger.info("Parsing %d items", len(raw_items))
    parsed = run_pipeline_batch(raw_items, merchants)

    hi = sum(1 for p in parsed if p.high_confidence)
    logger.info("Done: %d parsed, %d high confidence (%.1f%%)", len(parsed), hi, hi / max(len(parsed), 1) * 100)

    # 5. Output
    if output_file:
        
        results = [p.to_dict() for p in parsed]
        with open(Config.TEST_OUTPUTS_PATH/output_file, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logger.info("Wrote %s", output_file)

    return [p for p in parsed]


def main():
    parser = argparse.ArgumentParser(description="Flipp grocery scraper")
    parser.add_argument("--postal", default=Config.TEST_POSTAL_CODE, help="Postal code")
    parser.add_argument("--output", "-o", default=None, help="Output JSON path")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    if not args.postal:
        print("Set TEST_POSTAL_CODE in .env or pass --postal")
        return

    asyncio.run(scrape(
        postal_code=args.postal,
        output_file=args.output,
    ))

#RUN:
# python -m flipp_scraper.run --output results.json
if __name__ == "__main__":
    main()