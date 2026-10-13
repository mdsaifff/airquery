---
paths:
  - "data_prep/**"
  - "eval/**"
---

# Data and evaluation rules (data_prep/, eval/)

- Raw downloads go to `data_prep/raw/` (gitignored). Outputs go to
  `web/public/data/`. Scripts are idempotent and skip downloads that already
  exist unless `--force` is passed.
- Be polite to public APIs: one request at a time, a short sleep between
  requests, and a clear User-Agent naming the project.
- Every output Parquet has a matching `DatasetSchema` JSON whose min/max are
  computed from the data, never typed by hand.
- Unit tests run on small checked-in fixtures, never on the network.
- Evaluation scripts write reports to `eval/reports/` with the date and the
  model name in the filename, and never overwrite earlier reports.
- For the arXiv galaxy: store titles, ids, years and categories only; link to
  arXiv instead of republishing abstracts.
