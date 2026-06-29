from dataclasses import dataclass

@dataclass
class Merchant:
    id: int         # Flipp's internal merchant id      :: .id
    name_id: str    # Flipp's internal name identifier  :: .name_identifier
    name: str       # Clean name                        :: .name

    @classmethod
    def from_dict(cls, raw: dict) -> "Merchant":
        return cls(
            id=int(raw["id"]),
            name_id=str(raw["name_identifier"]),
            name=str(raw["name"])
        )
    