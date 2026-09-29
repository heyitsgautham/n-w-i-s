# Alert logic

An alert is an offset event placed on the active well by formation, then timed against the bit.
The code is in `packages/correlate/src`.

## Placing an event by formation

For an event in an offset, find the formation it happened in from that well's tops.
Measure its vertical distance from the nearer boundary of that formation, top or base.
Place it the same distance from the same boundary in the active well.

An event 135 m below the Barail top stays 135 m below the Barail top, wherever the Barail comes in.
An event 8 m above the base stays near the base even if the formation is thinner in the active well.

## Re-tie on a call

When the mud logger calls a top, the called top moves to its called depth.
Every deeper prognosed top moves by the same vertical amount, so the planned thicknesses below the call hold.
Tops above the call do not move.

For KN-125 the Barail top was prognosed at 2,910 m and called at 2,872 m, so every top and every alert below moves up 38 m.

## Time to hazard

Time to hazard is the hole between the bit and the placed event, divided by the 10-minute average ROP.
It is on-bottom time, with no allowance for connections or trips, and the screen says which rate it used.
It is shown to ten minutes, because anything finer is false precision at a rate that wanders.

| Band | Rule |
|---|---|
| Prepare | 12 h or less |
| Watch | more than 12 h, up to 24 h |
| Monitor | more than 24 h |
| Passed | the bit is already below it |

In the demo, the KN-117 caving goes from 162 m and 13 h 30 m to 124 m and 10 h 20 m at 12 m/h, and from Watch to Prepare.

## Recommendation

The card takes the lessons attached to upcoming Prepare and Watch alerts, nearest first, one line per kind of action.
Each lesson comes out of the report's remarks with the sentence kept as evidence.
Numbers in the instruction come from the live telemetry and the placed depth, for example "Raise mud weight 9.8 → 10.4 ppg before 3,007 m".

## Analogue ranking

Offsets are ranked for one interval at a time by geology, with distance shown but not scored.

| Part | Weight | Halves at |
|---|---|---|
| Structural position, top depth difference | 30% | 35 m |
| Thickness difference | 35% | 20 m |
| Same fault block | 20% | across a fault scores 0 |
| Interbed share difference | 15% | 0.08 |

## Review gate

A parsed event under 0.85 confidence, or with an unreadable depth, cannot raise an alert until a person confirms it.
Rejected events are dropped everywhere.
