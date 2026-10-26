import pytest
from fastapi.testclient import TestClient
from wells_api import main

client = TestClient(main.app)


def test_known_filters_still_narrow_the_events():
    events = client.get("/events", params={"well": "KN-109", "kind": "losses", "formation": "TPM"}).json()
    assert events and all((e["wellId"], e["kind"], e["formationId"]) == ("KN-109", "losses", "TPM") for e in events)


# Each of these used to answer 200 with an empty list, which reads as "no incidents" rather than "typo".
def test_an_unknown_kind_is_refused_with_the_allowed_kinds():
    res = client.get("/events", params={"kind": "loss"})
    assert res.status_code == 422
    assert "'losses'" in res.json()["detail"][0]["msg"]


@pytest.mark.parametrize(
    ("path", "params", "detail"),
    [
        ("/events", {"well": "KN-999"}, "unknown well KN-999"),
        ("/events", {"formation": "Tipam"}, "unknown formation Tipam"),
        ("/documents", {"well": "KN-999"}, "unknown well KN-999"),
    ],
)
def test_an_unknown_well_or_formation_is_refused(path, params, detail):
    res = client.get(path, params=params)
    assert res.status_code == 422 and res.json() == {"detail": detail}


def test_documents_for_a_known_well_are_unchanged():
    docs = client.get("/documents", params={"well": "KN-117"}).json()
    assert len(docs) == 35 and {d["wellId"] for d in docs} == {"KN-117"}
