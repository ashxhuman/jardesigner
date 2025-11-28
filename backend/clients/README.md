# MOOSE Client

MOOSE Client is a full-stack application for searching, exploring, and managing neuron morphology data from the Model database repositories.(Currently only Neuromorpho is supported) It consists of a FastAPI backend and a React frontend.

## Project Structure

- `backend/` — FastAPI backend providing a REST API for neuron data and local storage
- `frontend/` — React frontend for searching, visualizing, and managing neuron data

## Quick Start

### 1. Backend (FastAPI)

See [backend/README.md](backend/README.md) for full details.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Frontend (React)

See [frontend/README.md](frontend/README.md) for full details.

```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

### Docker Setup

Run docker from top level directory:

```
docker compose -up build
```

## Features

- Search and filter neurons by species, brain region, and cell type
- Save and manage neuron data locally
- Visualize storage usage

---

For more details, see the individual README files in each subproject.
