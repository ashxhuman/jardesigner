import asyncio
import json
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
import ssl
import httpx
import requests
from fastapi import BackgroundTasks, FastAPI, HTTPException, APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager
from .database.storage import (
    LocalStorageManager,
    CLIENT_DATA_DIR,
    SWC_DIR,
    METADATA_DIR,
    LOCAL_STORAGE_DIR,
)
from .model.models import NeuronRequest, NeuronResponse, CartData, FormData

# HTTP client configuration
NEUROMORPHO_BASE_URL = "http://cngpro.gmu.edu:8080/api/"
HTTP_TIMEOUT = 40.0
MAX_CONNECTIONS = 10
MAX_KEEPALIVE_CONNECTIONS = 5
SEMAPHORE_LIMIT = 10

# Initialize router
app = APIRouter(tags=["Neuromorpho"])


# neuromorpho swc file download script
class CustomSSLAdapter(HTTPAdapter):
    """Custom SSL adapter with specific cipher configuration"""

    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        context = ssl.create_default_context()
        context.set_ciphers("DEFAULT:!DH")
        self.poolmanager = PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=context,
            **pool_kwargs,
        )


class HTTPClientManager:
    """Manages HTTP client instances with proper configuration"""

    @staticmethod
    def get_async_client():
        """Get configured async HTTP client"""
        limits = httpx.Limits(
            max_connections=MAX_CONNECTIONS,
            max_keepalive_connections=MAX_KEEPALIVE_CONNECTIONS,
        )
        return httpx.AsyncClient(timeout=HTTP_TIMEOUT, limits=limits)

    @staticmethod
    def get_sync_session():
        """Get configured sync HTTP session with custom SSL"""
        session = requests.Session()
        adapter = CustomSSLAdapter()
        session.mount("https://", adapter)
        return session


class NeuroMorphoAPI:
    """Handles all NeuroMorpho API interactions"""

    @staticmethod
    async def fetch_species():
        """Fetch all available species from NeuroMorpho API"""
        async with HTTPClientManager.get_async_client() as client:
            response = await client.get(f"{NEUROMORPHO_BASE_URL}/neuron/fields/species")
            if response.status_code == 200:
                return sorted(response.json()["fields"])
            raise HTTPException(
                status_code=response.status_code, detail="Failed to fetch species"
            )

    @staticmethod
    async def fetch_neuron_data(neuron_id: str):
        """Fetch neuron data by ID"""
        async with HTTPClientManager.get_async_client() as client:
            response = await client.get(f"{NEUROMORPHO_BASE_URL}/neuron/id/{neuron_id}")
            if response.status_code == 200:
                return response.json()
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch neuron {neuron_id}",
            )

    @staticmethod
    async def fetch_page_data(species: str, page: int, semaphore: asyncio.Semaphore):
        """Fetch a single page of neuron data for a species"""
        async with semaphore:
            try:
                async with HTTPClientManager.get_async_client() as client:
                    response = await client.get(
                        f'{NEUROMORPHO_BASE_URL}/neuron/select?q=species:"{species}"&size:500&page={page}'
                    )
                    return response
            except Exception as e:
                print(f"Error fetching page {page}: {e}")
                return None

    @staticmethod
    def search_neurons(species: str, brain_region: str, cell_type: str, page: int = 0):
        """Search neurons with given criteria"""
        params = {"page": page}
        filter_queries = []

        if species:
            params["q"] = f'species:"{species}"'
        if brain_region:
            filter_queries.append(f"brain_region:{brain_region}")
        if cell_type:
            filter_queries.append(f"cell_type:{cell_type}")
        if filter_queries:
            params["fq"] = filter_queries

        response = requests.get(f"{NEUROMORPHO_BASE_URL}/neuron/select", params=params)
        if response.status_code == 200:
            return response.json()
        return {"error": f"API request failed with status {response.status_code}"}

    @staticmethod
    def extract_metadata_from_neurons(neurons: List[Dict]) -> Dict[str, set]:
        """Extract brain regions, cell types, and archives from neuron data"""
        brain_regions = set()
        cell_types = set()
        archives = set()

        for neuron in neurons:
            # Handle brain_region
            if neuron.get("brain_region"):
                if isinstance(neuron["brain_region"], list):
                    brain_regions.update(neuron["brain_region"])
                else:
                    brain_regions.add(neuron["brain_region"])

            # Handle cell_type
            if neuron.get("cell_type"):
                if isinstance(neuron["cell_type"], list):
                    cell_types.update(neuron["cell_type"])
                else:
                    cell_types.add(neuron["cell_type"])

            # Handle archive
            if neuron.get("archive"):
                if isinstance(neuron["archive"], list):
                    archives.update(neuron["archive"])
                else:
                    archives.add(neuron["archive"])

        return {
            "brain_regions": brain_regions,
            "cell_types": cell_types,
            "archives": archives,
        }


