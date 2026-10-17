import React, { useMemo } from "react";
import {
  ArrowRight,
  Clock,
  Coins,
  Info,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import type { GraphEdge, GraphNode, SuspiciousChain, TransferItem } from "../types";
import { formatCurrency, formatSeconds } from "../utils/format";

interface FundFlowGraphProps {
  transfers: TransferItem[];
  suspiciousChains: SuspiciousChain[];
  isLiveResult: boolean;
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string | null) => void;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
}

export const FundFlowGraph: React.FC<FundFlowGraphProps> = ({
  transfers,
  suspiciousChains,
  isLiveResult,
  selectedAccountId,
  onSelectAccount,
  selectedEdgeId,
  onSelectEdge,
}) => {
  // Extract unique accounts and deduplicate edges
  const { nodes, edges, nodePositions, viewBoxWidth, viewBoxHeight } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();

    // Helper to initialize node
    const ensureNode = (id: string) => {
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          label: id,
          isFlagged: false,
          chainIndexes: [],
          inDegree: 0,
          outDegree: 0,
          inVolume: 0,
          outVolume: 0,
        });
      }
      return nodeMap.get(id)!;
    };

    // Flagged edges from API suspicious chains
    const flaggedHopKeys = new Map<string, { chainIndices: number[]; reasons: string[] }>();

    suspiciousChains.forEach((chain, chainIdx) => {
      // Mark nodes in chain
      chain.accounts.forEach((acc) => {
        const node = ensureNode(acc);
        node.isFlagged = true;
        if (!node.chainIndexes.includes(chainIdx + 1)) {
          node.chainIndexes.push(chainIdx + 1);
        }
      });

      // Mark chain transfers
      if (chain.transfers && chain.transfers.length > 0) {
        chain.transfers.forEach((ct) => {
          const key = `${ct.from}->${ct.to}`;
          const existing = flaggedHopKeys.get(key) || { chainIndices: [], reasons: [] };
          if (!existing.chainIndices.includes(chainIdx + 1)) {
            existing.chainIndices.push(chainIdx + 1);
          }
          existing.reasons.push(
            `Rapid hop (${ct.seconds}s) in suspicious chain #${chainIdx + 1} [${chain.accounts.join(" → ")}]`
          );
          flaggedHopKeys.set(key, existing);
        });
      } else {
        // Fallback: pairwise accounts if transfers array is omitted
        for (let i = 0; i < chain.accounts.length - 1; i++) {
          const key = `${chain.accounts[i]}->${chain.accounts[i + 1]}`;
          const existing = flaggedHopKeys.get(key) || { chainIndices: [], reasons: [] };
          if (!existing.chainIndices.includes(chainIdx + 1)) {
            existing.chainIndices.push(chainIdx + 1);
          }
          existing.reasons.push(
            `Adjacent accounts in suspicious chain #${chainIdx + 1} [${chain.accounts.join(" → ")}]`
          );
          flaggedHopKeys.set(key, existing);
        }
      }
    });

    // Populate transfers and deduplicate edges by from->to
    transfers.forEach((t) => {
      const fromNode = ensureNode(t.from_account);
      const toNode = ensureNode(t.to_account);

      fromNode.outDegree += 1;
      fromNode.outVolume += t.amount;
      toNode.inDegree += 1;
      toNode.inVolume += t.amount;

      const edgeKey = `${t.from_account}->${t.to_account}`;
      const flaggedInfo = flaggedHopKeys.get(edgeKey);
      const isFlagged = Boolean(flaggedInfo);

      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          id: edgeKey,
          from: t.from_account,
          to: t.to_account,
          amount: t.amount,
          seconds: t.seconds,
          isFlagged,
          chainIndexes: flaggedInfo?.chainIndices ?? [],
          flagReasons: flaggedInfo?.reasons ?? [],
          transfers: [{ amount: t.amount, seconds: t.seconds }],
        });
      } else {
        const edge = edgeMap.get(edgeKey)!;
        edge.transfers.push({ amount: t.amount, seconds: t.seconds });
        edge.amount += t.amount; // Aggregate volume for duplicate edge
        edge.seconds = Math.min(edge.seconds, t.seconds); // Show fastest hop
        if (isFlagged && !edge.isFlagged) {
          edge.isFlagged = true;
          edge.chainIndexes = flaggedInfo?.chainIndices ?? [];
          edge.flagReasons = flaggedInfo?.reasons ?? [];
        }
      }
    });

    const allNodes = Array.from(nodeMap.values());
    const allEdges = Array.from(edgeMap.values());

    // Calculate layout using topological layers / DAG depth
    const layers = new Map<string, number>();
    allNodes.forEach((n) => {
      if (n.inDegree === 0) {
        layers.set(n.id, 0);
      }
    });

    // Relax layer ranks based on edges
    for (let iter = 0; iter < allNodes.length + 1; iter++) {
      allEdges.forEach((e) => {
        const fromLayer = layers.get(e.from) ?? 0;
        const currentToLayer = layers.get(e.to) ?? 0;
        if (currentToLayer < fromLayer + 1) {
          layers.set(e.to, fromLayer + 1);
        }
      });
    }

    // Default missing nodes
    allNodes.forEach((n) => {
      if (!layers.has(n.id)) {
        layers.set(n.id, 0);
      }
    });

    // Group nodes by layer
    const layerGroups = new Map<number, string[]>();
    layers.forEach((layer, nodeId) => {
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer)!.push(nodeId);
    });

    const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
    const maxLayer = sortedLayers.length > 0 ? sortedLayers[sortedLayers.length - 1] : 0;
    const maxNodesInLayer = Math.max(
      ...Array.from(layerGroups.values()).map((g) => g.length),
      1
    );

    // Compute responsive dimensions
    const width = Math.max(780, (maxLayer + 1) * 175 + 100);
    const height = Math.max(300, maxNodesInLayer * 110 + 90);

    const positions = new Map<string, { x: number; y: number }>();

    sortedLayers.forEach((layerNum) => {
      const nodeIds = layerGroups.get(layerNum)!;
      const x =
        maxLayer === 0
          ? width / 2
          : 90 + layerNum * ((width - 180) / maxLayer);

      nodeIds.forEach((nodeId, idxInLayer) => {
        const y =
          nodeIds.length === 1
            ? height / 2
            : 60 + (idxInLayer + 0.5) * ((height - 120) / nodeIds.length);
        positions.set(nodeId, { x, y });
      });
    });

    return {
      nodes: allNodes,
      edges: allEdges,
      nodePositions: positions,
      viewBoxWidth: width,
      viewBoxHeight: height,
    };
  }, [transfers, suspiciousChains]);

  // Derived selected details
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedAccountId) ?? null,
    [nodes, selectedAccountId]
  );

  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId]
  );

  // Connected elements to selected node
  const { connectedNodeIds, connectedEdgeIds } = useMemo(() => {
    if (!selectedAccountId) return { connectedNodeIds: new Set<string>(), connectedEdgeIds: new Set<string>() };
    const nIds = new Set<string>([selectedAccountId]);
    const eIds = new Set<string>();

    edges.forEach((e) => {
      if (e.from === selectedAccountId) {
        nIds.add(e.to);
        eIds.add(e.id);
      }
      if (e.to === selectedAccountId) {
        nIds.add(e.from);
        eIds.add(e.id);
      }
    });

    return { connectedNodeIds: nIds, connectedEdgeIds: eIds };
  }, [selectedAccountId, edges]);

  // Handle deselect on background click
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).id === "graph-canvas-bg") {
      onSelectAccount(null);
      onSelectEdge(null);
    }
  };

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    onSelectEdge(null);
    onSelectAccount(selectedAccountId === nodeId ? null : nodeId);
  };

  const handleEdgeClick = (e: React.MouseEvent, edgeId: string) => {
    e.stopPropagation();
    onSelectAccount(null);
    onSelectEdge(selectedEdgeId === edgeId ? null : edgeId);
  };

  return (
    <div className="fund-flow-container">
      {/* Top action / status bar */}
      <div className="graph-controls-bar">
        <div className="graph-meta-left">
          <span className={`status-pill ${isLiveResult ? "live-status" : "preview-status"}`}>
            {isLiveResult ? <Sparkles size={13} /> : <Info size={13} />}
            {isLiveResult ? "LIVE API NETWORK" : "DEMO PREVIEW · UNASSESSED"}
          </span>
          <span className="graph-stats-hint">
            {nodes.length} accounts · {edges.length} flow paths · Click any account or path to inspect
          </span>
        </div>

        {(selectedAccountId || selectedEdgeId) && (
          <button
            type="button"
            className="clear-selection-btn"
            onClick={() => {
              onSelectAccount(null);
              onSelectEdge(null);
            }}
            aria-label="Clear graph selection"
          >
            <X size={14} /> Clear Selection
          </button>
        )}
      </div>

      {/* SVG Canvas Scroll Wrapper */}
      <div className="graph-canvas-wrapper" onClick={handleBackgroundClick}>
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="fund-flow-svg"
          role="img"
          aria-label="Interactive fund flow network graph showing account nodes and directional transfers"
        >
          <rect
            id="graph-canvas-bg"
            x={0}
            y={0}
            width={viewBoxWidth}
            height={viewBoxHeight}
            fill="transparent"
          />

          <defs>
            {/* Arrowhead markers */}
            <marker
              id="arrow-normal"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#64748b" />
            </marker>

            <marker
              id="arrow-flagged"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#f43f5e" />
            </marker>

            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" />
            </marker>

            {/* Linear gradients for nodes */}
            <linearGradient id="grad-node-normal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <linearGradient id="grad-node-flagged" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3f1422" />
              <stop offset="100%" stopColor="#1e131d" />
            </linearGradient>

            <linearGradient id="grad-node-active" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0c4a6e" />
              <stop offset="100%" stopColor="#082f49" />
            </linearGradient>

            {/* Filter for glowing flagged edges */}
            <filter id="glow-flagged" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* EDGES LAYER */}
          <g className="edges-group">
            {edges.map((edge) => {
              const fromPos = nodePositions.get(edge.from);
              const toPos = nodePositions.get(edge.to);
              if (!fromPos || !toPos) return null;

              const dx = toPos.x - fromPos.x;
              const dy = toPos.y - fromPos.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist === 0) return null;

              const r = 26; // Node radius
              const ux = dx / dist;
              const uy = dy / dist;

              // Compute start and end outside the node circle
              const startX = fromPos.x + ux * r;
              const startY = fromPos.y + uy * r;
              const endX = toPos.x - ux * (r + 7);
              const endY = toPos.y - uy * (r + 7);

              // Gentle curve offset to separate overlapping or linear paths
              const perpX = -uy;
              const perpY = ux;
              const curveMagnitude = Math.abs(dy) < 10 ? -22 : 0;
              const midX = (startX + endX) / 2 + perpX * curveMagnitude;
              const midY = (startY + endY) / 2 + perpY * curveMagnitude;

              const pathD = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;

              const isEdgeSelected = selectedEdgeId === edge.id;
              const isConnectedToSelectedNode =
                selectedAccountId !== null && connectedEdgeIds.has(edge.id);

              const isDimmed =
                (selectedAccountId !== null && !isConnectedToSelectedNode) ||
                (selectedEdgeId !== null && !isEdgeSelected);

              let strokeColor = "#475569";
              let markerEnd = "url(#arrow-normal)";

              if (edge.isFlagged) {
                strokeColor = "#f43f5e";
                markerEnd = "url(#arrow-flagged)";
              }

              if (isEdgeSelected || isConnectedToSelectedNode) {
                strokeColor = edge.isFlagged ? "#fb7185" : "#38bdf8";
                markerEnd = edge.isFlagged ? "url(#arrow-flagged)" : "url(#arrow-active)";
              }

              return (
                <g
                  key={edge.id}
                  className={`graph-edge ${edge.isFlagged ? "flagged" : ""} ${
                    isEdgeSelected ? "selected" : ""
                  }`}
                  opacity={isDimmed ? 0.2 : 1}
                  onClick={(e) => handleEdgeClick(e, edge.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleEdgeClick(e as unknown as React.MouseEvent, edge.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Transfer path from Account ${edge.from} to Account ${
                    edge.to
                  }, amount ${formatCurrency(edge.amount)}, elapsed ${formatSeconds(
                    edge.seconds
                  )}${edge.isFlagged ? ", FLAGGED heuristic risk signal" : ""}`}
                >
                  {/* Invisible wide hit target for easier clicking */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="24"
                    strokeLinecap="round"
                    style={{ cursor: "pointer" }}
                  />

                  {/* Visible edge line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isEdgeSelected ? 3.5 : edge.isFlagged ? 2.8 : 2}
                    strokeDasharray={edge.isFlagged ? "6,4" : undefined}
                    markerEnd={markerEnd}
                    filter={edge.isFlagged ? "url(#glow-flagged)" : undefined}
                    style={{ cursor: "pointer", transition: "stroke 0.2s, stroke-width 0.2s" }}
                  />

                  {/* Midpoint badge for amount and seconds */}
                  <g
                    transform={`translate(${midX}, ${midY})`}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x="-48"
                      y="-12"
                      width="96"
                      height="24"
                      rx="12"
                      fill={edge.isFlagged ? "#2a0d17" : "#0f172a"}
                      stroke={
                        isEdgeSelected
                          ? "#38bdf8"
                          : edge.isFlagged
                          ? "#f43f5e"
                          : "#334155"
                      }
                      strokeWidth={isEdgeSelected || edge.isFlagged ? 1.5 : 1}
                    />
                    <text
                      textAnchor="middle"
                      y="4"
                      fill={edge.isFlagged ? "#fda4af" : "#cbd5e1"}
                      fontSize="10.5"
                      fontWeight="600"
                      fontFamily="var(--mono, monospace)"
                    >
                      {formatCurrency(edge.amount)} · {edge.seconds}s
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* NODES LAYER */}
          <g className="nodes-group">
            {nodes.map((node) => {
              const pos = nodePositions.get(node.id);
              if (!pos) return null;

              const isNodeSelected = selectedAccountId === node.id;
              const isConnected =
                selectedAccountId !== null && connectedNodeIds.has(node.id);
              const isDimmed =
                (selectedAccountId !== null && !isConnected) ||
                (selectedEdgeId !== null &&
                  selectedEdge?.from !== node.id &&
                  selectedEdge?.to !== node.id);

              let fillGrad = "url(#grad-node-normal)";
              let strokeColor = "#334155";
              if (node.isFlagged) {
                fillGrad = "url(#grad-node-flagged)";
                strokeColor = "#f43f5e";
              }
              if (isNodeSelected) {
                fillGrad = "url(#grad-node-active)";
                strokeColor = "#38bdf8";
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className={`graph-node ${node.isFlagged ? "flagged" : ""} ${
                    isNodeSelected ? "selected" : ""
                  }`}
                  opacity={isDimmed ? 0.22 : 1}
                  onClick={(e) => handleNodeClick(e, node.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleNodeClick(e as unknown as React.MouseEvent, node.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Account ${node.id}: ${
                    node.isFlagged ? "Flagged heuristic risk node" : "Standard account"
                  }, ${node.inDegree} incoming and ${node.outDegree} outgoing transfers`}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  {/* Selection outer pulse ring */}
                  {isNodeSelected && (
                    <circle
                      r="33"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                      strokeDasharray="4,3"
                      className="node-selection-ring"
                    />
                  )}

                  {/* Flagged warning halo */}
                  {node.isFlagged && !isNodeSelected && (
                    <circle
                      r="31"
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeOpacity="0.4"
                    />
                  )}

                  {/* Invisible large hit area for reliable click detection */}
                  <circle
                    r="40"
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                  />

                  {/* Main Node Circle */}
                  <circle
                    r="26"
                    fill={fillGrad}
                    stroke={strokeColor}
                    strokeWidth={isNodeSelected ? 2.5 : node.isFlagged ? 2.2 : 1.5}
                  />

                  {/* Node label/initial */}
                  <text
                    textAnchor="middle"
                    y="5"
                    fill={
                      isNodeSelected
                        ? "#f0f9ff"
                        : node.isFlagged
                        ? "#ffe4e6"
                        : "#e2e8f0"
                    }
                    fontSize="13"
                    fontWeight="700"
                    fontFamily="var(--sans, system-ui)"
                  >
                    {node.label}
                  </text>

                  {/* Flagged icon pip */}
                  {node.isFlagged && (
                    <g transform="translate(14, -18)">
                      <circle r="7" fill="#f43f5e" />
                      <text
                        textAnchor="middle"
                        y="3.5"
                        fill="#fff"
                        fontSize="9"
                        fontWeight="900"
                      >
                        !
                      </text>
                    </g>
                  )}

                  {/* Pill label below node */}
                  <g transform="translate(0, 39)">
                    <rect
                      x="-38"
                      y="-9"
                      width="76"
                      height="18"
                      rx="9"
                      fill="#0f172a"
                      stroke={strokeColor}
                      strokeWidth="1"
                    />
                    <text
                      textAnchor="middle"
                      y="3.5"
                      fill="#94a3b8"
                      fontSize="9.5"
                      fontWeight="500"
                    >
                      Acct {node.label}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* GRAPH LEGEND */}
      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-swatch node-standard" />
          <span>Account Node</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch node-flagged-swatch" />
          <span>Flagged Account</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch edge-standard" />
          <span>Observed Transfer</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch edge-flagged-swatch" />
          <span>Flagged Rapid Hop</span>
        </div>
        <div className="legend-item">
          <ArrowRight size={13} className="legend-arrow" />
          <span>Direction of Funds</span>
        </div>
      </div>

      {/* INTERACTIVE INSPECTOR PANEL */}
      {(selectedNode || selectedEdge) && (
        <div className="graph-inspector-card" role="region" aria-live="polite">
          <div className="inspector-header">
            <div className="inspector-title">
              {selectedNode ? (
                <>
                  <Coins size={17} className="inspector-icon" />
                  <strong>Account Details: Account {selectedNode.id}</strong>
                </>
              ) : (
                <>
                  <ArrowRight size={17} className="inspector-icon" />
                  <strong>Transfer Path: {selectedEdge?.from} → {selectedEdge?.to}</strong>
                </>
              )}
            </div>
            <button
              type="button"
              className="inspector-close"
              onClick={() => {
                onSelectAccount(null);
                onSelectEdge(null);
              }}
              aria-label="Close inspector panel"
            >
              <X size={16} />
            </button>
          </div>

          <div className="inspector-body">
            {selectedNode && (
              <div className="node-inspector-content">
                <div className="inspector-stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">Total Connections</span>
                    <strong className="stat-val">
                      {selectedNode.inDegree + selectedNode.outDegree}
                    </strong>
                    <span className="stat-sub">
                      {selectedNode.inDegree} in / {selectedNode.outDegree} out
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Inflow Volume</span>
                    <strong className="stat-val">{formatCurrency(selectedNode.inVolume)}</strong>
                    <span className="stat-sub">{selectedNode.inDegree} incoming transfers</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Outflow Volume</span>
                    <strong className="stat-val">{formatCurrency(selectedNode.outVolume)}</strong>
                    <span className="stat-sub">{selectedNode.outDegree} outgoing transfers</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Heuristic Status</span>
                    <strong
                      className={`stat-val ${selectedNode.isFlagged ? "flagged-text" : "normal-text"}`}
                    >
                      {selectedNode.isFlagged ? "Flagged Chain Node" : "Standard"}
                    </strong>
                    <span className="stat-sub">
                      {selectedNode.isFlagged
                        ? `Present in chain #${selectedNode.chainIndexes.join(", #")}`
                        : "No heuristic chain trigger"}
                    </span>
                  </div>
                </div>

                {/* Transfer Breakdown for Selected Account */}
                <div className="connected-transfers-table">
                  <h4>Account Transfer Flow</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>DIRECTION</th>
                        <th>PEER</th>
                        <th>AMOUNT</th>
                        <th>ELAPSED</th>
                        <th>SIGNAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Incoming */}
                      {edges
                        .filter((e) => e.to === selectedNode.id)
                        .map((e) => (
                          <tr key={`in-${e.id}`}>
                            <td>
                              <span className="direction-badge incoming">← IN</span>
                            </td>
                            <td>
                              <strong>Account {e.from}</strong>
                            </td>
                            <td>{formatCurrency(e.amount)}</td>
                            <td>
                              <Clock size={12} /> {formatSeconds(e.seconds)}
                            </td>
                            <td>
                              <span
                                className={`status-pill ${
                                  e.isFlagged ? "flagged-status" : "normal-status"
                                }`}
                              >
                                {e.isFlagged ? "FLAGGED" : "NORMAL"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {/* Outgoing */}
                      {edges
                        .filter((e) => e.from === selectedNode.id)
                        .map((e) => (
                          <tr key={`out-${e.id}`}>
                            <td>
                              <span className="direction-badge outgoing">OUT →</span>
                            </td>
                            <td>
                              <strong>Account {e.to}</strong>
                            </td>
                            <td>{formatCurrency(e.amount)}</td>
                            <td>
                              <Clock size={12} /> {formatSeconds(e.seconds)}
                            </td>
                            <td>
                              <span
                                className={`status-pill ${
                                  e.isFlagged ? "flagged-status" : "normal-status"
                                }`}
                              >
                                {e.isFlagged ? "FLAGGED" : "NORMAL"}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedEdge && (
              <div className="edge-inspector-content">
                <div className="inspector-stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">Source & Destination</span>
                    <strong className="stat-val">
                      {selectedEdge.from} → {selectedEdge.to}
                    </strong>
                    <span className="stat-sub">Directional transfer</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Transfer Amount</span>
                    <strong className="stat-val">{formatCurrency(selectedEdge.amount)}</strong>
                    <span className="stat-sub">
                      {selectedEdge.transfers.length > 1
                        ? `${selectedEdge.transfers.length} transfers combined`
                        : "Single transaction"}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Hop Velocity</span>
                    <strong className="stat-val">{formatSeconds(selectedEdge.seconds)}</strong>
                    <span className="stat-sub">
                      {selectedEdge.seconds <= 60
                        ? "Rapid interval (≤ 60s)"
                        : "Observed interval"}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Heuristic Assessment</span>
                    <strong
                      className={`stat-val ${selectedEdge.isFlagged ? "flagged-text" : "normal-text"}`}
                    >
                      {selectedEdge.isFlagged ? "FLAGGED HEURISTIC" : "OBSERVED FLOW"}
                    </strong>
                    <span className="stat-sub">
                      {selectedEdge.isFlagged
                        ? "Matched suspicious pattern"
                        : "Standard transfer path"}
                    </span>
                  </div>
                </div>

                {selectedEdge.isFlagged ? (
                  <div className="flag-explanation-box">
                    <div className="flag-title">
                      <ShieldAlert size={16} />
                      <strong>Why was this path flagged?</strong>
                    </div>
                    <ul className="flag-reasons-list">
                      {selectedEdge.flagReasons.length > 0 ? (
                        selectedEdge.flagReasons.map((reason, rIdx) => (
                          <li key={rIdx}>{reason}</li>
                        ))
                      ) : (
                        <li>
                          Rapid fund movement ({selectedEdge.seconds}s elapsed) matching rapid
                          successive transfer heuristics across connected accounts.
                        </li>
                      )}
                      <li>
                        Rapid sequential hops across multiple accounts are a known heuristic pattern
                        often seen in fund layering or rapid disbursement pipelines.
                      </li>
                    </ul>
                    <div className="heuristic-disclaimer">
                      <Info size={14} />
                      <span>
                        <strong>Important:</strong> Flagged paths represent automated heuristic risk
                        signals, not verified proof of fraudulent activity. Further review required.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="normal-explanation-box">
                    <Info size={15} />
                    <span>
                      This transfer was evaluated by the fund-flow analyzer. It did not trigger rapid-chain
                      heuristic thresholds.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
