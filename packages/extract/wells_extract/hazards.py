"""Reads a drilling hazard out of free text, the way a drilling engineer would.

Real daily reports mention hazards far more often than they record one. "No losses observed",
"performed kick drill", "kicked off from the pilot hole", "inflow tested to 54 bar differential" and
"greased the pack-off" all contain a hazard word and none of them is a hazard. So each rule names
the drilling context it needs, and a clause that negates or checks for the hazard does not count.

The same rules read the synthetic reports when an incident's type label is unreadable, and the
real Equinor Volve activity comments.
"""

from __future__ import annotations

import re

_F = re.I

#: A number with a volume or rate unit, in the comma-decimal style Norwegian reports often use.
_VOL = r"[\d.,]+(\s*-\s*[\d.,]+)?\s*(m3|m³|bbl|l|ltrs?|liters?|litres?)(?![a-z])(\s*/\s*(hrs?|hours?|h|min))?"
_HOLE_STRING = r"(string|pipe|drill ?string|drill ?pipe|dp|bha|casing|liner|assembly|bit|tubing)"

#: In priority order: a report that says "differentially stuck" is differential sticking, not stuck pipe.
RULES: list[tuple[str, re.Pattern[str]]] = [
    ("differential-sticking", re.compile(r"differential(ly)?[ -]stuck|differential sticking", _F)),
    (
        "stuck-pipe",
        re.compile(
            rf"\b{_HOLE_STRING}\b[^.;]{{0,40}}?\bstuck\b|\bstuck (pipe|string|in (the )?hole|at \d)|\bstuck point\b"
            r"|could not (pick up|pull (the )?(string|pipe) free|move (the )?(string|pipe))"
            r"|unable to (pick up|pull|rotate|move) (the )?(string|pipe)"
            rf"|\bjar(red|ring)\b[^.;]{{0,40}}\b{_HOLE_STRING}\b|\b{_HOLE_STRING}\b[^.;]{{0,40}}\bjar(red|ring)\b",
            _F,
        ),
    ),
    (
        "caving",
        re.compile(
            r"\bcavings?\b|\bcaved\b"
            r"|\bpacked[ -]?off\b|\bpacking[ -]?off\b"
            r"|pack[ -]?off (tendenc|at \d|occurred|observed)|(signs|indication)s? of pack",
            _F,
        ),
    ),
    (
        "losses",
        re.compile(
            rf"\blost (total |approx\.? |~\s?)?{_VOL}|\blost (all |complete |full )?(returns|circulation)\b"
            r"|\b(no|without|reduced|partial) returns\b|\breturns were lost\b"
            r"|\b(not able|unable) to (get|establish|regain) (full |100 ?% )?(returns|circulation)"
            rf"|\blos(s|ses) (of|to|into|at) (\d|approx|~|the formation|formation)|\b{_VOL}\s+loss(es)?\b"
            r"|\b(partial|total|severe|seepage|dynamic|static|mud|downhole|heavy) loss(es)?\b"
            r"|\bloss(es)? rate\b|\blo+sing\b(?! (suction|signal|power|prime|pressure|weight|tension|communication))"
            r"|\b(started to|began( to)?) lo+s(e|ing)\b"
            r"|\b(observed|experienced|had|started|increasing|indication of|recorded) (?!(no|zero|nil|without) )(\w+ )?"
            r"loss(es)?\b(?! (in|of) (communication|signal|weight|wob|tension|power|hook ?load|pressure|string))",
            _F,
        ),
    ),
    (
        "kick",
        re.compile(
            r"\bkick\b(?![ -]?(drill|off|ed off|assembly|valve|sub|line|joint|stand|plates?))|\bpit gain\b|\binflux\b"
            rf"|\bgain(ed)? (of )?{_VOL}"
            r"|\b(observed|noticed|found) (the )?well flowing\b|\bwell (was|is|started) flowing\b"
            r"|\b(hole|well) (didn'?t|did not) stop flowing\b",
            _F,
        ),
    ),
    (
        "tight-hole",
        re.compile(
            r"\btight (spot|spots|hole|area|areas|interval|section)\b|\bhole (was |is |became )?tight\b"
            r"|\b[\d.,]+(\s*-\s*[\d.,]+)?\s*(t|mt|ton|tons|tonnes|klbs?)\s+(max(imum)? )?overpull\b"
            r"|\boverpull (of|up to) \d+",
            _F,
        ),
    ),
    ("bit-balling", re.compile(r"\bbit ball(ed|ing)\b|\bballed (up )?(bit|bha|stabili[sz]er)", _F)),
]

