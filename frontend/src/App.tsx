import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  GitBranch,
  Layers,
  LayoutDashboard,
  Network,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import "./App.css";
import { FundFlowGraph } from "./components/FundFlowGraph";
import { API_BASE_URL } from "./config";
import type { AssessRequest, Assessment, TransferItem } from "./types";
import { formatCurrency, formatSeconds } from "./utils/format";

const demoRequest: AssessRequest = {
  transaction: {
    step: 10,
    amount: 95000,
    oldbalanceOrg: 95000,
    newbalanceOrig: 0,
    oldbalanceDest: 0,
    newbalanceDest: 95000,
    type: "TRANSFER",
  },
  transfers: [
    { from_account: "A", to_account: "B", amount: 95000, seconds: 10 },
    { from_account: "B", to_account: "C", amount: 94000, seconds: 25 },
    { from_account: "C", to_account: "D", amount: 93000, seconds: 45 },
    { from_account: "D", to_account: "E", amount: 92000, seconds: 90 },
  ],
};

const sampleSimulationAssessment: Assessment = {
  ml_fraud_probability: 0.845,
  suspicious_chains_found: 1,
  fund_flow_risk_detected: true,
  decision: "REVIEW",
  fund_flow_analysis: {
    transfers_analyzed: 4,
    suspicious_chains: [
      {
        accounts: ["A", "B", "C", "D"],
        transfer_count: 3,
        transfers: [
          { from: "A", to: "B", amount: 95000, seconds: 10 },
          { from: "B", to: "C", amount: 94000, seconds: 25 },
          { from: "C", to: "D", amount: 93000, seconds: 45 },
        ],
      },
    ],
  },
};

