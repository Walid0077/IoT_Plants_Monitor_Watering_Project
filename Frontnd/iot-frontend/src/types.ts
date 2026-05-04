export type MetricKey = "temperature" | "light" | "moisture" | "humidity";
export type FeedMode = "live" | "demo";
export type PredictionAlgorithm =
  | "least square"
  | "ARIMA"
  | "Prophet"
  | "Decision Tree"
  | "random forest";
export type NavSection = "dashboard" | "data" | "settings";

export type RawSensorReading = Record<string, unknown>;
export type Predictions = Record<MetricKey, number[]>;

export type PlantParams = {
  sampleFrequency: number;
  fieldCapacity: number;
  wiltingPoint: number;
  targetSoilMoisture: number;
  soilVolumeLiters: number;
};

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
  gradientId: string;
};
