"""Runs the N-W-I-S report parser over Equinor's public Volve daily drilling reports.

The Volve data set is published under the Equinor Open Data Licence and is reached through the
Databricks Marketplace after accepting the licence, so this script does not download it. Export the
folder of daily drilling report XML files (WITSML 1.4 drillReport, 1,759 files in the release), then:

    uv run python data/volve/fetch.py --source /path/to/volve/ddr-xml

The script writes data/volve/metrics.json with the counts the README quotes. The XML stays out of
the repository. Until someone runs it, there is no metrics file and no Volve claim anywhere.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from wells_extract.witsml import parse_drill_report

HERE = Path(__file__).resolve().parent


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, type=Path, help="folder of Volve DDR XML files")
    args = ap.parse_args(argv)

    files = sorted(args.source.rglob("*.xml"))
    if not files:
        raise SystemExit(f"no XML files under {args.source}")
    parsed, failed, kinds = 0, [], Counter()
    activities = 0
    for f in files:
        try:
            r = parse_drill_report(f)
        except (ValueError, OSError) as exc:
            failed.append({"file": f.name, "error": str(exc)})
            continue
        parsed += 1
        activities += r["activities"]
        kinds.update(e["kind"] for e in r["events"])
    metrics = {
        "source": "Equinor Volve data set, daily drilling reports (WITSML), Equinor Open Data Licence",
        "files": len(files),
        "parsed": parsed,
        "failed": len(failed),
        "activities": activities,
        "eventsByKind": dict(sorted(kinds.items())),
        "failures": failed[:50],
    }
    (HERE / "metrics.json").write_text(json.dumps(metrics, indent=1) + "\n")
    print(f"parsed {parsed} of {len(files)} reports, {activities} activities, {sum(kinds.values())} hazard events")


if __name__ == "__main__":
    main()
