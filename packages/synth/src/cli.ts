import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoPack, SEED } from "./index";

/**
 * Writes the demo pack. `field.json` is everything the apps read; `reports.json` is the daily
 * drilling reports, the input to the DDR renderer in packages/synth/ddr.
 */
const seed = Number(process.argv[2] ?? SEED);
const { reports, ...field } = buildDemoPack(seed);
const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../data/demo");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "field.json"), `${JSON.stringify(field)}\n`);
writeFileSync(join(dir, "reports.json"), `${JSON.stringify(reports)}\n`);

const offsets = field.wells.filter((w) => w.role === "offset");
console.log(
  `seed ${seed}: ${field.wells.length} wells, ${field.events.length} events, ${reports.length} daily reports, ${field.replay.ticks.length} replay ticks`,
);
console.log(
  `spud ${offsets
    .map((w) => w.spudDate.slice(0, 4))
    .sort()
    .join(" ")}`,
);
console.log(`wrote ${dir}/field.json and reports.json`);
