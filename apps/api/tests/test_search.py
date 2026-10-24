"""The search module on its own: how a question becomes filters, and how matches are ranked."""

from wells_api.search import formation_at, parse_query, search

FORMATIONS = [
    {"id": "TPM", "name": "Tipam Sandstone", "short": "Tipam"},
    {"id": "BCS", "name": "Barail Coal-Shale", "short": "Barail Coal"},
    {"id": "BMS", "name": "Barail Main Sand", "short": "Barail Sand"},
]

TOPS = [
    {"formationId": "BCS", "md": 2900},
    {"formationId": "TPM", "md": 1400},
    {"formationId": "BMS", "md": 3500},
]


def test_differential_sticking_is_not_also_read_as_stuck_pipe():
    q = parse_query("differential sticking in Barail", FORMATIONS)
    assert q.kinds == ["differential-sticking"]
    assert q.terms == []


def test_gas_influx_is_one_kick_phrase_with_no_leftover_term():
    q = parse_query("gas influx since 2010", FORMATIONS)
    assert q.kinds == ["kick"]
    assert q.year_from == 2010
    assert q.terms == []


def test_kinds_keep_their_declared_order_whatever_the_phrase_length():
    q = parse_query("kicks and lost circulation", FORMATIONS)
    assert q.kinds == ["losses", "kick"]


def test_year_bounds_and_radius_become_filters():
    q = parse_query("tight hole within 2.5 km after 2012 before 2020", FORMATIONS)
    assert q.filters() == [
        {"key": "kind", "value": "tight-hole"},
        {"key": "radius", "value": 2.5},
        {"key": "yearFrom", "value": 2013},
        {"key": "yearTo", "value": 2019},
    ]


def test_longest_formation_name_wins_and_bare_barail_means_both_members():
    assert parse_query("losses in barail main sand", FORMATIONS).formations == ["BMS"]
    assert parse_query("losses in barail", FORMATIONS).formations == ["BCS", "BMS"]


def test_formation_at_reads_unsorted_tops():
    assert formation_at(TOPS, 1000) is None
    assert formation_at(TOPS, 1400) == "TPM"
    assert formation_at(TOPS, 3200) == "BCS"
    assert formation_at(TOPS, 4000) == "BMS"


def _event(eid, well, kind, md, date, text):
    return {
        "id": eid,
        "wellId": well,
        "kind": kind,
        "md": md,
        "date": date,
        "title": text,
        "narrative": "",
        "action": "",
        "remarks": "",
    }


WELLS = {
    "A": {"id": "A", "x": 0, "y": 0, "tops": TOPS},
    "B": {"id": "B", "x": 3000, "y": 4000, "tops": TOPS},
}


def test_search_filters_by_distance_and_skips_rejected_and_undepthed_events():
    events = [
        _event("near", "A", "losses", 3000, "2016-01-01", "partial losses"),
        _event("far", "B", "losses", 3000, "2016-01-01", "partial losses"),
        {**_event("rejected", "A", "losses", 3000, "2016-01-01", "losses"), "rejected": True},
        _event("no-depth", "A", "losses", None, "2016-01-01", "losses"),
    ]
    rows = search(parse_query("losses within 4 km", FORMATIONS), events, WELLS, "A")
    assert [r["id"] for r in rows] == ["near"]
    assert rows[0]["formationId"] == "BCS" and rows[0]["distanceKm"] == 0.0


def test_free_text_ranks_by_term_and_falls_back_to_newest_first():
    events = [
        _event("old-mud", "A", "losses", 3000, "2010-01-01", "mud mud cured with lcm"),
        _event("new-plain", "A", "losses", 3000, "2018-01-01", "returns dropped"),
        _event("mid-mud", "A", "losses", 3000, "2014-01-01", "mud weight cut"),
    ]
    ranked = search(parse_query("losses mud", FORMATIONS), events, WELLS, "A")
    assert [r["id"] for r in ranked] == ["old-mud", "mid-mud", "new-plain"]
    assert ranked[0]["score"] > ranked[1]["score"] > 0 == ranked[2]["score"]

    by_date = search(parse_query("losses", FORMATIONS), events, WELLS, "A")
    assert [r["id"] for r in by_date] == ["new-plain", "mid-mud", "old-mud"]