# API Endpoints
@app.get("/neuromorpho/")
async def neuromorpho():
    """Get all available species from neuromorpho API"""
    try:
        species = await NeuroMorphoAPI.fetch_species()
        return {"species": species}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /neuromorpho/: {e}")
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch species"}
        )


@app.patch("/neuromorpho/")
async def neuromorpho_metadata(species: str):
    """Fetch metadata for a specific species"""
    species = species
    start = time.time()

    # Save metadata to local storage
    metadata_dir = Path("data") / "neuromorpho"
    metadata_dir.mkdir(parents=True, exist_ok=True)
    metadata_file = Path(metadata_dir) / f"{species}.json"

    if metadata_file.exists():
        # Load and return the existing JSON data
        with open(metadata_file, "r") as f:
            existing_data = json.load(f)
        return existing_data
    else:
        semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)

        async with HTTPClientManager.get_async_client() as client:
            # Get total number of pages
            response = await client.get(
                f"{NEUROMORPHO_BASE_URL}/neuron/select?q=species:{species}"
            )
            data = response.json()
            total_pages = data.get("page", {}).get("totalPages", 1)

            # Fetch all pages concurrently
            tasks = [
                NeuroMorphoAPI.fetch_page_data(species, page, semaphore)
                for page in range(total_pages)
            ]
            responses = await asyncio.gather(*tasks)

            # Extract metadata from all neurons
            all_metadata = {
                "brain_regions": set(),
                "cell_types": set(),
                "archives": set(),
            }

            for resp in responses:
                if resp is None:
                    continue
                neurons = resp.json().get("_embedded", {}).get("neuronResources", [])
                metadata = NeuroMorphoAPI.extract_metadata_from_neurons(neurons)

                all_metadata["brain_regions"].update(metadata["brain_regions"])
                all_metadata["cell_types"].update(metadata["cell_types"])
                all_metadata["archives"].update(metadata["archives"])

            end = time.time()
            print(f"Time taken: {end - start:.2f} seconds")

            result = {
                "species": [species],
                "brain_region": list(all_metadata["brain_regions"]),
                "cell_type": list(all_metadata["cell_types"]),
                "archive": list(all_metadata["archives"]),
            }
            # Save new data and return it
            LocalStorageManager.save_json_file(metadata_file, result)
            return result


@app.post("/submit/")
def submit_form(data: FormData):
    """Submit form data to search neurons"""
    result = NeuroMorphoAPI.search_neurons(
        data.species, data.brain_region, data.cell_type, data.page
    )

    if "error" in result:
        return JSONResponse(content=result, status_code=500)

    neurondata = result.get("_embedded", {}).get("neuronResources", [])
    neuronpage = result.get("page", {})

    return {
        "neurondata": neurondata,
        "neuronPage": neuronpage,
        "totalPages": neuronpage.get("totalPages", 0),
        "currentPage": neuronpage.get("number", 0),
        "hasNextPage": neuronpage.get("number", 0)
        < neuronpage.get("totalPages", 0) - 1,
        "hasPreviousPage": neuronpage.get("number", 0) > 0,
    }


