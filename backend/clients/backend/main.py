from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from .app import clientapi as dataclient

app = FastAPI()

origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dataclient.app, prefix="/dataclient")

@app.get("/")
async def root():
    return {"message": "MOOSE Client running!"}
