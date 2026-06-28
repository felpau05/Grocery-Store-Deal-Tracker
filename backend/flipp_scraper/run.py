import asyncio
import json
import logging
import argparse

from config import Config
from .client import (
    create_client,
    fetch_flyers, fetch_flyer_items, enrich_items,
    filter_merchants, generate_sid,
)
from .pipeline import run_pipeline_batch
from .parser import is_food_item
from models import Item

logger = logging.getLogger("flippwatch.scraper.run")


# Scrape Steps
#
# 1. Fetch and Filter to Valid FLyers
# 2. Extract Items, use name to filter out non food items and save item ids of all food items
# 3. Extract detailed items with item id


async def scrape(
    postal_code: str,
    merchants: list[str] | None = None,
    output_path: str | None = None,
) -> list[Item]:
    """Full scrape pipeline: fetch flyers → items → parse → return.

    Args:
        postal_code: Canadian postal code to scrape for.
        merchants: merchant names to include (defaults to Config).
        enrich: if True, fetch per-item detail data (slower, more fields).
        output_path: if set, write parsed results as JSON to this path.
    """

    

    async with create_client() as client:

        # Step 1. Fetch and filter to valid flyers
        logger.info("Fetching flyers for %s", postal_code)
        all_flyers = await fetch_flyers(client, postal_code)
        flyers = filter_merchants(all_flyers, merchants)
        logger.info("Found %d flyers from %d total", len(flyers), len(all_flyers))

        # Step 2. Fetch items, filter out non-food items and keep their ids
        food_items: list[dict] = []

        for flyer in flyers:
            flyer_id: int | None = flyer.get("id")
            merchant: str = flyer.get("merchant", "?")
            try:
                items = await fetch_flyer_items(client, flyer_id, postal_code)

                # Filter out non food items 

                #kept = [item for item in items if is_food_item(item.get("name") or "")]
                kept = [item for item in items if item.get("name") or ""]
                food_items.extend(kept)
                

                logger.info("  %s (flyer %s): %d items", merchant, flyer_id, len(items))

            except Exception as exc:
                logger.warning("  %s (flyer %s): failed — %s", merchant, flyer_id, exc)
        
        with open("basic_items.json", "w", encoding="utf-8") as f:
            json.dump(food_items, f, indent=2, ensure_ascii=False)

        # Step 3. Extract deatiled items via item id 
        sid = generate_sid()
        logger.info("Enriching %d items", len(food_items))
        raw_items = await enrich_items(client, food_items, postal_code, sid)
        with open("enriched_items.json", "w", encoding="utf-8") as f:
            json.dump(raw_items, f, indent=2, ensure_ascii=False)

    # 4. Run the parsing pipeline
    logger.info("Parsing %d items", len(raw_items))
    parsed = run_pipeline_batch(raw_items)

    hi = sum(1 for p in parsed if p.high_confidence)
    logger.info("Done: %d parsed, %d high confidence (%.1f%%)", len(parsed), hi, hi / max(len(parsed), 1) * 100)

    # 5. Output
    if output_path:
        
        results = [p.to_dict() for p in parsed]
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logger.info("Wrote %s", output_path)

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
        output_path=args.output,
    ))

#RUN:
# python -m flipp_scraper.run --output results.json
if __name__ == "__main__":
    main()