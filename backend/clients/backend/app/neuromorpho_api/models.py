from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class NeuronSWCData:
    """Data class to hold neuron data and SWC file content."""
    neuron_id: int
    neuron_name: str
    archive_name: str
    swc_content: str
    api_data: Dict

@dataclass
class NeuronMetadata:
    """Data class for neuron metadata."""
    neuron_id: int
    neuron_name: str
    archive: str
    png_url: str

class APIError(Exception):
    """Custom exception for API-related errors."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(f"[{self.status_code}] {self.message}")
