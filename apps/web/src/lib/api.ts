import { envOr } from "./env";

/** Where the browser reaches the API. The server side uses WELLS_API_URL in lib/data.ts. */
export const API = envOr(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8121");
