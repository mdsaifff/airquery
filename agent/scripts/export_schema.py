"""Write the contract JSON Schema to web/src/contracts/contracts.schema.json.

Run after changing agent/spec.py, then regenerate the TS types (make contracts).
"""

import json
import sys
from pathlib import Path

from pydantic.json_schema import models_json_schema

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from spec import EXPORTED  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web/src/contracts/contracts.schema.json"


def build_schema() -> dict:
    _, schema = models_json_schema(list(EXPORTED.items()), title="AirQueryContracts")
    return schema


def render() -> str:
    return json.dumps(build_schema(), indent=2) + "\n"


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(), encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")
