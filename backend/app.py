
from pathlib import Path
from typing import List
import json

import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fundflow import analyze_fund_flow


# --------------------------------------------------
# Application setup
# --------------------------------------------------

app = FastAPI(
    title="HopStop",
    version="0.2.0",
    description="Experimental ML and fund-flow fraud intelligence API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Load the trained Random Forest model
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "hopstop_fraud_model.joblib"
METADATA_PATH = BASE_DIR / "models" / "model_metadata.json"

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

if not METADATA_PATH.exists():
    raise FileNotFoundError(f"Model metadata not found: {METADATA_PATH}")

ml_model = joblib.load(MODEL_PATH)

with METADATA_PATH.open("r", encoding="utf-8") as file:
    ml_metadata = json.load(file)

ML_FEATURES = ml_metadata["features"]


# --------------------------------------------------
# Request models
# --------------------------------------------------

class Transaction(BaseModel):
    amount: float = Field(gt=0)
    account_age_days: int = Field(ge=0)
    seconds_since_incoming: int = Field(ge=0)
    incoming_amount: float = Field(ge=0)
    recent_outgoing_amount: float = Field(ge=0)
    unique_recipients: int = Field(ge=0)


class Transfer(BaseModel):
    from_account: str = Field(min_length=1)
    to_account: str = Field(min_length=1)
    amount: float = Field(gt=0)
    seconds: int = Field(ge=0)


class FundFlowRequest(BaseModel):
    transfers: List[Transfer]


class MLPredictionRequest(BaseModel):
    step: int = Field(ge=1)
    amount: float = Field(gt=0)
    oldbalanceOrg: float = Field(ge=0)
    newbalanceOrig: float = Field(ge=0)
    oldbalanceDest: float = Field(ge=0)
    newbalanceDest: float = Field(ge=0)
    type: str


class CombinedAssessRequest(BaseModel):
    transaction: MLPredictionRequest
    transfers: List[Transfer]


# --------------------------------------------------
# Helper functions
# --------------------------------------------------

SUPPORTED_TRANSACTION_TYPES = {
    "CASH_IN",
    "CASH_OUT",
    "DEBIT",
    "PAYMENT",
    "TRANSFER",
}


def predict_transaction(tx: MLPredictionRequest) -> dict:
    """Generate a fraud score using the trained model."""

    if tx.type not in SUPPORTED_TRANSACTION_TYPES:
        raise ValueError(
            f"Unsupported transaction type: {tx.type}"
        )

    row = {
        "step": tx.step,
        "amount": tx.amount,
        "oldbalanceOrg": tx.oldbalanceOrg,
        "newbalanceOrig": tx.newbalanceOrig,
        "oldbalanceDest": tx.oldbalanceDest,
        "newbalanceDest": tx.newbalanceDest,
        "type": tx.type,
    }

    frame = pd.DataFrame([row])
    frame = pd.get_dummies(
        frame,
        columns=["type"],
        dtype=int,
    )
    frame = frame.reindex(
        columns=ML_FEATURES,
        fill_value=0,
    )

    probability = float(
        ml_model.predict_proba(frame)[0][1]
    )

    if probability >= 0.50:
        decision = "HOLD"
    elif probability >= 0.30:
        decision = "REVIEW"
    else:
        decision = "ALLOW"

    return {
        "project": "HopStop",
        "model": "Random Forest",
        "fraud_probability": round(probability, 4),
        "fraud_probability_percent": round(
            probability * 100, 2
        ),
        "decision": decision,
        "note": (
            "Experimental model trained on sampled "
            "synthetic PaySim data."
        ),
    }


def convert_transfers(transfers: List[Transfer]) -> list:
    """Convert validated API transfers to analyzer input."""

    return [
        {
            "from": transfer.from_account,
            "to": transfer.to_account,
            "amount": transfer.amount,
            "seconds": transfer.seconds,
        }
        for transfer in transfers
    ]


# --------------------------------------------------
# Basic endpoints
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "project": "HopStop",
        "status": "running",
        "platform": "Local development",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": ml_model is not None,
    }


# --------------------------------------------------
# Heuristic risk assessment endpoint
# --------------------------------------------------

@app.post("/assess")
def assess(tx: Transaction):
    risk = 0
    signals = []

    if tx.seconds_since_incoming <= 60:
        risk += 30
        signals.append("rapid_outgoing_transfer")

    ratio = (
        tx.recent_outgoing_amount / tx.incoming_amount
        if tx.incoming_amount > 0
        else 0
    )

    if ratio >= 0.8:
        risk += 25
        signals.append("high_pass_through_ratio")

    if tx.unique_recipients >= 5:
        risk += 20
        signals.append("high_recipient_fanout")

    if tx.account_age_days <= 7:
        risk += 15
        signals.append("new_account")

    if (
        tx.incoming_amount > 0
        and tx.amount >= 0.8 * tx.incoming_amount
    ):
        risk += 10
        signals.append("large_outgoing_payment")

    risk = min(risk, 100)

    if risk >= 60:
        decision = "HOLD"
    elif risk >= 30:
        decision = "REVIEW"
    else:
        decision = "ALLOW"

    return {
        "project": "HopStop",
        "risk_score": risk,
        "decision": decision,
        "risk_signals": signals,
        "pass_through_ratio": round(ratio, 3),
        "note": (
            "Demonstration rules only; this endpoint "
            "does not use the trained ML model."
        ),
    }


# --------------------------------------------------
# Fund-flow analysis endpoint
# --------------------------------------------------

@app.post("/fundflow")
def fundflow(request: FundFlowRequest):
    transfers = convert_transfers(request.transfers)
    return analyze_fund_flow(transfers)


# --------------------------------------------------
# Machine-learning prediction endpoint
# --------------------------------------------------

@app.post("/predict")
def predict_fraud(tx: MLPredictionRequest):
    if tx.type not in SUPPORTED_TRANSACTION_TYPES:
        return {
            "project": "HopStop",
            "error": "Unsupported transaction type",
        }

    return predict_transaction(tx)


# --------------------------------------------------
# Combined ML + fund-flow assessment endpoint
# --------------------------------------------------

@app.post("/combined-assess")
def combined_assess(request: CombinedAssessRequest):
    ml_result = predict_transaction(request.transaction)

    transfers = convert_transfers(request.transfers)
    flow_result = analyze_fund_flow(transfers)

    chains = flow_result.get("suspicious_chains", [])
    probability = ml_result["fraud_probability"]
    rapid_chain_found = len(chains) > 0

    # Demonstration decision policy, not production policy.
    if probability >= 0.50 or (
        probability >= 0.30 and rapid_chain_found
    ):
        decision = "HOLD"
    elif probability >= 0.30 or rapid_chain_found:
        decision = "REVIEW"
    else:
        decision = "ALLOW"

    return {
        "project": "HopStop",
        "ml_fraud_probability": probability,
        "suspicious_chains_found": len(chains),
        "fund_flow_risk_detected": rapid_chain_found,
        "decision": decision,
        "fund_flow_analysis": flow_result,
        "note": (
            "Experimental model and heuristic signals; "
            "flagged patterns are not proof of fraud."
        ),
    }
