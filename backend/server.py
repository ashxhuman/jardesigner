import os
import json
import uuid
import time
import shutil
import subprocess
import threading

from fastapi import UploadFile, File, Form, Request, HTTPException, APIRouter
from fastapi.responses import FileResponse
import socketio

# ============================================================
# Directory setup
# ============================================================

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
TEMP_CONFIG_DIR = os.path.join(BASE_DIR, 'temp_configs')
USER_UPLOADS_DIR = os.path.join(BASE_DIR, 'user_uploads')

os.makedirs(TEMP_CONFIG_DIR, exist_ok=True)
os.makedirs(USER_UPLOADS_DIR, exist_ok=True)

# ============================================================
# Socket.IO Server
# ============================================================

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# ============================================================
# Global runtime tracking
# ============================================================

running_processes = {}
client_sim_map = {}
sid_clientid_map = {}

app = APIRouter(tags=["Jardesigner"])

# ============================================================
# Stream printer
# ============================================================

def stream_printer(stream, pid, stream_name):
    try:
        for line in iter(stream.readline, ''):
            if line:
                print(f"[{pid}-{stream_name}] {line.strip()}")
        stream.close()
        print(f"Stream {stream_name} for PID {pid} finished.")
    except Exception as e:
        print(f"Stream error for PID {pid} -> {stream_name}: {e}")


# ============================================================
# Kill process
# ============================================================

def terminate_process(pid):
    if pid not in running_processes:
        return False
    try:
        proc = running_processes[pid]["process"]
        if proc.poll() is None:
            print(f"Terminating {pid}")
            proc.terminate()
            proc.wait(timeout=5)
        del running_processes[pid]
        return True
    except Exception as e:
        print(f"Termination error for {pid}: {e}")
        running_processes.pop(pid, None)
        return False


# ============================================================
# ROUTES
# ============================================================

@app.get("/")
async def index():
    return {"message": "FastAPI backend running!", "clientName": sid_clientid_map, "client_sim_map": client_sim_map }


# -------------------------------
# File Upload
# -------------------------------
@app.post("/upload_file")
async def upload_file(
        file: UploadFile = File(...),
        clientId: str = Form(...)
):
    if not clientId:
        raise HTTPException(400, "Missing clientId")

    session_dir = os.path.join(USER_UPLOADS_DIR, clientId)
    os.makedirs(session_dir, exist_ok=True)

    save_path = os.path.join(session_dir, file.filename)

    with open(save_path, "wb") as f:
        f.write(await file.read())

    print(f"Saved file for {clientId} -> {save_path}")
    return {"status": "success", "message": "File uploaded successfully"}


