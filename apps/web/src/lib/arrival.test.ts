import { describe, expect, it } from "vitest";
import { cameraAt, cutAway, faceSwing, FIELD_RANGE, groundTilt, lineBearing, metresPerPixel, project, readPhase, T } from "./arrival";
import { offsetLatLng } from "./geo";

const anchor = { lat: 27.285, lng: 95.075 };
const line = { a: { x: -3620, y: 1160 }, b: { x: 4350, y: -640 } };

describe("arrival", () => {
  it("ends the fly-in straight down over the active well at the field range", () => {
    const c = cameraAt(T.flyEnd, anchor, line);
    expect(c).toMatchObject({ lat: anchor.lat, lng: anchor.lng, tilt: 0, heading: 0 });
    expect(c.range).toBeCloseTo(FIELD_RANGE, 6);
    // And the flight never jumps: 1/30 s apart, the camera moves less than 2% of its range.
    for (let t = 0; t < T.flyEnd; t += 1 / 30) {
      const p = cameraAt(t, anchor, line);
      const q = cameraAt(t + 1 / 30, anchor, line);
      expect(Math.abs(Math.log(q.range / p.range))).toBeLessThan(0.05);
      expect(Math.abs(q.tilt - p.tilt)).toBeLessThan(2);
    }
  });

  it("turns the camera so A to A' runs left to right across the screen", () => {
    const c = cameraAt(T.alignEnd, anchor, line);
    const a = project(line.a.x, line.a.y, { x: 365, y: 260 }, c.range, c.heading, 1600, 900);
    const b = project(line.b.x, line.b.y, { x: 365, y: 260 }, c.range, c.heading, 1600, 900);
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.01);
    expect(a.x).toBeLessThan(b.x);
    expect((a.x + b.x) / 2).toBeCloseTo(800, 6);
    expect(lineBearing(line.a, line.b)).toBeCloseTo(102.7, 1);
  });

  it("projects field metres at the camera's scale, east to the right and north up", () => {
    const mpp = metresPerPixel(FIELD_RANGE, 900);
    const east = project(mpp * 100, 0, { x: 0, y: 0 }, FIELD_RANGE, 0, 1600, 900);
    const north = project(0, mpp * 100, { x: 0, y: 0 }, FIELD_RANGE, 0, 1600, 900);
    expect(east.x).toBeCloseTo(900, 6);
    expect(north.y).toBeCloseTo(350, 6);
    expect(offsetLatLng(anchor, 0, 111_320).lat).toBeCloseTo(anchor.lat + 1, 9);
  });

  it("reads each well's reports in order and tilts the ground from flat to edge-on", () => {
    expect(readPhase(T.readStart - 0.1, 0).k).toBe(0);
    expect(readPhase(T.readStart + T.readFor, 0).landed).toBe(true);
    expect(readPhase(T.readStart + T.readFor, 1).landed).toBe(false);
    expect(groundTilt(T.alignEnd)).toBe(0);
    expect(groundTilt(T.flattenEnd)).toBe(90);
  });

  it("swings the section down ahead of the cut, so the lower frame is never left empty", () => {
    expect(faceSwing(T.snapEnd)).toBe(0);
    expect(faceSwing(T.flattenEnd)).toBe(90);
    // Once the ground south of the line is half gone, the section already covers most of the lower frame.
    for (let t = T.snapEnd; t <= T.tiltEnd; t += 1 / 30) {
      if (cutAway(t) >= 0.5) expect(Math.sin((faceSwing(t) * Math.PI) / 180)).toBeGreaterThan(0.6);
      expect(faceSwing(t)).toBeGreaterThanOrEqual(groundTilt(t));
    }
  });
});
