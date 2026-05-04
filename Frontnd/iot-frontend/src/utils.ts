import type { MetricKey, PlantReading, Predictions, RawSensorReading } from "./types";
import { metrics, HISTORY_LIMIT, POLL_INTERVAL_MS, predictionSourceKeys } from "./constants";

export function emptyPredictions(): Predictions {
  return { temperature: [], light: [], moisture: [], humidity: [] };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asNumber(source: RawSensorReading, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function asString(source: RawSensorReading, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function normalizeReading(
  source: RawSensorReading,
  fallbackReceivedAt = new Date().toISOString()
): PlantReading | null {
  const temperature = asNumber(source, ["temperature"]);
  const light = asNumber(source, ["light"]);
  const moisture = asNumber(source, ["moisture"]);
  const humidity = asNumber(source, ["humidity"]);

  if (temperature === null && light === null && moisture === null && humidity === null) {
    return null;
  }

  const receivedAt = asString(source, ["timestamp"]) ?? fallbackReceivedAt;

  return {
    id: asString(source, ["id", "_id"]) ?? receivedAt,
    gatewayId: asString(source, ["gateway_id", "gatewayId"]) ?? "gateway",
    receivedAt,
    temperature,
    light,
    moisture,
    humidity,
  };
}

export function normalizeHistory(payload: unknown) {
  if (!Array.isArray(payload)) return [];
  const newestFallbackTimestamp = Date.now();
  return payload
    .map((item, index) =>
      normalizeReading(
        item as RawSensorReading,
        new Date(newestFallbackTimestamp - index * POLL_INTERVAL_MS).toISOString()
      )
    )
    .filter((item): item is PlantReading => item !== null)
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())
    .slice(-HISTORY_LIMIT);
}

export function normalizeNumberArray(value: unknown, predictionSteps: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "number" && Number.isFinite(item)) return item;
      if (typeof item === "string") {
        const parsed = Number.parseFloat(item);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((item): item is number => item !== null)
    .slice(0, predictionSteps);
}

export function normalizePredictions(payload: unknown, predictionSteps: number): Predictions {
  const source =
    isRecord(payload) && isRecord(payload.predictions) ? payload.predictions : payload;
  if (!isRecord(source)) return emptyPredictions();

  const normalized = emptyPredictions();
  metrics.forEach((metric) => {
    for (const key of predictionSourceKeys[metric.key]) {
      const values = normalizeNumberArray(source[key], predictionSteps);
      if (values.length > 0 || Array.isArray(source[key])) {
        normalized[metric.key] = values;
        break;
      }
    }
  });
  return normalized;
}

export function sameReading(a: PlantReading, b: PlantReading) {
  return a.id === b.id || a.receivedAt === b.receivedAt;
}

export function appendReading(current: PlantReading[], next: PlantReading): PlantReading[] {
  const last = current.at(-1);
  if (last && sameReading(last, next)) return current;
  return [...current, next].slice(-HISTORY_LIMIT);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatValue(value: number | null, unit: string) {
  if (value === null) return "—";
  const formatted =
    Math.abs(value) >= 100 || Number.isInteger(value)
      ? Math.round(value).toLocaleString()
      : value.toFixed(1);
  return unit === "°C" ? `${formatted}°C` : `${formatted} ${unit}`;
}

export function formatAxisValue(value: number) {
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 100 || Number.isInteger(value)) return String(Math.round(value));
  return value.toFixed(1);
}

export function buildPath(points: Array<{ x: number; y: number }>) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function metricDomain(
  values: Array<number | null>,
  predictions: number[],
  [baseMin, baseMax]: [number, number]
) {
  const all = [
    ...values.filter((v): v is number => v !== null),
    ...predictions,
  ];
  if (all.length === 0) return [baseMin, baseMax] as const;
  const min = Math.min(baseMin, ...all);
  const max = Math.max(baseMax, ...all);
  const padding = Math.max((max - min) * 0.08, 1);
  return [min - padding, max + padding] as const;
}

export function getTrend(values: Array<number | null>): "up" | "down" | "stable" {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return "stable";
  const diff = nums[nums.length - 1] - nums[nums.length - 2];
  if (Math.abs(diff) < 0.5) return "stable";
  return diff > 0 ? "up" : "down";
}

export function getTrendPercent(values: Array<number | null>): string {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return "—";
  const last = nums[nums.length - 1];
  const prev = nums[nums.length - 2];
  if (prev === 0) return "—";
  const pct = ((last - prev) / Math.abs(prev)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function getMetricValue(reading: PlantReading, key: MetricKey): number | null {
  return reading[key];
}
