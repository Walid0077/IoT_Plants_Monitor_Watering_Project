import type { ReactNode } from "react";
import type { PlantParams, PredictionAlgorithm } from "../types";
import { predictionAlgorithms } from "../constants";

type Props = {
  params: PlantParams;
  predictionSteps: number;
  predictionAlgorithm: PredictionAlgorithm;
  isUpdating: boolean;
  notice: string;
  error: string;
  onParamChange: (key: keyof PlantParams, value: string) => void;
  onStepsChange: (value: string) => void;
  onAlgorithmChange: (value: PredictionAlgorithm) => void;
  onSubmit: () => void;
};

export function SettingsPanel({
  params,
  predictionSteps,
  predictionAlgorithm,
  isUpdating,
  notice,
  error,
  onParamChange,
  onStepsChange,
  onAlgorithmChange,
  onSubmit,
}: Props) {
  return (
    <section className="settings-form">
      <div className="settings-header">
        <div>
          <p className="eyebrow">System Configuration</p>
          <h2>Plant Parameters &amp; Prediction Engine</h2>
        </div>
        <button className="btn-primary" type="button" onClick={onSubmit} disabled={isUpdating}>
          {isUpdating ? (
            <span className="btn-loading">
              <span className="spinner" /> Updating…
            </span>
          ) : (
            "Apply Changes"
          )}
        </button>
      </div>

      {notice && <p className="notice-success">{notice}</p>}
      {error && <p className="notice-error">{error}</p>}

      <div className="settings-section-label">Soil &amp; Watering Parameters</div>
      <div className="settings-grid">
        <Field label="Sample Frequency" hint="seconds">
          <input
            type="number"
            min={1}
            step={1}
            value={params.sampleFrequency}
            onChange={(e) => onParamChange("sampleFrequency", e.target.value)}
          />
        </Field>
        <Field label="Field Capacity" hint="% max moisture">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={params.fieldCapacity}
            onChange={(e) => onParamChange("fieldCapacity", e.target.value)}
          />
        </Field>
        <Field label="Wilting Point" hint="% critical low">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={params.wiltingPoint}
            onChange={(e) => onParamChange("wiltingPoint", e.target.value)}
          />
        </Field>
        <Field label="Target Moisture" hint="% optimal">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={params.targetSoilMoisture}
            onChange={(e) => onParamChange("targetSoilMoisture", e.target.value)}
          />
        </Field>
        <Field label="Soil Volume" hint="liters">
          <input
            type="number"
            min={0}
            step={0.1}
            value={params.soilVolumeLiters}
            onChange={(e) => onParamChange("soilVolumeLiters", e.target.value)}
          />
        </Field>
      </div>

      <div className="settings-section-label">AI Prediction Engine</div>
      <div className="settings-grid">
        <Field label="Prediction Steps" hint="1–100 steps ahead">
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={predictionSteps}
            onChange={(e) => onStepsChange(e.target.value)}
          />
        </Field>
        <Field label="Algorithm" hint="forecasting model">
          <select
            value={predictionAlgorithm}
            onChange={(e) => onAlgorithmChange(e.target.value as PredictionAlgorithm)}
          >
            {predictionAlgorithms.map((alg) => (
              <option key={alg} value={alg}>
                {alg}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <div className="field-label-row">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
