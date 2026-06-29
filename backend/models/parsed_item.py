from dataclasses import dataclass, field
from .units import Unit
from .merchant import Merchant
from .clean_item import Item, ItemMetadata

@dataclass
class ParsedItem:
    """Flows through every pipeline step. `raw` is never mutated."""
    raw: dict
    merchant: Merchant

    name: str | None = None
    original_name: str | None = None
    size: float | None = None
    size_unit: Unit | None = None
    name_without_size: str | None = None
    clean_name: str | None = None
    price: float | None = None
    price_unit: Unit | None = None
    price_unit_factor: float = 1.0
    flags: list[str] = field(default_factory=list)

    description: str | None = None 
    original_description: str | None = None

    size_source: str | None = None

    

    @property
    def high_confidence(self) -> bool:
        return len(self.flags) == 0
    
    @property
    def brands(self) -> tuple[str, ...]:
        brands = self.raw.get("brand") or "" 

        if brands == "":
            return ()
        
        return tuple(brands.split(" | "))
    
    def to_clean_item(self) -> Item | None:

        name = self.clean_name or self.name
        if self.price is None or not name:
            return None
 
        raw = self.raw
        return Item(
            name=name,
            brands=self.brands,
            merchant_name=self.merchant.name,

            start_date=raw.get("valid_from") or "",
            end_date=raw.get("valid_to") or "",

            price=self.price,
            price_unit= self.price_unit or Unit.EACH,
            _price_unit_factor=self.price_unit_factor,
            
            size=self.size,
            size_unit=self.size_unit,
            
            product_image=raw.get("image_url") or "",
            cutout_image=raw.get("cutout_image_url") or "",
            
            category=raw.get("category") or "", # TO DO use classifier
            
            high_confidence=self.high_confidence,
            
            meta_data=ItemMetadata(
                item_id=int(raw.get("id", 0)),
                flyer_id=int(raw.get("flyer_id", 0)),
                merchant_id=self.merchant.id,
                original_name=raw.get("name", ""),
                original_desc=raw.get("description", "")
            )
        )
