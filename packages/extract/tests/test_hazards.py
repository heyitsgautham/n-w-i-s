import json
from pathlib import Path

import pytest
from wells_extract.hazards import classify
from wells_extract.volve import summarise

FIELD = json.loads((Path(__file__).resolve().parents[3] / "data" / "demo" / "field.json").read_text())


def test_reads_every_synthetic_incident_description_as_its_true_kind():
    wrong = [(e["kind"], e["narrative"]) for e in FIELD["events"] if classify(e["narrative"]) != e["kind"]]
    assert wrong == []


# Lines in the style of the Volve reports: each names a hazard word and either records the hazard or not.
@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("PIPE STUCK AT 1493M WITHOUT ANY WARNING SIGNS. KEPT FULL CIRCULATION.", "stuck-pipe"),
        ("Observed losses 400 l/ hr static losses.", "losses"),
        ("LOST TOTAL 8 M3 MUD TO FORMATION WHEN ATTEMPTING REGAIN CIRC.", "losses"),
        ("STARTED TO LOOSE FROM 3035M.", "losses"),
        ("BROKE CIRCULATION AT 250 LPM WITH NO LOSSES. INCREASED RATE AND BEGAN LOSING MUD AT 15 M3/HR.", "losses"),
        ("HOLE PACKED OFF AT 2904 M. WORKED PIPE AND ESTABLISHED CIRCULATION.", "caving"),
        ("GAINED 3.5 M3 WHILE MAKING CONNECTION. CLOSED IN WELL.", "kick"),
        ("POOH. Tight spots at 796 m and 775 m, pulled through with 10 -15 MT overpull.", "tight-hole"),
        ("Checked for losses - ok.", None),
        ("No losses observed.", None),
        ("Performed kick drill with crew.", None),
        ("Continued to kick off from F-1 A. Drilled 12 1/4 in hole.", None),
        ("Inflow tested HMV to 32 bar differential pressure for 10 min.", None),
        ("P/U spear assembly, greased pack off, grapple and set in catch.", None),
        ("Retrieved corrosion cap with 15 tons overpull.", None),
        ("GAIN OF 0.3 M3 DETECTED - FLOWCHECKED NEGATIVE.", None),
        ("Gained 0.36 M3/hr for the first half hour due to thermal expansion, then stabilized.", None),
        ("Observed loss of WOB indicating casing parted from hanger.", None),
        ("Held tool box meeting. Focused on potential for stuck pipe.", None),
    ],
)
def test_real_report_language(text, kind):
    assert classify(text) == kind


def test_summarise_counts_reports_and_refuses_stale_hand_checks():
    reports = [
        {
            "docName": "R1",
            "nameWell": "W1",
            "fluid": [{"density": "1.30"}],
            "activity": [{"comments": "Drilled ahead.", "md": "100"}, {"comments": "Lost returns.", "md": "120"}],
        },
        {"docName": "R2", "nameWell": "W2", "fluid": [], "activity": [{"comments": "No losses.", "md": "90"}]},
    ]
    good = {"seed": 1, "entries": [{"report": "R1", "activity": 1, "flagged": "losses", "verdict": "right"}]}
    m = summarise(reports, good)
    assert (m["reports"], m["wells"], m["activities"], m["hazardActivities"]) == (2, 2, 3, 1)
    assert m["byKind"] == {"losses": 1} and m["handCheck"]["right"] == 1
    stale = {"seed": 1, "entries": [{"report": "R2", "activity": 0, "flagged": "losses", "verdict": "right"}]}
    with pytest.raises(ValueError):
        summarise(reports, stale)
