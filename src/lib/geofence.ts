// Optional GPS-based clock-in/out restriction. Disabled by default — only
// takes effect once RESTAURANT_LAT / RESTAURANT_LNG are set in the
// environment, so this doesn't break anything for setups that haven't
// configured it. When configured, clock-in/out requires the employee's
// device to report a location within RESTAURANT_RADIUS_METERS of that point.

const DEFAULT_RADIUS_METERS = 200;

export type RestaurantLocationConfig = {
  lat: number;
  lng: number;
  radiusMeters: number;
};

/** Reads the configured restaurant location from env. Returns null when not configured (feature off). */
export function getRestaurantLocationConfig(): RestaurantLocationConfig | null {
  const lat = Number(process.env.RESTAURANT_LAT);
  const lng = Number(process.env.RESTAURANT_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const radiusRaw = Number(process.env.RESTAURANT_RADIUS_METERS);
  const radiusMeters = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : DEFAULT_RADIUS_METERS;

  return { lat, lng, radiusMeters };
}

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type GeofenceResult = {
  withinRange: boolean;
  distanceMeters: number;
  radiusMeters: number;
};

/**
 * Checks a reported position against the configured restaurant location.
 * Returns null when the feature isn't configured (caller should skip the
 * check entirely in that case).
 */
export function checkWithinRestaurant(lat: number, lng: number): GeofenceResult | null {
  const config = getRestaurantLocationConfig();
  if (!config) return null;

  const distanceMeters = haversineDistanceMeters(lat, lng, config.lat, config.lng);
  return {
    withinRange: distanceMeters <= config.radiusMeters,
    distanceMeters,
    radiusMeters: config.radiusMeters,
  };
}