# -------------------------------
# Launch simulation
# -------------------------------
@app.post("/launch_simulation")
async def launch_sim(request: Request):
    body = await request.json()
    config_data = body.get("config_data")
    client_id = body.get("client_id")

    if not config_data:
        raise HTTPException(400, "Missing config_data")
    if not client_id:
        raise HTTPException(400, "Missing client_id")

    # kill older simulation
    if client_id in client_sim_map:
        old_pid = client_sim_map[client_id]
        terminate_process(old_pid)
        client_sim_map.pop(client_id, None)

    # save temp config
    temp_file_name = f"config_{uuid.uuid4()}.json"
    temp_path = os.path.join(TEMP_CONFIG_DIR, temp_file_name)

    with open(temp_path, "w") as f:
        json.dump(config_data, f, indent=2)

    session_dir = os.path.join(USER_UPLOADS_DIR, client_id)
    os.makedirs(session_dir, exist_ok=True)

    svg_filename = "plot.svg"
    svg_filepath = os.path.join(session_dir, svg_filename)

    data_channel_id = str(uuid.uuid4())

    command = [
        "python", "-u", "-m",
        "jardesigner.jardesigner",
        temp_path,
        "--plotFile", svg_filepath,
        "--data-channel-id", data_channel_id,
        "--session-path", session_dir
    ]

    env = os.environ.copy()
    env["PYTHONPATH"] = f"{BASE_DIR}:{env.get('PYTHONPATH', '')}"

    try:
        process = subprocess.Popen(
            command,
            cwd=BASE_DIR,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env,
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to launch: {e}")

    running_processes[process.pid] = {
        "process": process,
        "svg_filename": svg_filename,
        "temp_config_file_path": temp_path,
        "start_time": time.time(),
        "data_channel_id": data_channel_id,
        "client_id": client_id,
    }
    client_sim_map[client_id] = process.pid

    # stream threads
    threading.Thread(target=stream_printer, args=(process.stdout, process.pid, "stdout"), daemon=True).start()
    threading.Thread(target=stream_printer, args=(process.stderr, process.pid, "stderr"), daemon=True).start()

    return {
        "status": "success",
        "pid": process.pid,
        "svg_filename": svg_filename,
        "data_channel_id": data_channel_id,
    }


# -------------------------------
# Internal push_data
# -------------------------------
@app.post("/internal/push_data")
async def push_data(request: Request):
    data = await request.json()
    channel = data.get("data_channel_id")
    payload = data.get("payload")

    if not channel or payload is None:
        raise HTTPException(400, "Missing data_channel_id or payload")

    await sio.emit("simulation_data", payload, room=channel)
    return {"status": "success"}


# -------------------------------
# Simulation status
# -------------------------------
@app.get("/simulation_status/{pid}")
async def simulation_status(pid: int):
    if pid not in running_processes:
        raise HTTPException(404, "PID not found")

    info = running_processes[pid]
    process = info["process"]
    client_id = info["client_id"]
    svg_file = info["svg_filename"]

    session_dir = os.path.join(USER_UPLOADS_DIR, client_id)
    svg_path = os.path.join(session_dir, svg_file)

    if process.poll() is None:
        return {"status": "running", "pid": pid}

    if os.path.exists(svg_path):
        return {"status": "completed", "pid": pid, "plot_ready": True}

    return {"status": "completed_error", "pid": pid, "plot_ready": False}


# -------------------------------
# Fetch session file
# -------------------------------
@app.get("/session_file/{client_id}/{filename}")
async def fetch_file(client_id: str, filename: str):
    path = os.path.join(USER_UPLOADS_DIR, client_id, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path)

# -------------------------------
# Reset simulation
# -------------------------------
@app.post("/reset_simulation")
async def reset_sim(request: Request):
    body = await request.json()
    pid_str = body.get("pid")
    client_id = body.get("client_id")

    if not pid_str:
        raise HTTPException(400, "PID missing")

    pid = int(pid_str)

    if terminate_process(pid):
        client_sim_map.pop(client_id, None)
        return {"status": "success", "message": f"PID {pid} reset"}

    raise HTTPException(404, "PID not found")


# ============================================================
# Socket.IO EVENT HANDLERS
# ============================================================

@sio.event
async def connect(sid, environ):
    print("Client connected:", sid)


@sio.event
async def disconnect(sid):
    print("Disconnect:", sid)

    client_id = sid_clientid_map.get(sid)
    if not client_id:
        return

    session_dir = os.path.join(USER_UPLOADS_DIR, client_id)
    if os.path.exists(session_dir):
        shutil.rmtree(session_dir)

    sid_clientid_map.pop(sid, None)

    pid = client_sim_map.pop(client_id, None)
    if pid:
        terminate_process(pid)


@sio.event
async def register_client(sid, data):
    cid = data.get("clientId")
    sid_clientid_map[sid] = cid
    print("Registered client", cid, "SID:", sid)


@sio.event
async def join_sim_channel(sid, data):
    channel = data.get("data_channel_id")
    await sio.enter_room(sid, channel)
    print("SID", sid, "joined", channel)


@sio.event
async def sim_command(sid, data):
    pid = int(data.get("pid"))
    cmd = data.get("command")
    params = data.get("params", {})

    if pid not in running_processes:
        return

    proc = running_processes[pid]["process"]
    if proc.poll() is None:
        payload = json.dumps({"command": cmd, "params": params}) + "\n"
        proc.stdin.write(payload)
        proc.stdin.flush()

#  uvicorn main:socket_app --host 0.0.0.0 --port 5000