@app.post("/save_cart/")
async def save_cart(
    data: CartData,
):
    """Save neuron cart data to local storage by calling create_neuron_data"""
    try:
        # Convert cart data to neuron request format
        neuron_request = NeuronRequest(
            neuron_id=[int(neuron_id) for neuron_id in data.neuron_ids],
            client_name="neuromorpho",
            uploaded_at=datetime.now(),
            save_metadata=True,
        )

        # Call the existing create_neuron_data function
        result = await create_neuron_data(neuron_request)

        # Transform response to match expected cart response format
        return JSONResponse(
            {
                "success": result.processed_count > 0,
                "message": result.message,
                "file_path": str(SWC_DIR),
                "client_name": result.client_name,
                "total_requested": len(data.neuron_ids),
                "total_successful": result.processed_count,
                "total_failed": len(data.neuron_ids) - result.processed_count,
                "stored_files": result.stored_files,
            },
            status_code=200,
        )

    except HTTPException as e:
        return JSONResponse(
            {
                "error": e.detail,
                "total_requested": len(data.neuron_ids),
                "total_successful": 0,
                "total_failed": len(data.neuron_ids),
            },
            status_code=e.status_code,
        )
    except Exception as e:
        return JSONResponse(
            {
                "error": str(e),
                "total_requested": len(data.neuron_ids),
                "total_successful": 0,
                "total_failed": len(data.neuron_ids),
            },
            status_code=500,
        )


async def create_neuron_data(
    request: NeuronRequest,
):
    """Process neuron data and save SWC files to local storage"""
    client_name = request.client_name
    print(f"Processing request for client: {client_name}")

    responses = []
    stored_files = []
    failed_neurons = []

    # Create custom session for HTTPS requests
    session = HTTPClientManager.get_sync_session()

    try:
        for neuron_id in request.neuron_id:
            try:
                # Get neuron data
                neuron_item = await NeuroMorphoAPI.fetch_neuron_data(neuron_id)
                archive = neuron_item.get("archive", "").lower()
                neuron_name = neuron_item.get("neuron_name", "")

                if not archive or not neuron_name:
                    failed_neurons.append(
                        {
                            "neuron_id": neuron_id,
                            "error": "Missing archive or neuron_name in API response",
                        }
                    )
                    continue
                header = {"User-Agent": "MOOSE / ashish@ncbs.res.in"}
                # Download SWC file
                swc_url = f"https://neuromorpho.org/dableFiles/{archive}/CNG version/{neuron_name}.CNG.swc"

                swc_response = session.get(swc_url, headers=header)
                if swc_response.status_code != 200:
                    failed_neurons.append(
                        {
                            "neuron_id": neuron_id,
                            "error": f"Failed to download SWC file: HTTP {swc_response.status_code}",
                        }
                    )
                    continue

                # Save SWC file
                file_path = SWC_DIR / f"{neuron_name}.swc"
                if not file_path.exists():
                    try:
                        with file_path.open("w", encoding="utf-8") as f:
                            f.write(swc_response.text)
                        stored_files.append(str(file_path))
                    except IOError as e:
                        failed_neurons.append(
                            {
                                "neuron_id": neuron_id,
                                "error": f"Failed to save SWC file: {str(e)}",
                            }
                        )
                        continue

                # Prepare client data
                client_data = {
                    "client_name": client_name.lower(),
                    "neuron_id": neuron_id,
                    "data": neuron_item,
                    "uploaded_at": request.uploaded_at or datetime.now(),
                    "file_path": str(file_path),
                    "archive": archive,
                    "neuron_name": neuron_name,
                }

                # Save to local storage
                try:
                    if request.save_metadata:
                        LocalStorageManager.save_neuron_data_locally(
                            client_name, neuron_id, client_data
                        )

                        # Save metadata
                        metadata = {
                            "neuron_id": neuron_id,
                            "neuron_name": neuron_name,
                            "archive": archive,
                            "file_path": str(file_path),
                            "png_url": neuron_item["png_url"],
                            "uploaded_at": client_data["uploaded_at"],
                            "data_file": str(
                                CLIENT_DATA_DIR
                                / f"{client_name.lower()}_{neuron_id}.json"
                            ),
                        }
                        LocalStorageManager.save_client_metadata(client_name, metadata)

                    responses.append(client_data)

                except Exception as e:
                    failed_neurons.append(
                        {
                            "neuron_id": neuron_id,
                            "error": f"Failed to save metadata: {str(e)}",
                        }
                    )
                    continue

            except HTTPException as e:
                failed_neurons.append(
                    {"neuron_id": neuron_id, "error": f"API error: {e.detail}"}
                )
                continue
            except Exception as e:
                failed_neurons.append(
                    {"neuron_id": neuron_id, "error": f"Unexpected error: {str(e)}"}
                )
                continue

    except Exception as e:
        # If there's a critical error, still return partial results
        print(f"Critical error in create_neuron_data: {str(e)}")

    finally:
        session.close()

    # Determine response based on results
    if not responses and failed_neurons:
        # All neurons failed
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process all neurons. Errors: {failed_neurons}",
        )

    response_message = "Neuron data processed and stored locally"
    if failed_neurons:
        response_message += f" ({len(failed_neurons)} failed)"

    return NeuronResponse(
        message=response_message,
        client_name=client_name,
        processed_count=len(responses),
        stored_files=stored_files,
    )


