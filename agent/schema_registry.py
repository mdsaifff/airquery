"""Loads DatasetSchema files and holds the column / operator whitelists."""

from pathlib import Path

from spec import Column, DatasetSchema, Op

# Which operators make sense for which column type.
OPS_BY_TYPE: dict[str, frozenset[Op]] = {
    "number": frozenset({"=", "!=", ">", ">=", "<", "<=", "between", "in"}),
    "text": frozenset({"=", "!=", "in", "contains"}),
    "timestamp": frozenset({"=", "!=", ">", ">=", "<", "<=", "between", "last_days"}),
}


class UnknownDatasetError(KeyError):
    pass


class SchemaRegistry:
    def __init__(self, schemas: dict[str, DatasetSchema]) -> None:
        self._schemas = schemas

    @classmethod
    def load(cls, directory: Path) -> "SchemaRegistry":
        schemas = {}
        for path in sorted(Path(directory).glob("*.schema.json")):
            schema = DatasetSchema.model_validate_json(path.read_text(encoding="utf-8"))
            schemas[schema.dataset] = schema
        return cls(schemas)

    @property
    def datasets(self) -> list[str]:
        return sorted(self._schemas)

    def get(self, dataset: str) -> DatasetSchema:
        try:
            return self._schemas[dataset]
        except KeyError:
            raise UnknownDatasetError(dataset) from None


def allowed_ops(column: Column) -> frozenset[Op]:
    return OPS_BY_TYPE[column.type]
