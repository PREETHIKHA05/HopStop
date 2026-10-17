\# HopStop — Real-Time Fund-Flow Fraud Detection



HopStop is an experimental AI-powered fraud detection prototype designed to identify suspicious financial transactions and trace potentially fraudulent movement of funds through connected accounts.



Instead of relying only on individual transaction scores, HopStop combines machine-learning predictions with fund-flow analysis to help highlight suspicious transaction chains for investigation.



\## Key Features



\- \*\*Machine-Learning Fraud Scoring:\*\* Uses a trained Random Forest classifier to estimate the probability that a transaction is fraudulent.

\- \*\*Fund-Flow Analysis:\*\* Examines connected transaction chains to identify suspicious patterns of money movement.

\- \*\*Combined Risk Assessment:\*\* Combines the model's prediction with fund-flow indicators to produce an assessment such as ALLOW, REVIEW, or a higher-risk decision, depending on the implemented rules.

\- \*\*Interactive Dashboard:\*\* Displays assessment results and a fund-flow graph.

\- \*\*REST API:\*\* Exposes backend endpoints through FastAPI.

\- \*\*Local Development:\*\* Runs on a Windows computer without requiring the original remote server.



\## Technology Stack



\### Frontend

\- React

\- TypeScript

\- Vite

\- CSS

\- Interactive fund-flow visualization



\### Backend

\- Python

\- FastAPI

\- Uvicorn

\- pandas and NumPy

\- scikit-learn

\- joblib



\### Machine Learning

\- Random Forest classifier

\- Synthetic PaySim transaction data

\- Saved model artifact for inference



\## Project Structure



```text

HopStop/

├── backend/

│   ├── app.py

│   ├── fundflow.py

│   ├── requirements.txt

│   ├── requirements-lock.txt

│   └── models/

│       ├── hopstop\_fraud\_model.joblib

│       └── model\_metadata.json

├── frontend/

│   ├── package.json

│   ├── package-lock.json

│   ├── vite.config.ts

│   └── src/

├── .gitignore

└── README.md

```



\## Prerequisites



Install the following before running HopStop:



\- Python 3.13 (or another Python version verified to work with the dependencies)

\- Node.js and npm

\- Git (optional, for cloning the repository)



\## Run the Backend on Windows



Open Command Prompt and navigate to the backend directory:



```cmd

cd HopStop\\backend

```



Create a virtual environment:



```cmd

py -3.13 -m venv .venv

```



Activate it:



```cmd

.venv\\Scripts\\activate

```



Install the locked dependencies:



```cmd

python -m pip install -r requirements-lock.txt

```



Start the API:



```cmd

python -m uvicorn app:app --host 127.0.0.1 --port 8000

```



Keep this terminal open while using the dashboard.



Check backend health by opening:



http://127.0.0.1:8000/health



FastAPI interactive API documentation is normally available at:



http://127.0.0.1:8000/docs



\## Run the Frontend



Open a second Command Prompt and navigate to the frontend directory:



```cmd

cd HopStop\\frontend

```



Install the Node.js dependencies:



```cmd

npm ci

```



Start the development server:



```cmd

npm run dev -- --host 127.0.0.1

```



Open the local URL printed by Vite in the terminal. It may use port 5173, 5174, or another available port.



The frontend's API URL is configured in `src/config.ts`. For local development, it should point to:



```text

http://127.0.0.1:8000

```



Ensure the backend CORS configuration permits the exact frontend origin printed by Vite.



\## API Endpoints



The backend includes endpoints for health checks, transaction assessment, fund-flow analysis, machine-learning prediction, and combined risk assessment.



The primary combined assessment endpoint is:



```text

POST /combined-assess

```



The exact request fields and response schema can be inspected through the running API documentation at `/docs`.



\## Model and Data Notes



The trained model is stored in `backend/models/`. The original training dataset is not required to run inference because the saved model is loaded directly by the backend.



Do not upload the original large training CSV or any private SSH keys to GitHub.



\## Important Limitations



HopStop is a demonstration prototype, not a production banking fraud-prevention system.



\- The model was trained on sampled synthetic PaySim data.

\- Synthetic data does not fully represent real banking behaviour.

\- Evaluation metrics can change with sampling, class balance, and the evaluation split.

\- Model predictions are risk signals, not proof of fraud.

\- Fund-flow findings should be reviewed by a human investigator.

\- The model's accuracy, latency, and risk thresholds require independent validation before real-world use.



\## Future Improvements



\- Evaluate on separate, realistic test data.

\- Add time-aware transaction graph analysis.

\- Improve explainability for individual risk decisions.

\- Add monitoring, audit logs, and analyst feedback.

\- Evaluate model calibration and false-positive rates.

\- Integrate validated real-world transaction data where legally permitted.



\## License



Choose and add an appropriate open-source license before distributing the project. Do not claim a license that has not been added to the repository.