function App() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSimulated, setIsSimulated] = useState(false);
  const [activeNav, setActiveNav] = useState<"overview" | "fund-flow" | "risk-assessment">("overview");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  function scrollToSection(sectionId: string, navKey: "overview" | "fund-flow" | "risk-assessment") {
    setActiveNav(navKey);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function runSimulation() {
    setError("");
    setLoading(true);
    setTimeout(() => {
      setAssessment(sampleSimulationAssessment);
      setIsSimulated(true);
      setLoading(false);
    }, 400);
  }

  async function runAssessment() {
    setLoading(true);
    setError("");
    setIsSimulated(false);

    try {
      const response = await fetch(`${API_BASE_URL}/combined-assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const msg = `API returned HTTP ${response.status}: ${errorText || response.statusText}`;
        console.error("HopStop API error:", msg);
        throw new Error(msg);
      }

      const data: Assessment = await response.json();
      console.log("HopStop assessment received:", data);
      setAssessment(data);
    } catch (err: unknown) {
      const diag = err instanceof Error ? err.message : String(err);
      console.error("HopStop API connection failure diagnostic:", err);
      setError(
        `Cannot reach HopStop API at ${API_BASE_URL}. Verify the SSH tunnel is running (e.g. ssh -L 8000:localhost:8000) and the FastAPI backend on IBM LinuxONE is active. Diagnostic: ${diag}`
      );
    } finally {
      setLoading(false);
    }
  }

  // Combine transfers from demo request and any returned chains dynamically
  const activeTransfers = useMemo<TransferItem[]>(() => {
    const list = [...demoRequest.transfers];
    if (assessment?.fund_flow_analysis?.suspicious_chains) {
      for (const chain of assessment.fund_flow_analysis.suspicious_chains) {
        if (chain.transfers) {
          for (const ct of chain.transfers) {
            const alreadyExists = list.some(
              (item) =>
                item.from_account === ct.from &&
                item.to_account === ct.to &&
                item.amount === ct.amount
            );
            if (!alreadyExists) {
              list.push({
                from_account: ct.from,
                to_account: ct.to,
                amount: ct.amount,
                seconds: ct.seconds,
              });
            }
          }
        }
      }
    }
    return list;
  }, [assessment]);

  const suspiciousChains = useMemo(
    () => assessment?.fund_flow_analysis?.suspicious_chains ?? [],
    [assessment]
  );

  const probability = assessment
    ? assessment.ml_fraud_probability * 100
    : null;

  // Set of flagged hop keys for timeline highlighting
  const flaggedHopKeys = useMemo(() => {
    const set = new Set<string>();
    suspiciousChains.forEach((chain) => {
      if (chain.transfers) {
        chain.transfers.forEach((t) => set.add(`${t.from}->${t.to}`));
      } else {
        for (let i = 0; i < chain.accounts.length - 1; i++) {
          set.add(`${chain.accounts[i]}->${chain.accounts[i + 1]}`);
        }
      }
    });
    return set;
  }, [suspiciousChains]);

  return (
    <main className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={24} />
          </div>
          <div>
            <strong>HOPSTOP</strong>
            <span>FRAUD INTELLIGENCE</span>
          </div>
        </div>

        <p className="nav-label">WORKSPACE</p>
        <button
          type="button"
          className={`nav-item ${activeNav === "overview" ? "active" : ""}`}
          onClick={() => scrollToSection("overview", "overview")}
        >
          <LayoutDashboard size={18} /> Overview
        </button>
        <button
          type="button"
          className={`nav-item ${activeNav === "fund-flow" ? "active" : ""}`}
          onClick={() => scrollToSection("fund-flow-section", "fund-flow")}
        >
          <Network size={18} /> Fund Flow
        </button>
        <button
          type="button"
          className={`nav-item ${activeNav === "risk-assessment" ? "active" : ""}`}
          onClick={() => scrollToSection("risk-assessment-section", "risk-assessment")}
        >
          <ShieldAlert size={18} /> Risk Assessment
        </button>

        <div className="sidebar-bottom">
          <div className={`server-dot ${error ? "disconnected" : assessment ? "connected" : "standby"}`} />
          <div>
            <strong>IBM LinuxONE</strong>
            <span>
              {error
                ? "Tunnel Offline · Port 8000"
                : isSimulated
                ? "Simulated Model Output"
                : assessment
                ? "Live Tunnel Active"
                : "Standby · Port 8000"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <section className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">FRAUD PREVENTION PLATFORM</span>
            <h1>Security Overview</h1>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="sim-button"
              onClick={runSimulation}
              disabled={loading}
              title="Test dashboard with sample ML model response without requiring SSH tunnel"
            >
              Simulate Model
            </button>
            <button
              type="button"
              className="run-button"
              onClick={runAssessment}
              disabled={loading}
              aria-busy={loading}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
              {loading ? "Analyzing..." : "Run Demo Assessment"}
            </button>
          </div>
        </header>

        {/* Disclaimer Notice */}
        <div className="notice" role="note">
          <Activity size={18} />
          <span>
            Experimental ML model and heuristic fund-flow signals. Flagged paths are automated risk
            indicators, not proof of fraud.
          </span>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="error-box" role="alert">
            <AlertTriangle size={18} />
            <div className="error-box-body">
              <strong>Connection Error</strong>
              <p>{error}</p>
              <div className="error-actions">
                <button
                  type="button"
                  className="error-sim-btn"
                  onClick={runSimulation}
                >
                  Load Offline Simulation (Test UI & ML Output)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        <div className="metric-grid" id="overview">
          <article className="metric-card">
            <div className="metric-heading">
              <span>Transaction Amount</span>
              <CircleDollarSign size={19} />
            </div>
            <strong className="metric-value">{formatCurrency(demoRequest.transaction.amount)}</strong>
            <span className="metric-caption">Demo transaction · TRANSFER</span>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>ML Fraud Probability</span>
              <Activity size={19} />
            </div>
            <strong className="metric-value">
              {probability === null ? "—" : `${probability.toFixed(2)}%`}
            </strong>
            <span className="metric-caption">
              {isSimulated ? "Simulated Random Forest output" : "Random Forest model output"}
            </span>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>Suspicious Chains</span>
              <GitBranch size={19} />
            </div>
            <strong className="metric-value">
              {assessment?.suspicious_chains_found ?? "—"}
            </strong>
            <span className="metric-caption">
              {assessment
                ? `${suspiciousChains.length} chain segment(s) identified`
                : "Awaiting API evaluation"}
            </span>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>Fund-Flow Signal</span>
              <Layers size={19} />
            </div>
            <strong className="metric-value">
              {assessment
                ? assessment.fund_flow_risk_detected
                  ? "Risk Detected"
                  : "Normal"
                : "—"}
            </strong>
            <span className="metric-caption">
              {assessment?.fund_flow_analysis
                ? `${assessment.fund_flow_analysis.transfers_analyzed} transfers analyzed`
                : "Rapid connected transfers"}
            </span>
          </article>
        </div>

        {/* Core Content Grid: Graph & Decision */}
        <div className="content-grid">
          {/* Fund Flow Network Panel */}
          <article className="panel flow-panel" id="fund-flow-section">
            <div className="panel-heading">
              <div>
                <h2>
                  <Network size={19} /> Fund-Flow Network
                </h2>
                <p>Interactive account movement & heuristic path analysis</p>
              </div>
              <span className={`live-tag ${assessment ? "evaluated" : ""}`}>
                {isSimulated ? "SIMULATED RESULT" : assessment ? "LIVE ASSESSMENT" : "DEMO PREVIEW"}
              </span>
            </div>

            {/* Interactive SVG Fund Flow Graph */}
            <FundFlowGraph
              transfers={activeTransfers}
              suspiciousChains={suspiciousChains}
              isLiveResult={assessment !== null}
              selectedAccountId={selectedAccountId}
              onSelectAccount={(acc) => {
                setSelectedAccountId(acc);
                if (acc) setSelectedEdgeId(null);
              }}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={(edge) => {
                setSelectedEdgeId(edge);
                if (edge) setSelectedAccountId(null);
              }}
            />
          </article>

          {/* Assessment Decision Panel */}
          <article className="panel decision-panel" id="risk-assessment-section">
            <div className="panel-heading">
              <div>
                <h2>
                  <ShieldAlert size={19} /> Assessment Result
                </h2>
                <p>Combined decision policy</p>
              </div>
            </div>

            {assessment ? (
              <>
                <div
                  className={`decision-badge ${assessment.decision.toLowerCase()}`}
                  role="status"
                  aria-label={`Assessment decision: ${assessment.decision}`}
                >
                  {assessment.decision === "ALLOW" ? (
                    <CheckCircle2 size={24} />
                  ) : (
                    <AlertTriangle size={24} />
                  )}
                  <span>{assessment.decision}</span>
                </div>

                <p className="decision-explanation">
                  {assessment.decision === "REVIEW"
                    ? "The fund-flow heuristic detected rapid movement across connected accounts. Review this pattern."
                    : assessment.decision === "HOLD"
                    ? "The experimental decision policy returned HOLD. High risk probability or multi-hop rapid layering detected."
                    : "No alert was raised by this experimental assessment. Fund movement was within standard heuristic parameters."}
                </p>

                <div className="result-row">
                  <span>ML probability</span>
                  <strong>{probability?.toFixed(2)}%</strong>
                </div>
                <div className="result-row">
                  <span>Chains detected</span>
                  <strong>{assessment.suspicious_chains_found}</strong>
                </div>
                <div className="result-row">
                  <span>Transfers analyzed</span>
                  <strong>
                    {assessment.fund_flow_analysis?.transfers_analyzed ?? activeTransfers.length}
                  </strong>
                </div>
                <div className="result-row">
                  <span>Fund flow alert</span>
                  <strong style={{ color: assessment.fund_flow_risk_detected ? "#f43f5e" : "#10b981" }}>
                    {assessment.fund_flow_risk_detected ? "POSITIVE" : "NEGATIVE"}
                  </strong>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <ShieldCheck size={38} />
                <strong>Ready to analyze</strong>
                <span>Run the demo assessment to retrieve live inference from the IBM LinuxONE backend.</span>
              </div>
            )}
          </article>
        </div>

        {/* Transfer Timeline Panel */}
        <article className="panel transaction-panel">
          <div className="panel-heading">
            <div>
              <h2>
                <ArrowUpRight size={19} /> Transfer Timeline
              </h2>
              <p>Chronological transfers evaluated in fund-flow analysis (Click a row to inspect graph path)</p>
            </div>
            <span className="graph-stats-hint">
              {activeTransfers.length} events recorded
            </span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>FROM</th>
                  <th>TO</th>
                  <th>AMOUNT</th>
                  <th>ELAPSED TIME</th>
                  <th>HEURISTIC SIGNAL</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {activeTransfers.map((transfer) => {
                  const edgeKey = `${transfer.from_account}->${transfer.to_account}`;
                  const isFlagged = flaggedHopKeys.has(edgeKey) || (!assessment && transfer.seconds <= 60);
                  const isSelected = selectedEdgeId === edgeKey;

                  return (
                    <tr
                      key={edgeKey}
                      className={`interactive-row ${isSelected ? "row-selected" : ""}`}
                      onClick={() => {
                        setSelectedAccountId(null);
                        setSelectedEdgeId(isSelected ? null : edgeKey);
                      }}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSelectedAccountId(null);
                          setSelectedEdgeId(isSelected ? null : edgeKey);
                        }
                      }}
                      aria-label={`Transfer from Account ${transfer.from_account} to ${transfer.to_account}, amount ${formatCurrency(transfer.amount)}, time ${formatSeconds(transfer.seconds)}`}
                    >
                      <td>
                        <strong>Account {transfer.from_account}</strong>
                      </td>
                      <td>
                        <strong>Account {transfer.to_account}</strong>
                      </td>
                      <td>{formatCurrency(transfer.amount)}</td>
                      <td>{formatSeconds(transfer.seconds)}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            isFlagged ? "flagged-status" : "normal-status"
                          }`}
                        >
                          {isFlagged ? "RAPID SIGNAL" : "OBSERVED"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="clear-selection-btn"
                          style={{ padding: "3px 8px", fontSize: "11px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAccountId(null);
                            setSelectedEdgeId(isSelected ? null : edgeKey);
                          }}
                        >
                          {isSelected ? "Deselect" : "Inspect Path"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>

        <footer>HOPSTOP · Experimental fraud intelligence · IBM LinuxONE</footer>
      </section>
    </main>
  );
}

export default App;
