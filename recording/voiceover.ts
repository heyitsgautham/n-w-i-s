/** Writes recording/voiceover.md from the storyboard without re-recording: `pnpm voiceover`. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { voiceoverMarkdown } from "./storyboard";

writeFileSync(join(import.meta.dirname, "voiceover.md"), voiceoverMarkdown());
console.log("wrote recording/voiceover.md");
