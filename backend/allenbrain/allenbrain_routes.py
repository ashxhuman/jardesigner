##############################################
# allenbrain_routes.py — Flask routes for Allen Brain Cell Types Database
# CORS handled globally in server.py.
##############################################
import traceback
from pathlib import Path

from flask import Blueprint, jsonify, request

import json

from extensions import run_async
from .allenbrain import (
    fetch_species_options,
    search_neurons,
    fetch_swc_for_specimen,
    fetch_morph_thumb,
    fetch_specimen_by_id,
    specimen_to_details,
)

allenbrain_routes = Blueprint("allenbrain", __name__)

USER_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "user_uploads"


@allenbrain_routes.route("/metadata", methods=["GET"])
def get_species_filters():
    """
    GET /allenbrain/metadata?species=<name>
    Returns brain areas, layers, and transgenic lines for the given species.
    """
    species = request.args.get("species", "").strip()
    if not species:
        return jsonify({"error": "species query param required"}), 400
    try:
        return jsonify(run_async(fetch_species_options(species)))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@allenbrain_routes.route("/search", methods=["POST"])
def search():
    """
    POST /allenbrain/search
    Body: { species?, brain_area_acronym?, brain_area_parent_acronym?,
            layer?, dendrite_type?, apical?, reconstruction_type?,
            line_name?, page?, size? }
    """
    body = request.get_json(force=True, silent=True) or {}
    try:
        size = max(1, int(body.get("size", 20)))
        page = max(0, int(body.get("page", 0)))
    except (TypeError, ValueError):
        return jsonify({"error": "page and size must be integers"}), 400

    try:
        result = run_async(search_neurons(
            species                   = body.get("species")                   or None,
            brain_area_acronym        = body.get("brain_area_acronym")        or None,
            brain_area_parent_acronym = body.get("brain_area_parent_acronym") or None,
            layer                     = body.get("layer")                     or None,
            line_name                 = body.get("line_name")                 or None,
            page                      = page,
            size                      = size,
        ))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    total       = result["total"]
    total_pages = max(1, -(-total // size))

    return jsonify({
        "neurons":     result["neurons"],
        "total":       total,
        "page":        page,
        "total_pages": total_pages,
    })


@allenbrain_routes.route("/thumb/<int:file_id>", methods=["GET"])
def get_thumb(file_id: int):
    """GET /allenbrain/thumb/<file_id> — proxy morphology thumbnail."""
    try:
        img_bytes, content_type = run_async(fetch_morph_thumb(file_id))
        return img_bytes, 200, {"Content-Type": content_type}
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def stage_specimen(specimen_id: int, client_id: str) -> dict:
    """Download SWC for specimen_id and save to the user's session directory."""
    swc_text, filename = run_async(fetch_swc_for_specimen(specimen_id))
    dest_dir = USER_UPLOADS_DIR / client_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / filename).write_text(swc_text, encoding="utf-8")

    try:
        s       = run_async(fetch_specimen_by_id(specimen_id))
        details = specimen_to_details(s)

        def _str(v):
            return str(v).strip().strip('"').strip() if v not in (None, '') else ''

        item = {
            "id":          f"ab_{specimen_id}",
            "name":        filename.replace(".swc", ""),
            "source":      f"AllenBrain/{_str(s.get('donor__species'))}",
            "description": " ".join(filter(None, [
                _str(s.get("structure__name")),
                _str(s.get("structure__layer")),
                _str(s.get("tag__dendrite_type")),
            ])),
            "source_type":     "file",
            "file_type":       "swc",
            "server_file":     filename,
            "staged_filename": filename,
            "details":     details,
        }
        _upsert_user_registry(dest_dir, item)
    except Exception:
        pass  # registry update is best-effort; don't fail the download

    return {"filename": filename}


def _upsert_user_registry(dest_dir, item: dict) -> None:
    path = dest_dir / "user_registry.json"
    try:
        registry = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        registry = {}
    section = registry.setdefault("morpho", {"items": []})
    items = section.setdefault("items", [])
    for i, existing in enumerate(items):
        if existing.get("id") == item["id"]:
            items[i] = item
            break
    else:
        items.append(item)
    path.write_text(json.dumps(registry, indent=2))


@allenbrain_routes.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})
