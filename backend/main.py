from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import os
import traceback
from pathlib import Path
from .clients.backend.app.clientapi import app as MOOSEDataClient
from .server import app as Jardesigner, sio
import socketio

app = FastAPI()

# Include routers first
app.include_router(MOOSEDataClient, prefix="/dataclient")
app.include_router(Jardesigner)

origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DataClientExceptionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/dataclient"):
            try:
                return await call_next(request)
            except Exception as e:
                return JSONResponse(
                    status_code=500,
                    content={
                        "error": "An internal server error occurred in DataClient.",
                        "detail": str(e),
                        "traceback": traceback.format_exc(),
                    },
                )
        return await call_next(request)

app.add_middleware(DataClientExceptionMiddleware)

class SessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_id = request.headers.get("X-Client-ID")
        if client_id:
            base_dir = Path(__file__).resolve().parent
            session_dir = os.path.join(base_dir, 'user_uploads', client_id)
            os.makedirs(session_dir, exist_ok=True)
            request.state.session_dir = session_dir
        else:
            pass
        
        response = await call_next(request)
        return response

app.add_middleware(SessionMiddleware)

@app.get("/")
async def root():
    return {"message": "Jardesigner backend is running"}

socket_app = socketio.ASGIApp(sio, app)
