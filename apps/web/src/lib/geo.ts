/** Field metres to latitude and longitude, for drawing the fictional field on real terrain. */

const M_PER_DEG_LAT = 111_320;

export interface LatLng {
  lat: number;
  lng: number;
}

/** A point `x` metres east and `y` metres north of the anchor. Fine at field scale, a few km. */
export function offsetLatLng(anchor: LatLng, x: number, y: number): LatLng {
  return {
    lat: anchor.lat + y / M_PER_DEG_LAT,
    lng: anchor.lng + x / (M_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180)),
  };
}
