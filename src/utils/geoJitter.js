// ============================================================
// utils/geoJitter.js
//
// Barangays only ever get ONE centroid coordinate (from the "Add
// Health Center" form's Map Center fields), but a barangay can now
// have several health centers. Rather than stacking every facility's
// heatmap marker on the exact same point, this derives a small,
// stable offset per health_center_id so siblings in the same
// barangay spread out visibly on the map — same input always gives
// the same offset, so markers don't jump around between snapshots.
// ============================================================

// Simple deterministic string hash -> [0, 1)
function hashUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Offsets small enough to stay inside the barangay's placeholder
// boundary square (±0.003 deg) but large enough to visibly separate
// two markers on the map at city zoom levels.
const JITTER_RADIUS_DEG = 0.0018;

export function jitterCoordinates([lng, lat], seed) {
  const angle = hashUnit(seed) * 2 * Math.PI;
  const radius = hashUnit(seed + ":r") * JITTER_RADIUS_DEG;
  return [lng + Math.cos(angle) * radius, lat + Math.sin(angle) * radius];
}

// Picks the best available [lng, lat] for one health center's heatmap
// marker: its own real geocoded coordinate when set; the barangay's
// centroid otherwise. Either way, if it collides exactly with a
// sibling facility in the same barangay (e.g. two facilities that both
// fell back to the same barangay-level geocode), it gets jittered so
// the two pins don't render as one.
export function resolveHealthCenterCoordinates(barangay, healthCenter) {
  const siblings = barangay.health_centers || [];
  const own = healthCenter.coordinates?.coordinates;
  const base = own || barangay.coordinates.coordinates;

  const collides = siblings.some((hc) => {
    if (hc.health_center_id === healthCenter.health_center_id) return false;
    const otherCoord = hc.coordinates?.coordinates || (!own ? barangay.coordinates.coordinates : null);
    return otherCoord && otherCoord[0] === base[0] && otherCoord[1] === base[1];
  });

  if (collides) return jitterCoordinates(base, healthCenter.health_center_id);
  return base;
}
