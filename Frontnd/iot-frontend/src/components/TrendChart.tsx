import type { CSSProperties } from "react";
import type { MetricConfig, PlantReading } from "../types";
import { buildPath, formatAxisValue, getMetricValue, metricDomain } from "../utils";

type Props = {
  metric: MetricConfig;
  predictionSteps: number;
  predictions: number[];
  readings: PlantReading[];
};

export function TrendChart({ metric, predictionSteps, predictions, readings }: Props) {
  const visibleReadings = readings.slice(-(predictionSteps + 1));
  const values = visibleReadings.map((r) => getMetricValue(r, metric.key));
  const latestValue = values.filter((v): v is number => v !== null).at(-1) ?? null;
  const anchoredPred =
    latestValue === null ? [] : [latestValue, ...predictions.slice(0, predictionSteps)];

  const [minY, maxY] = metricDomain(values, anchoredPred, metric.range);

  const W = 1040;
  const H = 320;
  const PL = 56;
  const PR = 20;
  const PT = 16;
  const PB = 44;

  const latestIdx = Math.max(values.length - 1, 0);
  const totalSteps = Math.max(latestIdx + predictions.length, 1);

  const toX = (i: number) => PL + (i / totalSteps) * (W - PL - PR);
  const toY = (v: number) =>
    PT + ((maxY - v) / Math.max(maxY - minY, 1)) * (H - PT - PB);

  const actualPts = values
    .map((v, i) => (v === null ? null : { x: toX(i), y: toY(v) }))
    .filter((p): p is { x: number; y: number } => p !== null);

  const predPts = anchoredPred.map((v, i) => ({
    x: toX(latestIdx + i),
    y: toY(v),
  }));

  const yTicks = Array.from({ length: 5 }, (_, i) => maxY - (maxY - minY) * (i / 4));

  const baseY = toY(minY);

  const areaPath =
    actualPts.length > 1
      ? `${buildPath(actualPts)} L ${actualPts.at(-1)!.x} ${baseY} L ${actualPts[0].x} ${baseY} Z`
      : "";

  const predAreaPath =
    predPts.length > 1
      ? `${buildPath(predPts)} L ${predPts.at(-1)!.x} ${baseY} L ${predPts[0].x} ${baseY} Z`
      : "";

  const bandTopPts = anchoredPred.map((v, i) => ({
    x: toX(latestIdx + i),
    y: toY(v * 1.04 + 0.5),
  }));
  const bandBotPts = [...anchoredPred]
    .map((v, i) => ({ x: toX(latestIdx + i), y: toY(v * 0.96 - 0.5) }))
    .reverse();
  const bandPath =
    bandTopPts.length > 1
      ? `${buildPath(bandTopPts)} ${bandBotPts.map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`
      : "";

  const aId = `${metric.gradientId}-a`;
  const pId = `${metric.gradientId}-p`;

  const xLabels = [
    ...values.map((_, i) => ({
      x: toX(i),
      label: i === latestIdx ? "NOW" : String(i - latestIdx),
      isCurrent: i === latestIdx,
    })),
    ...predictions.slice(0, predictionSteps).map((_, i) => ({
      x: toX(latestIdx + i + 1),
      label: `+${i + 1}`,
      isCurrent: false,
    })),
  ];
  const interval = Math.max(1, Math.ceil(xLabels.length / 20));
  const filteredLabels = xLabels.filter(
    (l, i) => l.isCurrent || i === 0 || i === xLabels.length - 1 || i % interval === 0
  );

  return (
    <article
      className="chart-card"
      style={{ "--card-accent": metric.color } as CSSProperties}
    >
      <div className="chart-heading">
        <div>
          <p className="eyebrow">{metric.subtitle}</p>
          <h2 className="chart-title">{metric.title}</h2>
        </div>
        <div className="chart-live-value" style={{ color: metric.color }}>
          <span className="clv-number">
            {latestValue !== null
              ? Math.abs(latestValue) >= 100
                ? Math.round(latestValue)
                : latestValue.toFixed(1)
              : "—"}
          </span>
          <span className="clv-unit">{metric.unit}</span>
        </div>
      </div>

      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.title} chart`}>
          <defs>
            <linearGradient id={aId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={metric.color} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={pId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.predictionColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={metric.predictionColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {yTicks.map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={PL} y1={y} x2={W - PR} y2={y}
                  stroke="rgba(148,163,184,0.07)"
                  strokeWidth="1"
                />
                <text
                  x={PL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="rgba(148,163,184,0.5)"
                  fontSize="10"
                  fontWeight="600"
                >
                  {formatAxisValue(tick)}
                </text>
              </g>
            );
          })}

          {/* Confidence band */}
          {bandPath && (
            <path d={bandPath} fill={metric.predictionColor} opacity="0.07" />
          )}

          {/* Area fills */}
          {areaPath && <path d={areaPath} fill={`url(#${aId})`} />}
          {predAreaPath && <path d={predAreaPath} fill={`url(#${pId})`} />}

          {/* Axes */}
          <path
            d={`M ${PL} ${PT} V ${H - PB} H ${W - PR}`}
            stroke="rgba(148,163,184,0.15)"
            strokeWidth="1"
            fill="none"
          />

          {/* Now divider */}
          {values.length > 0 && (
            <line
              x1={toX(latestIdx)} y1={PT}
              x2={toX(latestIdx)} y2={H - PB}
              stroke="rgba(148,163,184,0.2)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {/* X labels */}
          {filteredLabels.map((l, i) => (
            <text
              key={`xl-${i}`}
              x={l.x}
              y={H - 12}
              textAnchor="middle"
              fill={l.isCurrent ? metric.color : "rgba(148,163,184,0.45)"}
              fontSize={l.isCurrent ? "11" : "9"}
              fontWeight={l.isCurrent ? "800" : "500"}
            >
              {l.label}
            </text>
          ))}

          {/* Actual line — glow layer then solid */}
          {actualPts.length > 1 && (
            <>
              <path
                d={buildPath(actualPts)}
                fill="none"
                stroke={metric.color}
                strokeOpacity="0.25"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildPath(actualPts)}
                fill="none"
                stroke={metric.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Prediction line */}
          {predPts.length > 1 && (
            <path
              d={buildPath(predPts)}
              fill="none"
              stroke={metric.predictionColor}
              strokeWidth="2"
              strokeDasharray="6 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Latest dot with pulse ring */}
          {actualPts.at(-1) && (
            <g>
              <circle cx={actualPts.at(-1)!.x} cy={actualPts.at(-1)!.y} r="6" fill={metric.color} opacity="0.15">
                <animate attributeName="r" values="5;14;5" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.25;0;0.25" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={actualPts.at(-1)!.x}
                cy={actualPts.at(-1)!.y}
                r="4"
                fill={metric.color}
                stroke="rgba(2,8,20,0.9)"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>

      <div className="chart-footer">
        <span className="legend-item">
          <span className="legend-line" style={{ background: metric.color }} />
          Live history
        </span>
        <span className="legend-item">
          <span className="legend-line" style={{ background: metric.predictionColor, opacity: 0.7 }} />
          {predictions.length > 0 ? "AI Prediction" : "Awaiting model"}
        </span>
        <span className="legend-item legend-dim">
          <span className="legend-band" style={{ background: metric.predictionColor }} />
          Confidence band
        </span>
      </div>
    </article>
  );
}
