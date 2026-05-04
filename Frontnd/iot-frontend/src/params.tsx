export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const HISTORY_LIMIT = 28;
export const POLL_INTERVAL_MS = 3000;
export const PREDICTION_STEPS = 10;

export type MetricKey = "temperature" | "light" | "moisture" | "humidity";
export type FeedMode = "live" | "demo";

export type RawSensorReading = Record<string, unknown>;
export type Predictions = Record<MetricKey, number[]>;

export type PlantReading = {
  id: string;
  gatewayId: string;
  receivedAt: string;
  temperature: number | null;
  light: number | null;
  moisture: number | null;
  humidity: number | null;
};

export type MetricConfig = {
  key: MetricKey;
  title: string;
  subtitle: string;
  unit: string;
  range: [number, number];
  color: string;
  predictionColor: string;
};

export const metrics: MetricConfig[] = [
  {
    key: "temperature",
    title: "Temperature",
    subtitle: "Canopy climate",
    unit: "C",
    range: [8, 38],
    color: "#dc7a27",
    predictionColor: "#f1b46a",
  },
  {
    key: "light",
    title: "Light",
    subtitle: "Leaf exposure",
    unit: "lx",
    range: [0, 1200],
    color: "#9d7c16",
    predictionColor: "#d9b943",
  },
  {
    key: "moisture",
    title: "Moisture",
    subtitle: "Soil water",
    unit: "%",
    range: [0, 100],
    color: "#168263",
    predictionColor: "#62c2a4",
  },
  {
    key: "humidity",
    title: "Air humidity",
    subtitle: "Greenhouse air",
    unit: "%",
    range: [0, 100],
    color: "#247f9e",
    predictionColor: "#74c1d3",
  },
];
