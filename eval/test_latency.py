from latency import from_frontend, from_log, report


def test_latency_report_combines_log_and_frontend() -> None:
    log = [
        {"timings_ms": {"llm": 600, "validate": 2, "compile": 1, "total": 610}, "cache_hit": False},
        {"timings_ms": {"llm": 900, "validate": 3, "compile": 1, "total": 910}, "cache_hit": False},
        {"timings_ms": {"total": 1}, "cache_hit": True},
        {"timings_ms": {}, "status": "rejected"},  # rate limited / bad request: no stages
    ]
    browser = {"stages": {"voiceToRender": [1200, 1400, 2000], "query": [8, 12]}}
    stages = {**from_frontend([browser]), **from_log(log)}
    assert stages["llm"] == [600, 900]
    assert stages["validate+compile"] == [3, 4]
    text = report(stages, cache_hits=1, n_log=len(log))
    assert "4 logged queries (1 cache hits excluded" in text
    assert "| LLM parse incl. repairs (agent log) | 2 | 600.0 ms | 900.0 ms | – | – |" in text
    assert (
        "| voice -> first changed frame (browser) | 3 | 1400.0 ms | 2000.0 ms | 1500 ms | yes |"
        in text
    )
    assert "| DuckDB query (browser) | 2 | 8.0 ms | 12.0 ms | 50 ms | yes |" in text
    assert "stt" not in text.split("|")[0]  # stages without data are skipped
