from dataclasses import dataclass, field, asdict
from .units import Unit
from .merchant import Merchant
from enum import Enum


@dataclass
class ItemMetadata:
    item_id: int      # from enriched_items: .id
    flyer_id: int     # from enriched_items: .flyer_id
    merchant_id: int  # from raw_flyers:     .merchant_id

    original_name: str # from enriched_items: .name
    original_desc: str # from enriched_items: .description

    
@dataclass
class Item:


    # 2. Info
    name: str                 # Cleaned name
    brands: tuple[str, ...]    # List of brands
    merchant_name: str             # Clean merchant name 

    # 3. Dates (inclusive) (ISO 8601 date string)
    start_date: str
    end_date: str

    # 4. Pricing
    price: float       # price given by flipp
    price_unit: Unit   # unit of price found
    _price_unit_factor: float # conversion factor from holds the inverse of UNIT_TABLE's multiplier so that price_per_unit can scale the price correctly


    # 5. Size
    size: float | None
    size_unit: Unit | None

    # Images
    product_image: str # actual image of product
    cutout_image: str  # image of cutout from flyer

    # Category, will be done by classifier later
    category: str
    

    high_confidence: bool

    # 1. Meta Data
    meta_data: ItemMetadata
    

    @property
    def price_per_unit(self) -> tuple[float, Unit]:
        """Return (normalized_price, unit). Falls back to (price, EACH) 
        whenever a clean per-unit value can't be computed."""

        # Flipp already gave us a per-unit price (e.g. "$3.99/lb") —
        # _price_unit_factor scales it to a TRUE per-canonical-unit
        # price ($3.99/lb -> $3.99 * (1/453.592) per g), not just a
        # relabeling of the unit.
        if self.price_unit not in (Unit.EACH, None):
            return self.price * self._price_unit_factor, self.price_unit
        
        # No size to divide by — price is just per item
        if self.size is None or self.size_unit is None:
            return self.price, Unit.EACH
        
        return self.price / self.size, self.size_unit
    

    def to_dict(self) -> dict:
        """Safely converts the dataclass to a dictionary, flattening Enums to strings."""
        
        # Get the standard dictionary
        data = asdict(self)

        # Remove private fields
        del data["_price_unit_factor"]
        
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
