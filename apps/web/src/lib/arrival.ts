/**
 * The arrival: what plays between "Open well" and the correlation section. Everything on screen is a
 * pure function of one number, seconds since the well was opened, so a live user sees it at the
 * browser's pace and the film script steps it frame by frame and gets the same pictures.
 *
 *   0 to 12 s   the camera flies from above India down to the field and ends looking straight down
 *   12 to 36 s  wells, the 5 km ring, and every offset's reports read into incident chips
 *   36 to 52 s  the camera lines up on A to A', the five wells step onto the line, the ground tilts
 *               away and the section opens under it, and the incidents fall into their layers
 */
import { offsetLatLng, type LatLng } from "./geo";

export const T = {
  flyEnd: 12,
  wellsIn: 12,
  ringIn: 13.5,
  insideIn: 15.5,
  readStart: 17,
  readEvery: 0.5,
  readFor: 2.2,
  alignStart: 36,
  alignEnd: 38.5,
  snapEnd: 40,
  tiltEnd: 46,
  chipsFallStart: 41.4,
  chipsFallFor: 1.7,
  flattenEnd: 51,
  end: 52,
} as const;

/** The camera looks through this vertical field of view; the map is given it explicitly. */
export const FOV_DEG = 35;
/** Terrain height of the field, so the ground sits exactly at the camera's centre altitude. */
export const GROUND_M = 100;
/** Range that shows the whole field, looking straight down. */
export const FIELD_RANGE = 27_000;
/** Range for the slice, where A to A' spans most of the frame. */
export const LINE_RANGE = 13_000;

