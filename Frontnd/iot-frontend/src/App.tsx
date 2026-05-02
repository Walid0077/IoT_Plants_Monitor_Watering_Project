import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
const HISTORY_LIMIT = 28;
const POLL_INTERVAL_MS = 3000;
const PREDICTION_STEPS = 10;

type MetricKey = "temperature" | "light" | "moisture" | "humidity";
type FeedMode = "live" | "demo";

type RawSensorReading = Record<string, unknown>;
type Predictions = Record<MetricKey, number[]>;

type PlantReading = {
  id: string;
  gatewayId: string;
  receivedAt: string;
  temperature: number | null;
  light: number | null;
  moisture: number | null;
  humidity: number | null;
};

type MetricConfig = {
  key: MetricKey;
  title: string;
  subtitle: string;
  unit: string;
  range: [number, number];
  color: string;
  predictionColor: string;
};

const metrics: MetricConfig[] = [
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

const predictionSourceKeys: Record<MetricKey, string> = {
  temperature: "temperature",
  light: "light",
  moisture  :"moisture",
  humidity: "humidity",
};

function emptyPredictions(): Predictions {
  return {
    temperature: [],
    light: [],
    moisture: [],
    humidity: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(source: RawSensorReading, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function asString(source: RawSensorReading, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return null;
}

function normalizeReading(
  source: RawSensorReading,fallbackReceivedAt = new Date().toISOString(),
): PlantReading | null {
  const temperature = asNumber(source, ["temperature"]);
  const light = asNumber(source, ["light"]);
  const moisture = asNumber(source, ["moisture"]);
  const humidity = asNumber(source, ["humidity",]);

  if (temperature === null &&light === null &&moisture === null &&humidity === null) {
    return null;
  }

  const receivedAt =
    asString(source, ["timestamp"]) ?? fallbackReceivedAt;

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

function normalizeHistory(payload: unknown) {
  if (!Array.isArray(payload)) {
    return [];
  }

  const newestFallbackTimestamp = Date.now();

  return payload
    .map((item, index) =>
      normalizeReading(
        item as RawSensorReading,
        new Date(
          newestFallbackTimestamp - index * POLL_INTERVAL_MS,
        ).toISOString(),
      ),
    )
    .filter((item): item is PlantReading => item !== null)
    .sort(
      (a, b) =>
        new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
    )
    .slice(-HISTORY_LIMIT);
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "number" && Number.isFinite(item)) {
        return item;
      }

      if (typeof item === "string") {
        const parsed = Number.parseFloat(item);
        return Number.isFinite(parsed) ? parsed : null;
      }

      return null;
    })
    .filter((item): item is number => item !== null)
    .slice(0, PREDICTION_STEPS);
}

function normalizePredictions(payload: unknown): Predictions {
  if (!isRecord(payload)) {
    return emptyPredictions();
  }

  const source = isRecord(payload.predictions) ? payload.predictions : payload;
  const normalized = emptyPredictions();

  metrics.forEach((metric) => {
    for (const key of predictionSourceKeys[metric.key]) {
      const values = normalizeNumberArray(source[key]);

      if (values.length > 0 || Array.isArray(source[key])) {
        normalized[metric.key] = values;
        break;
      }
    }
  });

  return normalized;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function drift(value: number, min: number, max: number, amount: number) {
  return clamp(value + (Math.random() - 0.45) * amount, min, max);
}

function createDemoReading(previous?: PlantReading, timestamp = Date.now()) {
  const wave = Math.sin(timestamp / 45000);
  const temperature = previous?.temperature ?? 22 + wave * 1.6;
  const light = previous?.light ?? 620 + Math.max(0, wave) * 180;
  const moisture = previous?.moisture ?? 58 - wave * 5;
  const humidity = previous?.humidity ?? 64 + wave * 4;

  return {
    id: `demo-${timestamp}`,
    gatewayId: "demo-greenhouse",
    receivedAt: new Date(timestamp).toISOString(),
    temperature: Number(drift(temperature, 14, 34, 0.55).toFixed(1)),
    light: Math.round(drift(light, 80, 1100, 55)),
    moisture: Number(drift(moisture, 20, 92, 1.3).toFixed(1)),
    humidity: Number(drift(humidity, 28, 94, 1.4).toFixed(1)),
  };
}

function createDemoHistory() {
    let previous: PlantReading ;
    const firstTimestamp = Date.now() - (HISTORY_LIMIT - 1) * POLL_INTERVAL_MS;

    return Array.from({ length: HISTORY_LIMIT }, (_, index) => {
      previous = createDemoReading(
        previous,
        firstTimestamp + index * POLL_INTERVAL_MS,
      );
      return previous;
    });
  }

function sameReading(a: PlantReading, b: PlantReading) {
  return a.id === b.id || a.receivedAt === b.receivedAt;
}

function appendReading(current: PlantReading[], next: PlantReading) {
    const last = current.at(-1);

    if (last && sameReading(last, next)) {
      return current;
    }

    return [...current, next].slice(-HISTORY_LIMIT);
  }

function formatValue(value: number | null, unit: string) {
    if (value === null) {
      return "--";
    }

    const formatted =
      Math.abs(value) >= 100 || Number.isInteger(value)
        ? Math.round(value).toLocaleString()
        : value.toFixed(1);

    return unit === "C" ? `${formatted} deg C` : `${formatted} ${unit}`;
  }

function formatAxisValue(value: number) {
    if (Math.abs(value) >= 1000) {
      return Math.round(value).toLocaleString();
    }

    if (Math.abs(value) >= 100 || Number.isInteger(value)) {
      return String(Math.round(value));
    }

    return value.toFixed(1);
  }

function buildPath(points: Array<{ x: number; y: number }>) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  }

function metricDomain(
    values: Array<number | null>,
    predictions: number[],
    [baseMin, baseMax]: [number, number],
  ) {
    const allValues = [
      ...values.filter((value): value is number => value !== null),
      ...predictions,
    ];

    if (allValues.length === 0) {
      return [baseMin, baseMax] as const;
    }

    const min = Math.min(baseMin, ...allValues);
    const max = Math.max(baseMax, ...allValues);
    const padding = Math.max((max - min) * 0.08, 1);

    return [min - padding, max + padding] as const;
  }

function TrendChart({
    metric,
    predictions,
    readings,
  }: {
    metric: MetricConfig;
    predictions: number[];
    readings: PlantReading[];
  }) {
    const visibleReadings = readings.slice(-(PREDICTION_STEPS + 1));
    const values = visibleReadings.map((reading) => reading[metric.key]);
    const latestValue = values.filter((value) => value !== null).at(-1) ?? null;
    const anchoredPredictionValues =
      latestValue === null
        ? []
        : [latestValue, ...predictions.slice(0, PREDICTION_STEPS)];
    const [minY, maxY] = metricDomain(
      values,
      anchoredPredictionValues,
      metric.range,
    );
    const chartWidth = 520;
    const chartHeight = 276;
    const padLeft = 56;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 46;
    const latestIndex = Math.max(values.length - 1, 0);
    const totalSteps = Math.max(latestIndex + predictions.length, 1);

    const toX = (index: number) =>
      padLeft + (index / totalSteps) * (chartWidth - padLeft - padRight);
    const toY = (value: number) =>
      padTop +
      ((maxY - value) / Math.max(maxY - minY, 1)) *
        (chartHeight - padTop - padBottom);

    const actualPoints = values
      .map((value, index) =>
        value === null ? null : { x: toX(index), y: toY(value) },
      )
      .filter((point): point is { x: number; y: number } => point !== null);

    const predictionPoints = anchoredPredictionValues.map((value, index) => ({
      x: toX(latestIndex + index),
      y: toY(value),
    }));

    const yAxisTicks = Array.from({ length: 5 }, (_item, index) => {
      const ratio = index / 4;
      return maxY - (maxY - minY) * ratio;
    });
    const xAxisLabels = [
      ...values.map((_value, index) => ({
        x: toX(index),
        label: index === latestIndex ? "current" : String(index - latestIndex),
        isCurrent: index === latestIndex,
      })),
      ...predictions.slice(0, PREDICTION_STEPS).map((_value, index) => ({
        x: toX(latestIndex + index + 1),
        label: `+${index + 1}`,
        isCurrent: false,
      })),
    ];

    return (
      <article className="chart-card">
        <div className="chart-heading">
          <div>
            <p className="eyebrow">{metric.subtitle}</p>
            <h2>{metric.title}</h2>
          </div>
          <span className="unit-pill">{metric.unit}</span>
        </div>

        <div className="chart-wrap">
          <svg
            className="chart"
            role="img"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            aria-label={`${metric.title} history and backend prediction for ${PREDICTION_STEPS} steps`}
          >
            {yAxisTicks.map((tick) => {
              const y = toY(tick);

              return (
                <g key={tick}>
                  <path
                    className="grid-line"
                    d={`M ${padLeft} ${y} H ${chartWidth - padRight}`}
                  />
                  <text
                    className="axis-label y-axis-label"
                    x={padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {formatAxisValue(tick)}
                  </text>
                </g>
              );
            })}

            <path
              className="axis-line"
              d={`M ${padLeft} ${padTop} V ${chartHeight - padBottom} H ${
                chartWidth - padRight
              }`}
            />

            {xAxisLabels.map((label, index) => (
              <text
                className={`axis-label x-axis-label ${
                  label.isCurrent ? "current-axis-label" : ""
                }`}
                key={`${label.label}-${index}`}
                x={label.x}
                y={chartHeight - 17}
                textAnchor="middle"
              >
                {label.label}
              </text>
            ))}

            <path
              className="actual-line"
              d={buildPath(actualPoints)}
              style={{ stroke: metric.color }}
            />
            {predictionPoints.length > 1 && (
              <path
                className="prediction-line"
                d={buildPath(predictionPoints)}
                style={{ stroke: metric.predictionColor }}
              />
            )}
            {actualPoints.at(-1) && (
              <circle
                className="latest-dot"
                cx={actualPoints.at(-1)?.x}
                cy={actualPoints.at(-1)?.y}
                r="4.5"
                style={{ fill: metric.color }}
              />
            )}
          </svg>

          <div className="center-value">
            <span>{formatValue(latestValue, metric.unit)}</span>
            <small>latest</small>
          </div>
        </div>

        <div className="chart-footer">
          <span>
            <i className="legend actual" style={{ background: metric.color }} />
            live history
          </span>
          <span>
            <i
              className="legend predicted"
              style={{ background: metric.predictionColor }}
            />
            {predictions.length > 0 ? "backend prediction" : "waiting for API"}
          </span>
        </div>
      </article>
    );
  }

function App() {
    const [readings, setReadings] = useState<PlantReading[]>([]);
    const [predictionData, setPredictionData] = useState<Predictions>(() =>
      emptyPredictions(),
    );
    const [feedMode, setFeedMode] = useState<FeedMode>("live");
    const [dataNotice, setDataNotice] = useState("");
    const [predictionNotice, setPredictionNotice] = useState("");

    const latestReading = readings.at(-1) ?? null;
    const rows = useMemo(() => readings.slice(-8).reverse(), [readings]);
    const notices = [dataNotice, predictionNotice].filter(Boolean);

    useEffect(() => {
      let cancelled = false;

      async function loadHistory() {
        try {
          const payload = await fetchJson<unknown>(
            `/api/sensor-data?limit=${HISTORY_LIMIT}`,
          );
          const history = normalizeHistory(payload);

          if (cancelled || history.length === 0) {
            throw new Error("No usable readings returned");
          }

          setReadings(history);
          setFeedMode("live");
          setDataNotice("");
        } catch (error) {
          console.error(error);

          if (!cancelled) {
            setReadings(createDemoHistory());
            setFeedMode("demo");
            setDataNotice("API unavailable. Showing generated sample readings.");
          }
        }
      }

      async function fetchPredictions() {
        try {
          const payload = await fetchJson<unknown>(
            `/api/predictions?steps=${PREDICTION_STEPS}`,
          );
          const normalized = normalizePredictions(payload);

          if (!cancelled) {
            setPredictionData(normalized);
            setPredictionNotice("");
          }
        } catch (error) {
          console.error(error);

          if (!cancelled) {
            setPredictionData(emptyPredictions());
            setPredictionNotice(
              "Prediction API unavailable. Trend lines will appear when /api/predictions responds.",
            );
          }
        }
      }

    async function pollLatest() {
      try {
        const payload = await fetchJson<RawSensorReading & { message?: string }>(
          "/api/latest",
        );

        if (payload.message) {
          return;
        }

        const next = normalizeReading(payload);

        if (next === null) {
          return;
        }

        if (!cancelled) {
          setReadings((current) => appendReading(current, next));
          setFeedMode("live");
          setDataNotice("");
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setReadings((current) => {
            const seed =
              current.length > 0 ? current : createDemoHistory().slice(0, -1);
            return appendReading(seed, createDemoReading(seed.at(-1)));
          });
          setFeedMode("demo");
          setDataNotice("API unavailable. Showing generated sample readings.");
        }
      }
    }

    loadHistory();
    fetchPredictions();
    const interval = window.setInterval(() => {
      pollLatest();
      fetchPredictions();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Plant IoT monitoring</p>
          <h1>Greenhouse health dashboard</h1>
          <p className="header-copy">
            Rolling sensor history, latest values, and backend predictions for
            the next {PREDICTION_STEPS} incoming samples.
          </p>
        </div>

        <div className={`status-panel ${feedMode}`}>
          <span className="status-dot" />
          <div>
            <strong>{feedMode === "live" ? "Live API" : "Demo feed"}</strong>
            <small>
              {latestReading
                ? `Last update ${new Date(latestReading.receivedAt).toLocaleTimeString()}`
                : "Waiting for readings"}
            </small>
          </div>
        </div>
      </header>

      {notices.map((notice) => (
        <p className="notice" key={notice}>
          {notice}
        </p>
      ))}

      <section className="chart-grid" aria-label="Plant sensor charts">
        {metrics.map((metric) => (
          <TrendChart
            key={metric.key}
            metric={metric}
            predictions={predictionData[metric.key]}
            readings={readings}
          />
        ))}
      </section>

      <section className="data-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recent packets</p>
            <h2>Latest received data</h2>
          </div>
          <span>{readings.length} points in rolling window</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gateway</th>
                <th>Temperature</th>
                <th>Light</th>
                <th>Moisture</th>
                <th>Air humidity</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((reading) => (
                <tr key={`${reading.id}-${reading.receivedAt}`}>
                  <td>{reading.gatewayId}</td>
                  <td>{formatValue(reading.temperature, "C")}</td>
                  <td>{formatValue(reading.light, "lx")}</td>
                  <td>{formatValue(reading.moisture, "%")}</td>
                  <td>{formatValue(reading.humidity, "%")}</td>
                  <td>{new Date(reading.receivedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default App;
