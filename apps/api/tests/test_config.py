from pathlib import Path

import pytest
from wells_api.config import DEFAULT_DATA_DIR, SettingsError, load


def test_defaults_when_nothing_is_set():
    settings = load({})
    assert settings.data_dir == DEFAULT_DATA_DIR and (DEFAULT_DATA_DIR / "field.json").exists()
    assert settings.log_level == "INFO"


@pytest.mark.parametrize("value", ["", "   "])
def test_an_empty_variable_counts_as_unset(value):
    # `.env.example` lists WELLS_DATA_DIR= with no value. Path("") is the working directory, not the pack.
    settings = load({"WELLS_DATA_DIR": value, "WELLS_LOG_LEVEL": value})
    assert settings.data_dir == DEFAULT_DATA_DIR and settings.log_level == "INFO"


def test_set_values_are_read_and_the_level_is_case_insensitive(tmp_path):
    settings = load({"WELLS_DATA_DIR": f" {tmp_path} ", "WELLS_LOG_LEVEL": "debug"})
    assert settings.data_dir == Path(tmp_path) and settings.log_level == "DEBUG"


def test_an_unknown_level_names_the_variable():
    with pytest.raises(SettingsError, match="WELLS_LOG_LEVEL"):
        load({"WELLS_LOG_LEVEL": "verbose"})
