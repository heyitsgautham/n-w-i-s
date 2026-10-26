// Runs the API and the web app together for local work and for recording.
// `pnpm dev` starts both; Ctrl-C stops both. Ports: API 8121, web WEB_PORT or 3000.
import { spawn } from "node:child_process";

const webPort = process.env.WEB_PORT?.trim() || "3000";
const procs = [
  { name: "api", color: 36, cmd: "uv", args: ["run", "uvicorn", "wells_api.main:app", "--port", "8121"] },
  process.env.WELLS_PROD
    ? { name: "web", color: 33, cmd: "node", args: ["scripts/serve-web.mjs"] }
    : { name: "web", color: 33, cmd: "pnpm", args: ["--filter", "web", "exec", "next", "dev", "--port", webPort] },
];

const children = procs.map(({ name, color, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WEB_PORT: webPort } });
  const tag = `\x1b[${color}m${name}\x1b[0m`;
  const pipe = (stream, out) =>
    stream.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) if (line.trim()) out.write(`${tag} ${line}\n`);
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${tag} exited with ${code}`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
