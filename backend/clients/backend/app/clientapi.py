import asyncio
import json
from pathlib import Path
from datetime import datetime
from typing import Union
from fastapi import HTTPException, APIRouter, Request
from fastapi.responses import JSONResponse
from .database.storage import LocalStorageManager
from .model.models import NeuronRequest, CartData, FormData
from .neuromorpho_api.neuromorphoClient import NeuroMorphoAPI

# Initialize router
app = APIRouter(tags=["Neuromorpho"])


# --- DEV MODE CONSTANT ---
TEST_HARDCODED_PATH = Path("./_dev_session_storage_")


def get_storage_manager(request: Request, dev_mode_path: Union[Path, str, None] = None) -> LocalStorageManager:
    """
    Retrieves the session path from request state and instantiates LocalStorageManager.
    Allows for path override via `dev_mode_path` for testing.
    Raises HTTPException if the path is missing and not in dev mode.
    """
    if dev_mode_path:
        session_dir = dev_mode_path
    else:
        session_dir = getattr(request.state, "session_dir", None)

    if not session_dir:
        raise HTTPException(
            status_code=400,
            detail="Session context missing. Ensure 'X-Client-ID' header is provided."
        )
    return LocalStorageManager(session_dir)


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
    metadata_dir = Path("data") / "neuromorpho"
    metadata_dir.mkdir(parents=True, exist_ok=True)
    metadata_file = metadata_dir / f"{species}.json"

    if metadata_file.exists():
        with open(metadata_file, "r") as f:
            existing_data = json.load(f)
        return existing_data
    else:
        result = await NeuroMorphoAPI.fetch_all_metadata_for_species(species)
        print(f"Metadata result: {result}")
        if metadata_file.exists():
            LocalStorageManager.save_json_file(metadata_file, result)
            return result
        return None


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
        "hasNextPage": neuronpage.get("number", 0) < neuronpage.get("totalPages", 0) - 1,
        "hasPreviousPage": neuronpage.get("number", 0) > 0,
    }


@app.post("/save_cart/")
async def save_cart(
        data: CartData,
        request: Request,
):
    """Save neuron cart data to local storage for the current session"""
    storage_manager = get_storage_manager(request)
    # FOR TESTING: Use the line below instead of the one above to hardcode the path:
    # storage_manager = get_storage_manager(request, dev_mode_path=TEST_HARDCODED_PATH)

    total_requested = len(data.neuron_ids)

    try:
        # Convert cart data to neuron request format
        neuron_request = NeuronRequest(
            neuron_id=[int(neuron_id) for neuron_id in data.neuron_ids],
            client_name="neuromorpho",
            uploaded_at=datetime.now(),
            save_metadata=True,
        )

        # Fetch neuron SWC data from the API
        successful_results, failed_neurons = await NeuroMorphoAPI.fetch_neuron_swc_data(
            neuron_request.neuron_id
        )

        processed_count = len(successful_results)
        stored_files = []

        # Save SWC files and metadata locally
        # NeuronSWCData objects have direct attribute access
        for neuron_data in successful_results:
            try:
                metadata = storage_manager.save_swc_and_metadata(
                    client_name="neuromorpho",
                    neuron_id=neuron_data.neuron_id,
                    neuron_name=neuron_data.neuron_name,
                    swc_content=neuron_data.swc_content,
                    api_data=neuron_data.api_data,
                    archive=neuron_data.archive_name,
                    uploaded_at=datetime.now(),
                )
                stored_files.append(metadata["file_path"])
            except Exception as e:
                # If save fails, add to failed neurons list
                failed_neurons.append({
                    "neuron_id": neuron_data.neuron_id,
                    "error": f"Storage error: {str(e)}"
                })
                processed_count -= 1  # Adjust count for failed storage

        message = f"Processed {processed_count} of {total_requested} neurons."
        if failed_neurons:
            message += f" {len(failed_neurons)} failed."

        return JSONResponse(
            {
                "success": processed_count > 0,
                "message": message,
                "file_path": str(storage_manager.SWC_DIR),
                "client_name": neuron_request.client_name,
                "total_requested": total_requested,
                "total_successful": processed_count,
                "total_failed": len(failed_neurons),
                "stored_files": stored_files,
                "failed": failed_neurons,
            },
            status_code=200,
        )

    except HTTPException as e:
        return JSONResponse(
            {
                "error": e.detail,
                "total_requested": total_requested,
                "total_successful": 0,
                "total_failed": total_requested,
            },
            status_code=e.status_code,
        )
    except Exception as e:
        return JSONResponse(
            {
                "error": str(e),
                "total_requested": total_requested,
                "total_successful": 0,
                "total_failed": total_requested,
            },
            status_code=500,
        )


