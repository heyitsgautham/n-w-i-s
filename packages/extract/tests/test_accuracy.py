from wells_extract.run import accuracy, histogram


def _event(id_: str, doc: str, md: float | None, kind: str = "losses", mw: float = 9.8, npt: float = 4.0) -> dict:
    return {"id": id_, "source": {"docId": doc}, "md": md, "kind": kind, "mudWeightPpg": mw, "nptHours": npt}


def test_one_parsed_event_cannot_stand_for_two_planted_ones():
    # A report with two incidents where the parser read only the second used to count both as found.
    truth = [_event("T1", "D1", 1200.0), _event("T2", "D1", 1450.0)]
    parsed = [_event("P2", "D1", 1450.0)]
    a = accuracy(parsed, truth, {"D1": True})
    assert (a["found"], a["depthExact"]) == (1, 1)
    assert a["missed"] == [{"id": "T1", "docId": "D1", "scanned": True}]


def test_each_planted_event_takes_the_parsed_event_nearest_in_depth():
    truth = [_event("T1", "D1", 1200.0, kind="kick"), _event("T2", "D1", 1450.0)]
    parsed = [_event("P2", "D1", 1450.0), _event("P1", "D1", 1200.0, kind="kick")]
    a = accuracy(parsed, truth, {})
    assert (a["found"], a["kindRight"], a["depthExact"], a["missed"]) == (2, 2, 2, [])


def test_fields_are_scored_over_found_events_and_an_unread_depth_still_pairs():
    truth = [_event("T1", "D1", 1200.0, mw=10.2), _event("T2", "D2", 900.0)]
    parsed = [_event("P1", "D1", None, mw=10.2), _event("X", "D3", 900.0)]
    a = accuracy(parsed, truth, {"D2": False})
    assert (a["found"], a["depthExact"], a["mudWeightExact"]) == (1, 0, 1)
    assert a["missed"] == [{"id": "T2", "docId": "D2", "scanned": False}]
    assert (a["truthEvents"], a["extractedEvents"]) == (2, 2)


def test_histogram_bins_from_half_to_one_and_counts_what_falls_below():
    bins = histogram([0.3, 0.5, 0.97, 1.0])
    assert bins[0] == {"from": 0.0, "to": 0.5, "count": 1}
    assert bins[1] == {"from": 0.5, "to": 0.55, "count": 1}
    assert bins[-1] == {"from": 0.95, "to": 1.0, "count": 2}
    assert sum(b["count"] for b in bins) == 4
