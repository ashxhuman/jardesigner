# MOOSE Client Backend

This is the backend for the MOOSE Client App, built with [FastAPI](https://fastapi.tiangolo.com/). It provides a RESTful API for interacting with the model database repositories(Currently only Neuromorpho is supported), managing neuron metadata, and handling local storage operations.

## Features

- FastAPI-based REST API
- Endpoints for searching, downloading, and managing neuron data from NeuroMorpho (Currently)
- Local storage management for neuron files and metadata
- CORS enabled for frontend development (default: http://localhost:3000)

## Requirements

- Python 3.12+
- See `requirements.txt` for all dependencies (notably: fastapi, uvicorn, httpx, requests, pydantic)

## Installation

1. (Recommended) Create and activate a virtual environment:

   **On Linux/macOS:**

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

   **On Windows:**

   ```cmd
   python -m venv venv
   venv\Scripts\activate
   ```

   **On Windows PowerShell:**

   ```powershell
   python -m venv venv
   venv\Scripts\Activate.ps1
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Server

Start the FastAPI server using [uvicorn](https://www.uvicorn.org/):

**Standard method (works on all platforms including Windows):**

```bash
uvicorn main:app --reload
```

**Alternative method for Windows if uvicorn command is not found:**

```bash
python -m uvicorn main:app --reload
```

- The API will be available at: http://127.0.0.1:8000/
- Interactive API docs: http://127.0.0.1:8000/docs

## Main API Endpoints

- `GET /` — Root endpoint
- `GET /neuromorpho/` — Get NeuroMorpho data
- `PATCH /neuromorpho/` — Update NeuroMorpho metadata
- `POST /submit/` — Submit form data for neuron search
- `POST /save_cart/` — Save selected neuron IDs
- `GET /neuron-data/` — List all neuron data
- `DELETE /delete-neuron-data/` — Delete neuron data by client and neuron ID
- `GET /neuron-data/{client_name}` — Get neuron data for a specific client
- `GET /storage-info/` — Get local storage usage info
- `GET /health` — Health check endpoint

## Project Structure

- `main.py` — FastAPI app entrypoint
- `app/neuromorpho.py` — Main API logic for NeuroMorpho data
- `app/metaField.py` — (Legacy/unused) Metadata field helpers
- `local_storage/` — Stores downloaded neuron data and metadata

## Notes

- The backend is configured to allow CORS requests from `http://localhost:3000` (the default frontend dev server).
- For development, use `--reload` with uvicorn for auto-reloading on code changes.

---

For more details, see the code and inline comments.

```

```
