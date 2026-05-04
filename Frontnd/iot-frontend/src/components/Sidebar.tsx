import type { NavSection } from "../types";

const navItems: Array<{ section: NavSection; label: string; icon: string }> = [
  { section: "dashboard", label: "Dashboard", icon: "⬡" },
  { section: "data", label: "Live Data", icon: "≡" },
  { section: "settings", label: "Settings", icon: "⊙" },
];

type Props = {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  feedMode: "live" | "demo";
  readingsCount: number;
};

export function Sidebar({ active, onNavigate, feedMode, readingsCount }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">P</div>
        <div>
          <span className="brand-name">PlantAI</span>
          <span className="brand-sub">Intelligence Platform</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-label">Navigation</span>
        {navItems.map(({ section, label, icon }) => (
          <button
            key={section}
            className={`nav-item ${active === section ? "active" : ""}`}
            onClick={() => onNavigate(section)}
            type="button"
          >
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className={`sys-status ${feedMode}`}>
          <span className="sys-dot" />
          <div>
            <span className="sys-label">{feedMode === "live" ? "Live Feed" : "Demo Mode"}</span>
            <span className="sys-sub">{readingsCount} data points</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
