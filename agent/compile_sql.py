"""The only module that produces SQL: a validated QuerySpec -> DuckDB SQL + params.

Identifiers come from the DatasetSchema whitelist (and are quoted anyway);
every value is a bound `?` parameter. LIMIT is inlined only because Pydantic
has already constrained it to an int in 1..5000.
"""

from dataclasses import dataclass

from spec import Column, DatasetSchema, Filter, QuerySpec, Scalar
from validate import validate_spec


class InvalidSpecError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


@dataclass(frozen=True)
class CompiledQuery:
    sql: str
    params: list[Scalar]


def _ident(name: str, schema: DatasetSchema) -> str:
    allowed = {c.name for c in schema.columns} | {schema.id, schema.table}
    allowed |= set(schema.position_columns())
    if name not in allowed:
        raise InvalidSpecError([f"identifier {name!r} is not in the schema"])
    return '"' + name.replace('"', '""') + '"'


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _placeholder(col: Column) -> str:
    return "CAST(? AS TIMESTAMP)" if col.type == "timestamp" else "?"


def _where(f: Filter, col: Column, schema: DatasetSchema, params: list[Scalar]) -> str:
    c = _ident(col.name, schema)
    ph = _placeholder(col)
    if f.op == "between":
        assert isinstance(f.value, list)
        params.extend(f.value)
        return f"{c} BETWEEN {ph} AND {ph}"
    if f.op == "in":
        assert isinstance(f.value, list)
        params.extend(f.value)
        return f"{c} IN ({', '.join([ph] * len(f.value))})"
    if f.op == "contains":
        params.append(f"%{_escape_like(str(f.value))}%")
        return f"{c} ILIKE ? ESCAPE '\\'"
    assert not isinstance(f.value, list)
    params.append(f.value)
    if f.op == "last_days":
        # Relative to the newest row, not to today: the dataset is a fixed snapshot.
        table = _ident(schema.table, schema)
        return f"{c} >= (SELECT max({c}) FROM {table}) - to_days(CAST(? AS INTEGER))"
    return f"{c} {f.op} {ph}"


def compile_spec(spec: QuerySpec, schema: DatasetSchema) -> CompiledQuery:
    errors = validate_spec(spec, schema)
    if errors:
        raise InvalidSpecError(errors)

    select = [schema.id, *schema.position_columns(), spec.color_by, spec.size_by]
    cols = list(dict.fromkeys(name for name in select if name))  # dedupe, keep order
    sql = f"SELECT {', '.join(_ident(n, schema) for n in cols)} FROM {_ident(schema.table, schema)}"

    params: list[Scalar] = []
    clauses = []
    for f in spec.filters:
        col = schema.column(f.field)
        assert col is not None  # validated
        clauses.append(_where(f, col, schema, params))
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    if spec.sort:
        direction = "ASC" if spec.sort.direction == "asc" else "DESC"
        sql += f" ORDER BY {_ident(spec.sort.field, schema)} {direction} NULLS LAST"
    if spec.limit is not None:
        sql += f" LIMIT {int(spec.limit)}"
    return CompiledQuery(sql, params)
