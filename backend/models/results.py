from dataclasses import dataclass, field
from .units import Unit

@dataclass
class LanguageResult:
    name: str
    original_name: str = ""
    is_bilingual: bool = False
    flags: list[str] = field(default_factory=list)
    score_a: float = 0.0
    score_b: float = 0.0

    @property
    def high_confidence(self) -> bool:
        return len(self.flags) == 0


@dataclass
class SizeResult:
    cleaned_name: str
    quantity: float | None = None
    size: float | None = None
    unit: Unit | None = None
    total_size: float | None = None
    matched_raw: str | None = None
    flags: list[str] = field(default_factory=list)

    @property
    def high_confidence(self) -> bool:
        return len(self.flags) == 0


@dataclass
class PriceResult:
    price: float | None
    flags: list[str] = field(default_factory=list)
    is_multi_buy: bool = False
    multi_count: int | None = None
    original_total: float | None = None

    @property
    def high_confidence(self) -> bool:
        return self.price is not None and len(self.flags) == 0