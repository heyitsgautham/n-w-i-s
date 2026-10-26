import pytest
from wells_api import main
from wells_api.store import get_store


@pytest.fixture
def broken_store():
    """Every route that reads the pack raises, the way an unreadable pack would."""

    def broken():
        raise RuntimeError("pack unreadable")

    main.app.dependency_overrides[get_store] = broken
    yield
    main.app.dependency_overrides.pop(get_store, None)
