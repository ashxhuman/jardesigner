from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
from clients.backend.app.clientapi import app as MOOSEDataClient
from server import app as Jardesigner, sio, USER_UPLOADS_DIR
import socketio

class SessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_id = request.headers.get("X-Client-ID")
        if client_id:
            session_dir = os.path.join(USER_UPLOADS_DIR, client_id)
            os.makedirs(session_dir, exist_ok=True)
            request.state.session_dir = session_dir
        response = await call_next(request)
        return response

app = FastAPI()

origins = ["http://localhost:3000", "http://localhost:8000", "http://localhost:5173", "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware)

app.include_router(MOOSEDataClient, prefix="/dataclient")
app.include_router(Jardesigner)

@app.get("/")
async def root():
    return {"message": "Jardesigner backend is running"}

socket_app = socketio.ASGIApp(sio, app)
