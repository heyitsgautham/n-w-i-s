from wells_extract.witsml import parse_drill_report

# A hand-written fixture in the WITSML 1.4 drillReport shape. Not Volve data.
FIXTURE = """<?xml version="1.0" encoding="UTF-8"?>
<drillReports xmlns="http://www.witsml.org/schemas/1series" version="1.4.1.1">
  <drillReport uid="fixture-1">
    <nameWell>FIXTURE-1</nameWell>
    <nameWellbore>FIXTURE-1 A</nameWellbore>
    <dTimStart>2010-05-01T00:00:00Z</dTimStart>
    <dTimEnd>2010-05-02T00:00:00Z</dTimEnd>
    <fluid><density uom="g/cm3">1.30</density></fluid>
    <activity>
      <dTimStart>2010-05-01T02:00:00Z</dTimStart>
      <md uom="m">2410</md>
      <proprietaryCode>drilling -- drill</proprietaryCode>
      <state>ok</state>
      <comments>Drilled 8 1/2" hole from 2350 m to 2410 m.</comments>
    </activity>
    <activity>
      <dTimStart>2010-05-01T09:30:00Z</dTimStart>
      <md uom="m">2412</md>
      <proprietaryCode>interruption -- lost circulation</proprietaryCode>
      <state>fail</state>
      <comments>Observed losses of 5 m3/hr. Pumped LCM pill.</comments>
    </activity>
  </drillReport>
</drillReports>
"""


def test_reads_activities_and_flags_the_losses(tmp_path):
    path = tmp_path / "fixture.xml"
    path.write_text(FIXTURE)
    r = parse_drill_report(path)
    assert r["well"] == "FIXTURE-1" and r["activities"] == 2
    assert len(r["events"]) == 1
    e = r["events"][0]
    assert (e["kind"], e["md"], e["failedState"]) == ("losses", 2412.0, True)
    assert e["mudWeightPpg"] == 10.85
    assert e["source"] == {"report": "fixture.xml", "activity": 1}
