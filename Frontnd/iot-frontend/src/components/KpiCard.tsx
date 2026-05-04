import type { CSSProperties } from "react";
import type { MetricConfig, PlantReading } from "../types";
import { getMetricValue, getTrend, getTrendPercent } from "../utils";

type Props = {
  metric: MetricConfig;
  readings: PlantReading[];
};

export function KpiCard({ metric, readings }: Props) {
  const values = readings.map((r) => getMetricValue(r, metric.key));
  const latestValue = values.filter((v): v is number => v !== null).at(-1) ?? null;
  const trend = getTrend(values);
  const trendPct = getTrendPercent(values);

  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendClass =
    trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : "trend-stable";

  const sparkValues = values.filter((v): v is number => v !== null).slice(-10);
  const sparkMax = Math.max(...sparkValues, metric.range[1]);
  const sparkMin = Math.min(...sparkValues, metric.range[0]);
  const sparkRange = Math.max(sparkMax - sparkMin, 1);
  const SW = 72;
  const SH = 26;
  const sparkPath = sparkValues
    .map((v, i) => {
      const x = (i / Math.max(sparkValues.length - 1, 1)) * SW;
      const y = SH - ((v - sparkMin) / sparkRange) * SH;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div
      className="kpi-card"
      style={{ "--kpi-accent": metric.color } as CSSProperties}
    >
      <div className="kpi-top">
        <div>
          <p className="kpi-subtitle">{metric.subtitle}</p>
          <p className="kpi-name">{metric.title}</p>
        </div>
        <span className="kpi-unit-badge">{metric.unit}</span>
      </div>

      <div className="kpi-value" style={{ color: metric.color }}>
        {latestValue !== null ? (
          <>
            <span className="kpi-number">
              {Math.abs(latestValue) >= 100
                ? Math.round(latestValue)
                : latestValue.toFixed(1)}
            </span>
            <span className="kpi-unit-inline">{metric.unit}</span>
          </>
        ) : (
          <span className="kpi-dash">—</span>
        )}
      </div>

      <div className="kpi-bottom">
        <span className={`kpi-trend ${trendClass}`}>
          {trendIcon} {trendPct}
        </span>
        {sparkValues.length > 1 && (
          <svg viewBox={`0 0 ${SW} ${SH}`} width={SW} height={SH} className="kpi-spark">
            <path
              d={sparkPath}
              fill="none"
              stroke={metric.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.75"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
