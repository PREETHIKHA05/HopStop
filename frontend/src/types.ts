export type Transaction = {
  step: number;
  amount: number;
  oldbalanceOrg: number;
  newbalanceOrig: number;
  oldbalanceDest: number;
  newbalanceDest: number;
  type: string;
};

export type TransferItem = {
  from_account: string;
  to_account: string;
  amount: number;
  seconds: number;
};

export type ChainTransfer = {
  from: string;
  to: string;
  amount: number;
  seconds: number;
};

export type SuspiciousChain = {
  accounts: string[];
  transfer_count: number;
  transfers: ChainTransfer[];
};

export type FundFlowAnalysis = {
  transfers_analyzed: number;
  suspicious_chains: SuspiciousChain[];
};

export type Assessment = {
  ml_fraud_probability: number;
  suspicious_chains_found: number;
  fund_flow_risk_detected: boolean;
  decision: "ALLOW" | "REVIEW" | "HOLD";
  fund_flow_analysis?: FundFlowAnalysis;
};

export type AssessRequest = {
  transaction: Transaction;
  transfers: TransferItem[];
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  amount: number;
  seconds: number;
  isFlagged: boolean;
  chainIndexes: number[];
  flagReasons: string[];
  transfers: Array<{
    amount: number;
    seconds: number;
  }>;
};

export type GraphNode = {
  id: string;
  label: string;
  isFlagged: boolean;
  chainIndexes: number[];
  inDegree: number;
  outDegree: number;
  inVolume: number;
  outVolume: number;
};
