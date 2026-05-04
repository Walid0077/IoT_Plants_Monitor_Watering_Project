import { useEffect, useState } from "react";
import type { PlantReading } from "../types";

const sectionTitles: Record<string, string> = {
  dashboard: "Overview Dashboard",
  data: "Live Data Stream",
  settings: "System Configuration",
};

type Props = {
  latestReading: PlantReading | null;
  section: string;
};

export function Topbar({ latestReading, section }: Props) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <p className="topbar-eyebrow">IoT Monitoring System</p>
        <h1 className="topbar-title">{sectionTitles[section] ?? section}</h1>
      </div>

      <div className="topbar-right">
        {latestReading && (
          <div className="topbar-sync">
            <span className="update-dot" />
            <span>Last sync: {new Date(latestReading.receivedAt).toLocaleTimeString()}</span>
          </div>
        )}
        <div className="topbar-clock">
          <span className="clock-label">System Time</span>
          <span className="clock-value">{time.toLocaleTimeString()}</span>
        </div>
      </div>
    </header>
  );
}
