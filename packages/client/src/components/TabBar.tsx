import { useNavigate, useLocation } from 'react-router';
import { useUIStore } from '@/stores/uiStore';
import { version as APP_VERSION } from '../../package.json';

interface TabBarProps {
  onSettingsOpen: () => void;
  onDevOpen: () => void;
  onConfirmLeave: (destination: string) => void;
  isInActiveGame: boolean;
  isInQueue: boolean;
}

export function TabBar({ onSettingsOpen, onDevOpen, onConfirmLeave, isInActiveGame, isInQueue }: TabBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { devMode } = useUIStore();
  const showDev = devMode || import.meta.env.DEV;

  const handleNavTab = (path: string) => {
    if (isInActiveGame || isInQueue) {
      onConfirmLeave(path);
    } else {
      navigate(path);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div
      data-tabbar
      style={{
        height: 'var(--tabbar-h)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        background: 'linear-gradient(180deg, #1a1d25, #12141a)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 30,
      }}
    >
      {/* Gold top edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(212,168,52,0.4), transparent)',
        }}
      />

      <TabButton
        label="Home"
        icon={<HomeIcon />}
        active={isActive('/')}
        onClick={() => handleNavTab('/')}
        color="#d4a834"
      />
      <TabButton
        label="Ranks"
        icon={<RanksIcon />}
        active={isActive('/leaderboard')}
        onClick={() => handleNavTab('/leaderboard')}
        color="#d4a834"
      />
      <TabButton
        label="Settings"
        icon={<SettingsIcon />}
        active={false}
        onClick={onSettingsOpen}
        color="#d4a834"
      />
      {showDev && (
        <TabButton
          label="Dev"
          icon={<DevIcon />}
          active={false}
          onClick={onDevOpen}
          color="#22c55e"
        />
      )}

      {/* Version label — corner, muted, non-interactive. Bumped in
          packages/client/package.json and injected via vite.config.ts define. */}
      <span
        data-testid="app-version"
        style={{
          position: 'absolute',
          right: 6,
          bottom: 2,
          fontSize: 10,
          lineHeight: 1,
          color: 'var(--color-surface-300)',
          fontFamily: 'var(--font-family-display)',
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        v{APP_VERSION}
      </span>
    </div>
  );
}

function TabButton({ label, icon, active, onClick, color }: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  const strokeColor = active ? color : '#6b7280';
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex flex-col items-center justify-center border-0 bg-transparent"
      style={{
        gap: 'var(--gap-xs)',
        padding: '0 var(--gap-md)',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {active && (
        <div
          style={{
            position: 'absolute',
            top: -1,
            width: 24,
            height: 2,
            borderRadius: 1,
            background: color,
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
      )}
      <div style={{ color: strokeColor, display: 'flex' }}>{icon}</div>
      {active && (
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            fontWeight: 700,
            color: strokeColor,
            letterSpacing: '0.05em',
            fontFamily: 'var(--font-family-display)',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

// --- SVG Icons (18px, stroke-based) ---

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function RanksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 21h8M12 17v4M17 5H7a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function DevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
