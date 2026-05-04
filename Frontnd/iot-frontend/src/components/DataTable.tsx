import type { PlantReading } from "../types";
import { formatValue } from "../utils";

type Props = {
  readings: PlantReading[];
};

export function DataTable({ readings }: Props) {
  const rows = [...readings].slice(-12).reverse();

  return (
    <section className="data-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sensor Packets</p>
          <h2>Live Data Stream</h2>
        </div>
        <span className="section-badge">{readings.length} readings</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Gateway</th>
              <th>Temperature</th>
              <th>Light</th>
              <th>Moisture</th>
              <th>Air Humidity</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.id}-${r.receivedAt}`}>
                <td>
                  <span className="gateway-badge">{r.gatewayId}</span>
                </td>
                <td style={{ color: "#ff6b35" }}>{formatValue(r.temperature, "°C")}</td>
                <td style={{ color: "#ffd60a" }}>{formatValue(r.light, "lx")}</td>
                <td style={{ color: "#00d4ff" }}>{formatValue(r.moisture, "%")}</td>
                <td style={{ color: "#bf5af2" }}>{formatValue(r.humidity, "%")}</td>
                <td className="td-timestamp">
                  {new Date(r.receivedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="td-empty">
                  Awaiting sensor data…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
