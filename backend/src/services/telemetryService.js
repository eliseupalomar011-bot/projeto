const config = require("../config");
const { getDb } = require("../database/db");
const { completeFreight, failFreight, listFreights } = require("./freightService");

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function normalizeTelemetry(raw = {}) {
  const speedRaw = firstNumber(
    getPath(raw, "truck.speed"),
    getPath(raw, "truck.speedKmh"),
    getPath(raw, "truck.speedKph"),
    raw.speed,
    raw.speedKmh,
    raw.speedKph
  );
  const speedKmh = speedRaw == null ? null : Math.abs(speedRaw) <= 80 ? Math.abs(speedRaw) * 3.6 : Math.abs(speedRaw);

  const lat = firstNumber(
    getPath(raw, "truck.position.latitude"),
    getPath(raw, "truck.placement.y"),
    getPath(raw, "truck.position.z"),
    getPath(raw, "navigation.position.lat"),
    raw.lat
  );
  const lng = firstNumber(
    getPath(raw, "truck.position.longitude"),
    getPath(raw, "truck.placement.x"),
    getPath(raw, "truck.position.x"),
    getPath(raw, "navigation.position.lng"),
    raw.lng
  );
  const distanceMeters = firstNumber(
    getPath(raw, "navigation.estimatedDistance"),
    getPath(raw, "navigation.distance"),
    getPath(raw, "job.remainingDistance"),
    raw.distance,
    raw.distanceMeters
  );

  const trailerAttachedValue =
    getPath(raw, "trailer.attached") ??
    getPath(raw, "job.trailerAttached") ??
    raw.trailerAttached;
  const trailerAttached = trailerAttachedValue == null ? null : Boolean(trailerAttachedValue);
  const delivered = Boolean(
    getPath(raw, "job.delivered") ||
    getPath(raw, "delivery.delivered") ||
    raw.delivered
  );

  return { speedKmh, lat, lng, distanceMeters, trailerAttached, delivered };
}

function distanceBetweenMeters(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((value) => !Number.isFinite(Number(value)))) return null;
  const looksLikeGeo = [aLat, bLat].every((value) => Math.abs(Number(value)) <= 90) &&
    [aLng, bLng].every((value) => Math.abs(Number(value)) <= 180);
  if (!looksLikeGeo) {
    const dx = Number(aLng) - Number(bLng);
    const dy = Number(aLat) - Number(bLat);
    return Math.sqrt(dx * dx + dy * dy);
  }
  const earth = 6371000;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function ingestTelemetry(userId, rawPayload) {
  const normalized = normalizeTelemetry(rawPayload);
  const activeFreight = (await listFreights({ userId, role: "user" })).find((item) => item.status === "ativo");
  const db = await getDb();

  let computedDistance = normalized.distanceMeters;
  if (activeFreight?.destinationLat != null && activeFreight?.destinationLng != null && normalized.lat != null && normalized.lng != null) {
    computedDistance = distanceBetweenMeters(normalized.lat, normalized.lng, activeFreight.destinationLat, activeFreight.destinationLng);
  }

  await db.run(
    `INSERT INTO telemetry_events (user_id, freight_id, speed_kmh, distance_meters, trailer_attached, raw_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    userId,
    activeFreight?.id || null,
    normalized.speedKmh,
    computedDistance,
    normalized.trailerAttached == null ? null : normalized.trailerAttached ? 1 : 0,
    JSON.stringify(rawPayload)
  );

  let freightUpdate = null;
  const flags = [];

  if (activeFreight) {
    if (normalized.speedKmh != null && normalized.speedKmh > config.maxSpeedKmh) {
      flags.push({ type: "speed.warning", message: `Velocidade acima do limite: ${Math.round(normalized.speedKmh)} km/h.` });
    }

    if (normalized.speedKmh != null && normalized.speedKmh > config.failSpeedKmh) {
      freightUpdate = await failFreight(userId, activeFreight.id, "Velocidade absurda detectada", normalized);
    } else if (normalized.trailerAttached === false) {
      freightUpdate = await failFreight(userId, activeFreight.id, "Trailer desconectado", normalized);
    } else if (normalized.delivered || (computedDistance != null && computedDistance < config.deliveryDistanceMeters)) {
      freightUpdate = await completeFreight(userId, activeFreight.id, { ...normalized, distanceMeters: computedDistance });
    }
  }

  return {
    normalized: { ...normalized, distanceMeters: computedDistance },
    activeFreightId: activeFreight?.id || null,
    flags,
    freightUpdate
  };
}

module.exports = { ingestTelemetry, normalizeTelemetry };
