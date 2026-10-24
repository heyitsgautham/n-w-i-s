import { Check } from "lucide-react";
import { loadField, loadPriorWork, loadStats, loadVolve } from "@/lib/data";
import { BRAND, LABEL } from "@/lib/brand";

const n = (v: number) => v.toLocaleString("en-US");

/** Everything on this screen is in place within a second and a half; the voiceover walks it. */
const appear = (delay: number) => ({ animation: `appear 360ms ease-out ${delay}s both` });

/** How the product answers each ask of the statement, what we read before building it, and what we checked. */
export default function ResearchPage() {
  const field = loadField();
  const stats = loadStats();
  const volve = loadVolve();
  const prior = loadPriorWork();
  const inside = field.wells.filter((w) => w.role === "offset" && Math.hypot(w.x, w.y) <= 5000).length;
  const a = stats.accuracy;

  const asks: [string, string, string][] = [
    [
      "i",
      "Read the old reports with AI, NLP and OCR",
      `${n(stats.documents)} reports parsed, ${stats.ocrPages} scanned pages read by Tesseract, ${a.found} of ${a.truthEvents} incidents found`,
    ],
    ["ii", "Map the offset wells within a radius", `${inside} offsets inside a 5 km ring you set, on Google satellite terrain`],
    ["iii", "A searchable memory of drilling events", "Plain-English questions become filters, and every answer cites its report page"],
    ["iv", "Correlate the wells by depth and formation", "Tops tied across the section, every incident placed by the layer it happened in"],
    ["v", "Predict the risks ahead of the bit", "Each offset incident timed against the bit at the live rate, in Watch and Prepare bands"],
    ["vi", "Real-time alerts and recommendations", "The section re-ties the moment a top is called; the advice comes from the offsets' own remarks"],
    ["vii", "A dashboard for the rig and the office", "The rig console, and a cited pre-spud briefing exported as a PDF"],
  ];

  const sources: [string, string, string][] = [
    [
      "USGS Bulletin 2208-D",
      "Wandrey, 2004",
      "The Upper Assam column, Girujan over Tipam over Barail over Kopili and Sylhet, which our field's layers follow. It also dates India's first oil well to Namdang, 1867.",
    ],
    [
      "SPE-200627-MS, SPE Europec",
      "2020",
      "Deep wells in north-east India: Barail coal and shale go unstable when the mud is too light. KN-117's caving at 9.8 ppg and its fix at 10.4 follow that pattern.",
    ],
    [
      "Acta Geophysica",
      "Rai, Singha and Chatterjee, 2022",
      "Overpressure on the Upper Assam Shelf sits in the Barail and Kopili, so the kicks in our field cluster in the Kopili.",
    ],
    [
      "Equinor Volve field data",
      "Equinor Open Data Licence",
      volve?.handCheck
        ? `${n(volve.reports)} real daily reports from the North Sea. Our hazard rules found ${n(volve.hazardActivities)} hazards, and ${volve.handCheck.right} of ${volve.handCheck.sample} checked by hand were right.`
        : "Real daily reports from the North Sea, not yet read in this checkout.",
    ],
  ];

  const strip: { big: React.ReactNode; label: string; prior?: boolean }[] = [
    {
      // "of" in the text face; spaces in the monospace face read as double gaps.
      big: (
        <>
          {asks.length}
          <span className="mx-2 font-sans text-[26px] font-medium text-ink-muted">of</span>
          {asks.length}
        </>
      ),
      label: "asks in the statement, each answered on screen",
    },
    {
      big: volve ? n(volve.reports) : "0",
      label: volve?.handCheck
        ? `real Volve daily reports read, ${volve.handCheck.right} of ${volve.handCheck.sample} hazards right by hand`
        : "real Volve reports, not read in this checkout",
    },
    { big: n(stats.documents), label: `synthetic daily reports parsed, ${a.found} of ${a.truthEvents} incidents found` },
    { big: String(prior.repos), label: `public repos checked, ${prior.readmes} READMEs read`, prior: true },
    { big: String(sources.length), label: "published sources read" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col px-10 pt-6 pb-6" data-research>
      <header style={appear(0)}>
        <div className="label-caps text-[13px] text-ink-muted">Research dossier · {LABEL}</div>
        <h1 className="mt-1 text-[34px] leading-tight font-semibold text-ink-bright">How we built {BRAND}</h1>
      </header>

      <ol className="mt-4 grid shrink-0 grid-cols-5 border-y border-rule-strong" data-stats>
        {strip.map((s, i) => (
          <li
            key={s.label}
            className={`py-3.5 pr-5 ${i > 0 ? "border-l border-rule pl-5" : ""}`}
            style={appear(0.1 + i * 0.08)}
            data-prior={s.prior || undefined}
          >
            <div className="num text-[34px] leading-none font-semibold text-ink-bright">{s.big}</div>
            <div className="mt-2 text-[16px] leading-snug text-ink">{s.label}</div>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] gap-9">
        <section className="flex min-h-0 flex-col">
          <h2 className="label-caps text-[14px] text-ink-muted" style={appear(0.3)}>
            <span className="num mr-2 text-ink-dim">01</span>What Oil India asked for
          </h2>
          <ol className="mt-2.5 grid min-h-0 flex-1 grid-rows-7 gap-1.5" data-asks>
            {asks.map(([no, ask, how], i) => (
              <li
                key={no}
                className="grid grid-cols-[38px_28px_minmax(0,1fr)] items-center gap-x-2 border-b border-rule last:border-b-0"
                style={appear(0.35 + i * 0.08)}
                data-ask={no}
              >
                <span className="num text-[15px] text-ink-dim">{no}</span>
                <Check className="size-[20px] text-[#4ade80]" strokeWidth={2.6} />
                <div className="min-w-0">
                  <div className="text-[22px] leading-tight font-semibold text-ink-bright">{ask}</div>
                  <div className="mt-0.5 truncate text-[16px] leading-snug text-ink-muted">{how}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex min-h-0 flex-col">
          <h2 className="label-caps text-[14px] text-ink-muted" style={appear(0.4)}>
            <span className="num mr-2 text-ink-dim">02</span>What we read, and the finding we used
          </h2>
          <ul className="mt-2.5 grid min-h-0 flex-1 grid-rows-4 gap-3" data-sources>
            {sources.map(([title, by, took], i) => (
              <li
                key={title}
                className="flex flex-col justify-center rounded-[4px] border border-rule-strong px-5 py-3"
                style={{ ...appear(0.5 + i * 0.1), boxShadow: "inset 3px 0 0 var(--ink-muted)" }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[22px] leading-tight font-semibold text-ink-bright">{title}</span>
                  <span className="shrink-0 text-[15px] text-ink-dim">{by}</span>
                </div>
                <p className="mt-1.5 text-[16.5px] leading-snug text-ink">{took}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
