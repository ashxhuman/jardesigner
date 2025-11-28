from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class NeuronRequest(BaseModel):
    neuron_id: List[int]
    client_name: str
    uploaded_at: Optional[datetime] = None
    save_metadata: bool = False


class NeuronResponse(BaseModel):
    message: str
    client_name: str
    processed_count: int
    stored_files: List[str]


class FormData(BaseModel):
    species: str | None = None
    brain_region: str | None = None
    cell_type: str | None = None
    page: int = 0


class CartData(BaseModel):
    neuron_ids: List[int]
