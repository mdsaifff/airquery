import sys
from pathlib import Path

# eval/ imports the agent modules directly (it runs in the agent's environment).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agent"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