@app.get("/neuron-data/")
async def list_neuron_data():
    """List all neuron SWC files with clients from local storage"""
    try:
        all_data = []

        for metadata_file in METADATA_DIR.glob("*.json"):
            client_name = metadata_file.stem
            client_data = LocalStorageManager.get_client_metadata(client_name)
            LocalStorageManager.check_neuron()

            all_data.append(
                {
                    "client_name": client_name,
                    "neuron_count": len(client_data),
                    "neurons": client_data,
                }
            )

        return {
            "message": "Data retrieved from local storage",
            "total_clients": len(all_data),
            "clients": all_data,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error reading local storage: {str(e)}"
        )


@app.delete("/delete-neuron-data/")
async def delete_neuron_data(client_name: str, neuron_id: int):
    """
    Delete neuron data (SWC file, metadata, and client JSON) for a given client and neuron ID.
    """
    try:
        success = LocalStorageManager.delete_client_metadata(client_name, neuron_id)

        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"No data found for client '{client_name}' with neuron_id: {neuron_id}",
            )

        return {
            "message": "Neuron data deleted successfully",
            "client_name": client_name,
            "neuron_id": neuron_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting neuron data: {str(e)}"
        )


@app.get("/neuron-data/{client_name}")
async def get_client_neuron_data(client_name: str):
    """Get neuron data for a specific client from local storage"""
    try:
        metadata = LocalStorageManager.get_client_metadata(client_name)
        if not metadata:
            raise HTTPException(
                status_code=404, detail=f"No data found for client: {client_name}"
            )

        return {
            "client_name": client_name,
            "neuron_count": len(metadata),
            "neurons": metadata,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving data: {str(e)}")


@app.get("/storage-info/")
async def get_storage_info():
    """Get information about local storage usage"""
    try:
        swc_size = LocalStorageManager.get_directory_size(SWC_DIR)
        client_data_size = LocalStorageManager.get_directory_size(CLIENT_DATA_DIR)
        metadata_size = LocalStorageManager.get_directory_size(METADATA_DIR)

        # Count files
        swc_files = len(list(SWC_DIR.glob("*.swc")))
        client_files = len(list(CLIENT_DATA_DIR.glob("*.json")))
        metadata_files = len(list(METADATA_DIR.glob("*.json")))

        return {
            "storage_directory": str(LOCAL_STORAGE_DIR),
            "total_size_bytes": swc_size + client_data_size + metadata_size,
            "swc_files": {
                "count": swc_files,
                "size_bytes": swc_size,
                "directory": str(SWC_DIR),
            },
            "client_data_files": {
                "count": client_files,
                "size_bytes": client_data_size,
                "directory": str(CLIENT_DATA_DIR),
            },
            "metadata_files": {
                "count": metadata_files,
                "size_bytes": metadata_size,
                "directory": str(METADATA_DIR),
            },
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error getting storage info: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "neuromorpho_api": "connected"}
