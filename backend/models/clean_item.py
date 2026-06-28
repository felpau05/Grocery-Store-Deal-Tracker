from dataclasses import dataclass
from .units import Unit
from enum import Enum


@dataclass
class ItemMetadata:
    item_id: int
    flyer_id: int
    merchant_id: int

    
@dataclass
class Item:

    # Clean Item Name in English
    name: str

    # Brand (if availble)
    brand: str | None

    # Clean Merchant Name (the one flipp identifies in their backend)
    merchant: str

    #Start Date (when it went on sale) ISO 8601 date string
    start_date: str

    #End Date (when it stops being on sale last day) ISO 8601 date string
    end_date: str

    #Pricing

    #just the number
    price: float 
    price_unit: Unit


    # Multiply `price` by this to get the price for ONE price_unit.
    # 1.0 for EACH and for already-canonical units (price_text said
    # "/g" or "/mL" directly). NOT 1.0 for "/lb", "/kg", "/100g" etc —
    # those are quoted per a DIFFERENT amount than one canonical unit,
    # so the raw price needs scaling before it's truly per-g/per-mL.
    # Kept separate from `price` (rather than baking the adjustment in
    # eagerly) so `price` always means "what the flyer literally
    # quoted" — useful for display — and the normalization happens
    # lazily in price_per_unit, the same way size-based division
    # already happens lazily there instead of being pre-computed.
    price_unit_factor: float



    #just the number
    size: float | None
    size_unit: Unit | None

    # Category
    category: str

    # How flipp identifies the time
    meta_data: ItemMetadata

    high_confidence: bool


    @property
    def price_per_unit(self) -> tuple[float, Unit]:
        """Return (normalized_price, unit). Falls back to (price, EACH) 
        whenever a clean per-unit value can't be computed."""

        # Flipp already gave us a per-unit price (e.g. "$3.99/lb") —
        # price_unit_factor scales it to a TRUE per-canonical-unit
        # price ($3.99/lb -> $3.99 * (1/453.592) per g), not just a
        # relabeling of the unit.
        if self.price_unit not in (Unit.EACH, None):
            return self.price * self.price_unit_factor, self.price_unit
        
        # No size to divide by — price is just per item
        if self.size is None or self.size_unit is None:
            return self.price, Unit.EACH
        
        return self.price / self.size, self.size_unit
    

    def to_dict(self) -> dict:
        """Safely converts the dataclass to a dictionary, flattening Enums to strings."""
        from dataclasses import asdict
        
        # Get the standard dictionary
        data = asdict(self)
        
        # Safely convert the Enums to their string values
        data["price_unit"] = self.price_unit.value if self.price_unit else None
        data["size_unit"] = self.size_unit.value if self.size_unit else None
        
        # Grab the calculated price and unit from your property
        calculated_price, calculated_unit = self.price_per_unit
        
        # Safely get the string value of the unit (fallback to 'each' just in case)
        unit_str = calculated_unit.value if calculated_unit else "each"
        
        # Add the new formatted field to the dictionary (e.g., "$0.02/g")
        data["price_per_unit"] = f"${calculated_price}/{unit_str}"
        
        return data

    


