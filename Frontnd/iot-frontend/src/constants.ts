import type { MetricConfig, PlantParams, PredictionAlgorithm } from "./types";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const HISTORY_LIMIT = 28;
export const POLL_INTERVAL_MS = 3000;
export const PREDICTION_STEPS = 10;

export const predictionAlgorithms: PredictionAlgorithm[] = [
  "least square",
  "ARIMA",
  "Prophet",
  "Decision Tree",
  "random forest",
];

export const DEFAULT_PLANT_PARAMS: PlantParams = {
  sampleFrequency: 10,
  fieldCapacity: 80,
  wiltingPoint: 30,
  targetSoilMoisture: 55,
  soilVolumeLiters: 5,
};

export const metrics: MetricConfig[] = [
  {
    key: "temperature",
    title: "Temperature",
    subtitle: "Canopy Climate",
    unit: "°C",
    range: [8, 38],
    color: "#ff6b35",
    predictionColor: "#ffa07a",
    gradientId: "grad-temp",
  },
  {
    key: "light",
    title: "Light Intensity",
    subtitle: "Leaf Exposure",
    unit: "lx",
    range: [0, 1200],
    color: "#ffd60a",
    predictionColor: "#ffe566",
    gradientId: "grad-light",
  },
  {
    key: "moisture",
    title: "Soil Moisture",
    subtitle: "Root Zone",
    unit: "%",
    range: [0, 100],
    color: "#00d4ff",
    predictionColor: "#7de8ff",
    gradientId: "grad-moisture",
  },
  {
    key: "humidity",
    title: "Air Humidity",
    subtitle: "Greenhouse Air",
    unit: "%",
    range: [0, 100],
    color: "#bf5af2",
    predictionColor: "#d98ef5",
    gradientId: "grad-humidity",
  },
];

export const predictionSourceKeys: Record<string, string[]> = {
  temperature: ["temperature"],
  light: ["light"],
  moisture: ["moisture"],
  humidity: ["humidity"],
};
