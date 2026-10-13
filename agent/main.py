"""FastAPI app for the AirQuery agent."""

from fastapi import FastAPI

app = FastAPI(title="AirQuery agent")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}