@app.get("/neuron-data/")
async def list_neuron_data(request: Request):
    """List all neuron SWC files with clients from local storage (for the session)"""
    try:
        storage_manager = get_storage_manager(request)
        # FOR TESTING: Use the line below instead of the one above to hardcode the path:
        # storage_manager = get_storage_manager(request, dev_mode_path=TEST_HARDCODED_PATH)

        all_data = []
        client_name = "neuromorpho"

        metadata_file = storage_manager.METADATA_DIR / f"{client_name.lower()}.json"

        if metadata_file.exists():
            client_data = storage_manager.get_client_metadata(client_name)
            storage_manager.check_neuron()

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
async def delete_neuron_data(client_name: str, neuron_id: int, request: Request):
    """Delete neuron data (SWC file, metadata, and client JSON) for a given client and neuron ID."""
    try:
        storage_manager = get_storage_manager(request)
        # FOR TESTING: Use the line below instead of the one above to hardcode the path:
        # storage_manager = get_storage_manager(request, dev_mode_path=TEST_HARDCODED_PATH)

        success = storage_manager.delete_client_metadata(client_name, neuron_id)

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
async def get_client_neuron_data(client_name: str, request: Request):
    """Get neuron data for a specific client from local storage"""
    try:
        storage_manager = get_storage_manager(request)
        # FOR TESTING: Use the line below instead of the one above to hardcode the path:
        # storage_manager = get_storage_manager(request, dev_mode_path=TEST_HARDCODED_PATH)

        metadata = storage_manager.get_client_metadata(client_name)
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
async def get_storage_info(request: Request):
    """Get information about local storage usage for the current session"""
    try:
        storage_manager = get_storage_manager(request)
        # FOR TESTING: Use the line below instead of the one above to hardcode the path:
        # storage_manager = get_storage_manager(request, dev_mode_path=TEST_HARDCODED_PATH)

        swc_dir = storage_manager.SWC_DIR
        client_data_dir = storage_manager.CLIENT_DATA_DIR
        metadata_dir = storage_manager.METADATA_DIR
        local_storage_dir = storage_manager.session_path

        swc_size = storage_manager.get_directory_size(swc_dir)
        client_data_size = storage_manager.get_directory_size(client_data_dir)
        metadata_size = storage_manager.get_directory_size(metadata_dir)

        swc_files = len(list(swc_dir.glob("*.swc")))
        client_files = len(list(client_data_dir.glob("*.json")))
        metadata_files = len(list(metadata_dir.glob("*.json")))

        return {
            "storage_directory": str(local_storage_dir),
            "total_size_bytes": swc_size + client_data_size + metadata_size,
            "swc_files": {
                "count": swc_files,
                "size_bytes": swc_size,
                "directory": str(swc_dir),
            },
            "client_data_files": {
                "count": client_files,
                "size_bytes": client_data_size,
                "directory": str(client_data_dir),
            },
            "metadata_files": {
                "count": metadata_files,
                "size_bytes": metadata_size,
                "directory": str(metadata_dir),
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