import { useEffect, useState } from "react";
import "./App.css";
import type {
  FeedMode,
  NavSection,
  PlantParams,
  PlantReading,
  PredictionAlgorithm,
  Predictions,
  RawSensorReading,
} from "./types";
import {
  DEFAULT_PLANT_PARAMS,
  HISTORY_LIMIT,
  metrics,
  POLL_INTERVAL_MS,
  PREDICTION_STEPS,
} from "./constants";
import {
  appendReading,
  clamp,
  emptyPredictions,
  normalizeHistory,
  normalizePredictions,
  normalizeReading,
} from "./utils";
import { fetchJson, postJson } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { KpiCard } from "./components/KpiCard";
import { TrendChart } from "./components/TrendChart";
import { DataTable } from "./components/DataTable";
import { SettingsPanel } from "./components/SettingsPanel";

function App() {
  const [readings, setReadings] = useState<PlantReading[]>([]);
  const [predictionData, setPredictionData] = useState<Predictions>(() => emptyPredictions());
  const [feedMode, setFeedMode] = useState<FeedMode>("live");
  const [paramsNotice, setParamsNotice] = useState("");
  const [paramsError, setParamsError] = useState("");
  const [isUpdatingParams, setIsUpdatingParams] = useState(false);
  const [params, setParams] = useState<PlantParams>(() => DEFAULT_PLANT_PARAMS);
  const [predictionSteps, setPredictionSteps] = useState(PREDICTION_STEPS);
  const [predictionAlgorithm, setPredictionAlgorithm] = useState<PredictionAlgorithm>("least square");
  const [activeSection, setActiveSection] = useState<NavSection>("dashboard");

  const latestReading = readings.at(-1) ?? null;

  const handleParamChange = (key: keyof PlantParams, value: string) => {
    setParams((cur) => ({ ...cur, [key]: Number(value) }));
  };

  const handleStepsChange = (value: string) => {
    const n = Number(value);
    setPredictionSteps(Number.isFinite(n) ? clamp(Math.round(n), 1, 100) : 1);
  };

  const updateParams = async () => {
    setParamsError("");
    setParamsNotice("");
    setIsUpdatingParams(true);
    try {
      await postJson("/api/update-params", params);
      setParamsNotice("Parameters applied successfully.");
      setTimeout(() => setParamsNotice(""), 4000);
    } catch (error) {
      setParamsError(error instanceof Error ? error.message : "Unable to update parameters.");
    } finally {
      setIsUpdatingParams(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const payload = await fetchJson<unknown>(`/api/sensor-data?limit=${HISTORY_LIMIT}`);
        const history = normalizeHistory(payload);
        if (cancelled || history.length === 0) return;
        setReadings(history);
        setFeedMode("live");
      } catch {
        // wait for live data
      }
    }

    async function fetchPredictions() {
      try {
        const payload = await fetchJson<unknown>(
          `/api/predictions?steps=${predictionSteps}&algorithm=${encodeURIComponent(predictionAlgorithm)}`
        );
        if (!cancelled) setPredictionData(normalizePredictions(payload, predictionSteps));
      } catch {
        if (!cancelled) setPredictionData(emptyPredictions());
      }
    }

    async function pollLatest() {
      try {
        const payload = await fetchJson<RawSensorReading & { message?: string }>("/api/latest");
        if (payload.message) return;
        const next = normalizeReading(payload);
        if (next === null) return;
        if (!cancelled) {
          setReadings((cur) => appendReading(cur, next));
          setFeedMode("live");
        }
      } catch {
        // connection dropped
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
  }, [predictionAlgorithm, predictionSteps]);

  return (
    <div className="app-shell">
      <Sidebar
        active={activeSection}
        onNavigate={setActiveSection}
        feedMode={feedMode}
        readingsCount={readings.length}
      />

      <div className="main-area">
        <Topbar latestReading={latestReading} section={activeSection} />

        <main className="page-content">
          {activeSection === "dashboard" && (
            <>
              <div className="kpi-row">
                {metrics.map((metric) => (
                  <KpiCard key={metric.key} metric={metric} readings={readings} />
                ))}
              </div>
              <div className="chart-grid">
                {metrics.map((metric) => (
                  <TrendChart
                    key={metric.key}
                    metric={metric}
                    predictionSteps={predictionSteps}
                    predictions={predictionData[metric.key]}
                    readings={readings}
                  />
                ))}
              </div>
            </>
          )}

          {activeSection === "data" && <DataTable readings={readings} />}

          {activeSection === "settings" && (
            <SettingsPanel
              params={params}
              predictionSteps={predictionSteps}
              predictionAlgorithm={predictionAlgorithm}
              isUpdating={isUpdatingParams}
              notice={paramsNotice}
              error={paramsError}
              onParamChange={handleParamChange}
              onStepsChange={handleStepsChange}
              onAlgorithmChange={setPredictionAlgorithm}
              onSubmit={updateParams}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