export interface Camera {
  lat: number;
  lng: number;
  range: number;
  tilt: number;
  heading: number;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Progress through [a, b], clamped. */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const smooth = (k: number) => k * k * (3 - 2 * k);
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
export const easeOut = (k: number) => 1 - (1 - k) ** 3;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

type Key = [t: number, lat: number, lng: number, range: number, tilt: number, heading: number];

/**
 * The fly-in, as keyframes: high over the Ganga plain looking east along the Himalaya, along the
 * mountains to the head of the Brahmaputra valley, low over the valley looking north toward the
 * Himalaya, then down onto the field. The frame stays over land the whole way. Range is
 * interpolated in log space so the descent feels even from 900 km down to 27 km.
 */
export function flyKeys(anchor: LatLng): Key[] {
  return [
    [0, 27.4, 85.6, 900_000, 45, 72],
    [4, 27.0, 90.2, 420_000, 52, 68],
    [8, anchor.lat - 0.2, anchor.lng - 0.35, 95_000, 58, 30],
    [10.4, anchor.lat - 0.02, anchor.lng - 0.02, 48_000, 24, 8],
    [T.flyEnd, anchor.lat, anchor.lng, FIELD_RANGE, 0, 0],
  ];
}

/** Catmull-Rom through the keyframes, with flat ends, so the camera never stops mid-flight. */
function spline(keys: Key[], t: number, col: number, map = (v: number) => v, unmap = (v: number) => v): number {
  if (t <= keys[0]![0]) return keys[0]![col]!;
  const last = keys[keys.length - 1]!;
  if (t >= last[0]) return last[col]!;
  let i = 0;
  while (keys[i + 1]![0] < t) i++;
  const k0 = keys[Math.max(0, i - 1)]!;
  const k1 = keys[i]!;
  const k2 = keys[i + 1]!;
  const k3 = keys[Math.min(keys.length - 1, i + 2)]!;
  const p1 = map(k1[col]!);
  const p2 = map(k2[col]!);
  const dt = k2[0] - k1[0];
  // Tangents in value per second, zero at the first and last key.
  const m1 = i === 0 ? 0 : ((p2 - map(k0[col]!)) / (k2[0] - k0[0])) * dt;
  const m2 = i + 2 >= keys.length ? 0 : ((map(k3[col]!) - p1) / (k3[0] - k1[0])) * dt;
  const s = (t - k1[0]) / dt;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  return unmap(h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2);
}

/** Bearing of the A to A' line, degrees clockwise from north. */
export function lineBearing(a: { x: number; y: number }, b: { x: number; y: number }) {
  return ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
}

/**
 * Where the camera is at time t. After the fly-in it stays straight down; for the slice it moves to
 * the middle of A to A' and turns so the line runs left to right across the screen.
 */
export function cameraAt(t: number, anchor: LatLng, line: { a: { x: number; y: number }; b: { x: number; y: number } }): Camera {
  const keys = flyKeys(anchor);
  if (t < T.flyEnd) {
    return {
      lat: spline(keys, t, 1),
      lng: spline(keys, t, 2),
      range: spline(keys, t, 3, Math.log, Math.exp),
      tilt: Math.max(0, spline(keys, t, 4)),
      heading: spline(keys, t, 5),
    };
  }
  const k = easeInOut(seg(t, T.alignStart, T.alignEnd));
  const mid = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
  const c = offsetLatLng(anchor, lerp(0, mid.x, k), lerp(0, mid.y, k));
  return {
    lat: c.lat,
    lng: c.lng,
    range: Math.exp(lerp(Math.log(FIELD_RANGE), Math.log(LINE_RANGE), k)),
    tilt: 0,
    heading: lerp(0, lineBearing(line.a, line.b) - 90, k),
  };
}

/** Metres of ground per CSS pixel when the camera looks straight down. */
export function metresPerPixel(range: number, viewportHeight: number) {
  return (2 * range * Math.tan(((FOV_DEG / 2) * Math.PI) / 180)) / viewportHeight;
}

/**
 * A field point, in metres east and north of the active well, on screen for a straight-down camera
 * centred on `centre` (also field metres) and turned to `heading`.
 */
export function project(x: number, y: number, centre: { x: number; y: number }, range: number, heading: number, W: number, H: number) {
  const mpp = metresPerPixel(range, H);
  const h = (heading * Math.PI) / 180;
  const dx = x - centre.x;
  const dy = y - centre.y;
  return {
    x: W / 2 + (dx * Math.cos(h) - dy * Math.sin(h)) / mpp,
    y: H / 2 - (dx * Math.sin(h) + dy * Math.cos(h)) / mpp,
  };
}

/** The camera centre after the fly-in, in field metres, matching `cameraAt`. */
export function centreAt(t: number, line: { a: { x: number; y: number }; b: { x: number; y: number } }) {
  const k = easeInOut(seg(t, T.alignStart, T.alignEnd));
  return { x: lerp(0, (line.a.x + line.b.x) / 2, k), y: lerp(0, (line.a.y + line.b.y) / 2, k) };
}

/** When well i, in reading order, starts having its reports read. */
export const readStartOf = (i: number) => T.readStart + i * T.readEvery;

/**
 * One well's report reading: the page lifts (0 to 0.25), the scan line crosses it (0.25 to 0.6),
 * the page folds into chips (0.6 to 0.78), and the chips drop onto the well (0.78 to 1).
 */
export function readPhase(t: number, i: number) {
  const k = seg(t, readStartOf(i), readStartOf(i) + T.readFor);
  return {
    k,
    lift: easeOut(seg(k, 0, 0.25)),
    scan: seg(k, 0.25, 0.6),
    fold: easeInOut(seg(k, 0.6, 0.78)),
    drop: easeOut(seg(k, 0.78, 1)),
    /** Reports count once the scan finishes; incidents once the chips land. */
    readDone: k >= 0.6,
    landed: k >= 1,
  };
}

/**
 * How far the section has swung down from the cut line, degrees: 0 edge-on, 90 flat on screen.
 * It leads the ground's tilt, so the lower frame fills as soon as the ground starts to go.
 */
export function faceSwing(t: number) {
  return 72 * easeOut(seg(t, T.snapEnd, T.snapEnd + 3.5)) + 18 * easeInOut(seg(t, T.tiltEnd, T.flattenEnd));
}

/** How much of the ground south of the cut line is gone, 0 to 1, in step with the section's swing. */
export function cutAway(t: number) {
  return seg(t, T.snapEnd + 0.2, T.snapEnd + 1.6);
}

/** Tilt of the ground away from the viewer, degrees: 0 flat on screen, 90 edge-on. */
export function groundTilt(t: number) {
  const opening = 62 * easeInOut(seg(t, T.snapEnd, T.tiltEnd));
  return opening + (90 - 62) * easeInOut(seg(t, T.tiltEnd, T.flattenEnd));
}
