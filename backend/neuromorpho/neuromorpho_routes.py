##############################################
# neuromorpho_routes.py — Flask routes for NeuroMorpho.org
#
# Exposes search, metadata, SWC fetch, and session storage endpoints.
# CORS is handled globally in server.py — no per-route decorators needed.
##############################################
import json
import traceback
from pathlib import Path

from flask import Blueprint, abort, jsonify, request

from .neuromorpho import (
    fetch_species,
    fetch_neuron_metadata,
    fetch_swc_direct,
    fetch_swc_files,
    search_neurons,
)
from .storage import NeuronStorage

neuromorpho_routes = Blueprint("neuromorpho", __name__)

# Cache directory for species metadata (shared across sessions)
_CACHE_DIR = Path("data") / "neuromorpho"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

USER_UPLOADS_DIR = Path("user_uploads")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_storage() -> NeuronStorage:
    client_id = request.headers.get("X-Client-ID")
    if not client_id:
        abort(400, "X-Client-ID header is required")
    return NeuronStorage(USER_UPLOADS_DIR / client_id)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@neuromorpho_routes.route("/", methods=["GET"])
def get_species():
    """GET /neuromorpho/  — list all available species."""
    try:
        return jsonify({"species": fetch_species()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@neuromorpho_routes.route("/metadata", methods=["GET"])
def get_metadata():
    """
    GET /neuromorpho/metadata?species=rat
    Returns brain regions, cell types, archives for the species.
    Result is cached in data/neuromorpho/<safe_name>.json.
    """
    species = request.args.get("species")
    if not species:
        return jsonify({"error": "species query param required"}), 400

    safe_name = species.strip().lower().replace(" ", "_")
    cache_file = _CACHE_DIR / f"{safe_name}.json"
    if cache_file.exists():
        try:
            return jsonify(json.loads(cache_file.read_text()))
        except Exception:
            cache_file.unlink(missing_ok=True)  # corrupt cache — rebuild

    try:
        result = fetch_neuron_metadata(species)
        cache_file.write_text(json.dumps(result, indent=2))
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@neuromorpho_routes.route("/search", methods=["POST"])
def search():
    """
    POST /neuromorpho/search
    Body: { species, brain_region, cell_type, page }
    """
    body = request.get_json(force=True, silent=True) or {}

    # Treat empty string the same as None — don't send blank filter to Solr
    species      = body.get("species") or None
    brain_region = body.get("brain_region") or None
    cell_type    = body.get("cell_type") or None
    archive      = body.get("archive") or None
    page         = body.get("page", 0)
    size         = body.get("size", 20)

    print(f"[search] species={species!r} brain_region={brain_region!r} cell_type={cell_type!r} archive={archive!r} page={page} size={size}")

    try:
        result = search_neurons(
            species=species,
            brain_region=brain_region,
            cell_type=cell_type,
            archive=archive,
            page=page,
            size=size,
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    neurons = result.get("_embedded", {}).get("neuronResources", [])
    page_info = result.get("page", {})
    current_page = page_info.get("number", 0)
    total_pages = page_info.get("totalPages", 0)

    return jsonify({
        "neurons": neurons,
        "page": page_info,
        "total_pages": total_pages,
        "current_page": current_page,
        "has_next": current_page < total_pages - 1,
        "has_prev": current_page > 0,
    })


@neuromorpho_routes.route("/save-cart", methods=["POST"])
def save_cart():
    """
    POST /neuromorpho/save-cart
    Header: X-Client-ID: <id>
    Body: { neuron_ids: [1234, 5678, ...] }

    NOTE: Can be used to download multiple SWC files at once into the
    client's session directory, instead of fetching them one by one via /swc/<id>.
    """
    storage = _get_storage()
    body = request.get_json(force=True, silent=True) or {}
    neuron_ids = body.get("neuron_ids", [])

    if not neuron_ids:
        return jsonify({"error": "neuron_ids is required"}), 400

    try:
        successes, failures = fetch_swc_files(neuron_ids)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    stored = []
    for neuron in successes:
        try:
            meta = storage.save_neuron(
                neuron_id=neuron.neuron_id,
                neuron_name=neuron.neuron_name,
                swc_content=neuron.swc_content,
                api_data=neuron.api_data,
                archive=neuron.archive_name,
            )
            stored.append(meta["file_path"])
        except Exception as e:
            failures.append({"neuron_id": neuron.neuron_id, "error": f"storage: {e}"})

    return jsonify({
        "success": len(stored) > 0,
        "total_requested": len(neuron_ids),
        "total_saved": len(stored),
        "total_failed": len(failures),
        "stored_files": stored,
        "failed": failures,
    })


@neuromorpho_routes.route("/neurons", methods=["GET"])
def list_neurons():
    """GET /neuromorpho/neurons  — list all saved neurons for the session."""
    storage = _get_storage()
    neurons = storage.list_neurons()
    return jsonify({"neuron_count": len(neurons), "neurons": neurons})


@neuromorpho_routes.route("/neurons/<int:neuron_id>", methods=["DELETE"])
def delete_neuron(neuron_id: int):
    """DELETE /neuromorpho/neurons/<id>"""
    storage = _get_storage()
    if storage.delete_neuron(neuron_id):
        return jsonify({"deleted": neuron_id})
    return jsonify({"error": f"Neuron {neuron_id} not found"}), 404


@neuromorpho_routes.route("/storage-info", methods=["GET"])
def storage_info():
    """GET /neuromorpho/storage-info  — disk usage for the session."""
    storage = _get_storage()
    return jsonify(storage.disk_usage())


@neuromorpho_routes.route("/swc/<int:neuron_id>", methods=["GET"])
def get_swc(neuron_id: int):
    """Fetch single SWC file. If name+archive are provided as query params,
    skips the metadata lookup round-trip for faster response."""
    name = request.args.get("name")
    archive = request.args.get("archive")

    try:
        if name and archive:
            successes, failures = fetch_swc_direct(archive, name, neuron_id)
        else:
            successes, failures = fetch_swc_files([neuron_id])

        if not successes:
            return jsonify({"error": f"Could not fetch SWC for neuron {neuron_id}", "details": failures}), 404

        neuron = successes[0]
        return neuron.swc_content, 200, {
            "Content-Type": "text/plain",
            "Content-Disposition": f"attachment; filename={neuron.neuron_name}.swc"
        }
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@neuromorpho_routes.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})
