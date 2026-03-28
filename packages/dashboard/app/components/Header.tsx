import { Settings, Pause, Play } from "lucide-react";

interface HeaderProps {
  onOpenSettings?: () => void;
  globalPaused?: boolean;
  onToggleGlobalPause?: () => void;
}

export function Header({ onOpenSettings, globalPaused, onToggleGlobalPause }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <img src="/logo.svg" alt="kb logo" className="header-logo" width={24} height={24} />
        <h1 className="logo">kb</h1>
        <span className="logo-sub">board</span>
      </div>
      <div className="header-actions">
        <button
          className={`btn-icon${globalPaused ? " btn-icon--paused" : ""}`}
          onClick={onToggleGlobalPause}
          title={globalPaused ? "Resume AI engine" : "Pause AI engine"}
        >
          {globalPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button className="btn-icon" onClick={onOpenSettings} title="Settings">
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
