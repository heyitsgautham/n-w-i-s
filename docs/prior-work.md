# Prior work

We checked what other teams had published for this problem before settling what N-W-I-S shows.
The research screen quotes the counts from `data/prior-work.json`.

## Method

On 29 September 2026 we searched GitHub for the problem's own name, its number, its acronyms and "offset well", 100 results per query.
We kept repos whose names matched those terms or drilling.
That gave 92 repos, 84 of them named for this problem.
We fetched each README through the GitHub API, and 60 had one.
We grepped the READMEs for section, formation-top, prognosis and re-tie terms, then read every hit by hand.

## What we found

| Feature | Also shown elsewhere |
|---|---|
| A correlation section with formation tops tied across wells | Yes, in at least three READMEs |
| Events matched by distance below a formation top | Yes, in one README |
| A GIS map with a radius | Yes |
| OCR over reports | Yes, in 16 READMEs |
| Equinor Volve data | Yes, in 5 READMEs |
| The section re-ties itself when the mud logger calls a top off the prognosis, and every alert below it is re-timed at the live rate of penetration with its band changing | Not in any of the 60 |
| A live time to hazard on each offset event | Not in any of the 60 |

So N-W-I-S does not claim to be the only prototype with a correlation section.
It claims the live re-tie and the re-timed alerts, which none of the 60 READMEs describe.

## Limits

The search covers public, indexed repos with a README.
It does not cover private repos, repos under other names, or videos.
