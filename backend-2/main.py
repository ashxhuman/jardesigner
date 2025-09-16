from fastapi import FastAPI, Path
from fastapi.middleware.cors import CORSMiddleware
from app import neuromorpho

app = FastAPI()

origins = ["http://localhost:9000", "http://localhost:3000", "http://10.70.2.166:3001", "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(neuromorpho.app)


@app.get("/")
async def root():
    return {"message": "MOOSE Client running!"}
