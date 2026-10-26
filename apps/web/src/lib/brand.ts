import { envOr } from "./env";

/**
 * The product's name on screen. The public build reads N-W-I-S; a local .env.local can put the
 * submission's own name, tagline and label on screen with NEXT_PUBLIC_BRAND,
 * NEXT_PUBLIC_BRAND_TAGLINE and NEXT_PUBLIC_BRAND_LABEL.
 */
export const BRAND = envOr(process.env.NEXT_PUBLIC_BRAND, "N-W-I-S");
export const TAGLINE = envOr(process.env.NEXT_PUBLIC_BRAND_TAGLINE, "Offset-well memory");
export const LABEL = envOr(process.env.NEXT_PUBLIC_BRAND_LABEL, "Oil India Limited");
