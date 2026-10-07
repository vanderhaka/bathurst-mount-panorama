export interface SolarLocation { latitude: number; longitude: number }
export interface SolarPosition { elevationDeg: number; azimuthDeg: number }

/** The centreline origin in mount-panorama.json; X east, Z south. */
export const BATHURST_LOCATION: SolarLocation = { latitude: -33.450486, longitude: 149.553627 };
export const RACE_YEAR = 2026;
export const AEDT_OFFSET_HOURS = 11;

export function raceDay(year: number): string {
  const firstSunday = 1 + (7 - new Date(Date.UTC(year, 9, 1)).getUTCDay()) % 7;
  return `${year}-10-${String(firstSunday + 7).padStart(2, '0')}`;
}

/**
 * NOAA's fractional-year solar position model, without atmospheric refraction.
 * Date and clock are explicitly local: browser timezone cannot alter the scene.
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */
export function solarPosition(location: SolarLocation, date: string, hours: number, utcOffsetHours: number): SolarPosition {
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || !Number.isFinite(hours) || hours < 0 || hours > 24) {
    throw new RangeError('Invalid solar date or clock');
  }
  const year = day.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - yearStart) / 86400000;
  const dayOfYear = (day.getTime() - yearStart) / 86400000 + 1;
  const gamma = 2 * Math.PI / daysInYear * (dayOfYear - 1 + (hours - 12) / 24);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const solarMinutes = hours * 60 + equationOfTime + 4 * location.longitude - 60 * utcOffsetHours;
  const hourAngle = (solarMinutes / 4 - 180) * Math.PI / 180;
  const latitude = location.latitude * Math.PI / 180;
  const cosineZenith = Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, cosineZenith))) * 180 / Math.PI;
  const azimuth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude)
    - Math.tan(declination) * Math.cos(latitude)) * 180 / Math.PI;
  return { elevationDeg, azimuthDeg: (azimuth + 180 + 360) % 360 };
}