#: Words before a hazard in the same clause that mean it did not happen, or was only checked for.
NEGATION = re.compile(
    r"\b(no|not|nor|without|nil|zero|negative|prevent\w*|avoid\w*|minimi[sz]e\w*|risk of|in case of"
    r"|potential( for)?|focus(ed)? on|check(ed|ing)? (well )?for|monitor(ed|ing)? (the well )?for|observe(d)? for"
    r"|flow ?check\w*)\b",
    _F,
)
#: Words after a hazard that close it as nothing, as in "losses - none" or "losses: 0".
AFTER_NONE = re.compile(r"^\s*([-:=]\s*)?(none|nil|zero)\b|^\s*[-:=]\s*(0|ok)\b", _F)
#: A clause about equipment, tests or fishing tools, where hazard words describe the kit, not the hole.
EQUIPMENT = re.compile(
    r"\b(overpull test|pressure test\w*|leak test\w*|inflow test\w*|function test\w*|test(ed)? (to|ok)"
    r"|spear|overshot|packer|hanger|plug|pin|roller|bearing|valve|drift|wireline|lubricator|prs|fish|bushing"
    r"|cap|riser|connector|running tool|rt|latch\w*|engag\w*|releas\w*|retriev\w*|confirm\w*|caliper|lock"
    r"|tong|hopper|dhsv|slips)\b",
    _F,
)
#: Overpull is only a tight hole when the string is moving in open hole, not when a tool is latched.
HOLE_MOVE = re.compile(
    r"\b(pooh|pull(ed|ing)? out|trip\w*|back ?ream\w*|ream\w*|wiper|hole|drag|from \d+ ?m\w* to \d+)\b", _F
)
#: A gain followed by a static flow check is displacement or a trip-tank reading, not an influx.
FLOW_STATIC = re.compile(
    r"flow ?check\w*[^.;]{0,40}\b(static|stable|no flow|negative)|thermal expansion|balloon\w*|seepage"
    r"|\b(well|hole) (was |is )?(static|stable)|decreasing trend|declining",
    _F,
)
#: A gain explained by swabbing, displacement, a spacer or a leaking test is not formation fluid coming in.
GAIN_EXPLAINED = re.compile(r"\b(swab\w*|displac\w*|spacer|cement|cmt|leak\w*|pressure test\w*|bled)\b", _F)
#: Returns and tension that go missing against seals, annuli or wireline are not mud lost to the formation.
LOSS_EXPLAINED = re.compile(r"\b(annulus|seals?|sealbore|tension|b-annulus)\b|\b(over|at|to) (the )?shakers?\b", _F)
CLAUSE = re.compile(r"(?<=[.;!?])\s+|\n+")


def _clauses(text: str) -> list[str]:
    return [c.strip() for c in CLAUSE.split(text) if c.strip()]


def _counts(kind: str, clause: str, m: re.Match[str], later: str) -> bool:
    # Negation reaches back to the last comma, so "no losses on the trip in, lost 1 m3 cementing" still counts.
    before = clause[: m.start()].rsplit(",", 1)[-1]
    if NEGATION.search(before[-40:]) or AFTER_NONE.match(clause[m.end() :]):
        return False
    if kind == "tight-hole" and "overpull" in m.group().lower() and not HOLE_MOVE.search(clause):
        return False
    if kind == "kick" and not m.group().lower().startswith(("kick", "pit", "influx")):
        if FLOW_STATIC.search(clause[m.end() :] + " " + later) or GAIN_EXPLAINED.search(clause):
            return False
    if kind == "losses" and LOSS_EXPLAINED.search(clause):
        return False
    # Tight spots and stuck kit in a clause about tools or tests are about the tool, not the hole.
    return not (kind in {"stuck-pipe", "tight-hole", "caving"} and EQUIPMENT.search(clause))


def classify(text: str) -> str | None:
    """The first hazard, in priority order, that a clause of the text records as having happened."""
    clauses = _clauses(text)
    for kind, pattern in RULES:
        for i, clause in enumerate(clauses):
            later = " ".join(clauses[i + 1 :])
            if any(_counts(kind, clause, m, later) for m in pattern.finditer(clause)):
                return kind
    return None
