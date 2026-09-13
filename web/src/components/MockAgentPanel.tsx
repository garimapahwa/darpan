import type { AgentLogEntry } from "../hooks/useFrustrationBridge";

interface MockAgentPanelProps {
  entries: AgentLogEntry[];
}

/**
 * A small fake "coding agent" terminal, purely for demo purposes: shows the
 * instructions Darpan has forwarded (or, on a host with no real VS Code to
 * type into, would have forwarded) so the frustration-bridge feature is
 * visibly demoable on its own, without needing the desktop app or VS Code.
 */
export function MockAgentPanel({ entries }: MockAgentPanelProps) {
  if (entries.length === 0) return null;

  return (
    <div className="agent-panel">
      <div className="agent-panel__header">
        <span className="agent-panel__dot" />
        your coding agent (demo)
      </div>
      <div className="agent-panel__body">
        {entries.map((entry) => (
          <div key={entry.id} className="agent-panel__line">
            <span className="agent-panel__prompt">&gt;</span> {entry.text}
            {entry.mock && <span className="agent-panel__mock-tag">simulated</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
