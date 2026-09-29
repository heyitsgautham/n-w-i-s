// Serves the production build of apps/web through Next's programmatic API.
// Same output as `next start`; used by `pnpm start` and for recording the video.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../apps/web/", import.meta.url));
const next = createRequire(new URL("../apps/web/package.json", import.meta.url))("next");
const port = Number(process.env.WEB_PORT ?? 3000);

const app = next({ dev: false, dir });
await app.prepare();
const handle = app.getRequestHandler();
createServer((req, res) => handle(req, res)).listen(port, () => console.log(`web ready on http://localhost:${port}`));
