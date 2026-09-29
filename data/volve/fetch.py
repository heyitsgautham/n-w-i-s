"""Runs the hazard reader over Equinor's public Volve daily drilling reports.

Equinor publishes the Volve field data under the Equinor Open Data Licence. Its 1,759 daily drilling
reports are WITSML drillReport XML, and bengsoon/volve_daily_drilling_report on Hugging Face carries
the same reports converted to one Parquet file under CC-BY-4.0. This script downloads that file once
into data/volve/.cache/ (kept out of git), reads every report, checks the hand-checked sample in
checked-sample.json still matches, and writes metrics.json, which the ingestion screen shows.

    uv run python data/volve/fetch.py
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.request import Request, urlopen

from wells_extract.volve import load_reports, summarise

HERE = Path(__file__).resolve().parent
URL = (
    "https://huggingface.co/datasets/bengsoon/volve_daily_drilling_report/resolve/main/data/all-00000-of-00001.parquet"
)
CACHE = HERE / ".cache" / "volve_ddr.parquet"


def download() -> Path:
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        with urlopen(Request(URL, headers={"User-Agent": "wells/0.1"}), timeout=300) as r:
            CACHE.write_bytes(r.read())
    return CACHE


def main() -> None:
    reports = load_reports(download())
    checked = json.loads((HERE / "checked-sample.json").read_text())
    metrics = summarise(reports, checked)
    (HERE / "metrics.json").write_text(json.dumps(metrics, indent=1, ensure_ascii=False) + "\n")
    h = metrics["handCheck"]
    print(
        f"{metrics['reports']} reports, {metrics['activities']} activities, "
        f"{metrics['hazardActivities']} hazard activities {metrics['byKind']}; "
        f"hand check {h['right']} of {h['sample']} right"
    )


if __name__ == "__main__":
    main()
