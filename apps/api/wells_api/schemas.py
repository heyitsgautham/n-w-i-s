"""Response models for the routes with a fixed shape, so /openapi.json documents what they answer.

Routes that pass the pack's own records through, such as /events and /wells/{id}, return those
records as they are and stay typed as dicts.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Verdict = Literal["confirm", "reject"]
#: The incident kinds the parser reads, as packages/correlate names them.
EventKind = Literal["caving", "stuck-pipe", "losses", "tight-hole", "bit-balling", "differential-sticking", "kick"]


class Health(BaseModel):
    ok: bool
    seed: int = Field(description="Generator seed the demo pack was built from")
    wells: int = Field(ge=0)
    events: int = Field(ge=0, description="Incidents the parser read from the reports")
    documents: int = Field(ge=0, description="Daily reports in the pack")


class Decided(BaseModel):
    id: str = Field(description="Event id")
    decision: Verdict


class Reset(BaseModel):
    ok: bool


class BriefingExport(BaseModel):
    id: str = Field(description="Key of the stored PDF, derived from the briefing's content")
    pages: int = Field(ge=1)
    bytes: int = Field(ge=1)
    url: str = Field(description="Where to download the PDF, relative to the API")
