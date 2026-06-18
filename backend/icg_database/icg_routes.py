##############################################
# icg_routes.py — Flask routes for ICGenealogy
##############################################
import traceback

from flask import Blueprint, jsonify, request

from .icg import (
    get_options,
    search_channels,
    get_channel_detail,
    get_icg_index,
    get_icg_info_map,
    stage_channel,
)

try:
    import moose.channels as _mchan
except (ImportError, ModuleNotFoundError):
    _mchan = None

icg_routes = Blueprint("icg", __name__)


@icg_routes.route("/options", methods=["GET"])
def options():
    try:
        return jsonify(get_options())
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/search", methods=["POST"])
def search():
    body     = request.get_json(force=True, silent=True) or {}
    size_raw = body.get("size")
    try:
        result = search_channels(
            ion_class  = (body.get("ion_class")  or "").strip(),
            suffix     = (body.get("suffix")     or "").strip(),
            author     = (body.get("author")     or "").strip(),
            year       = (body.get("year")       or "").strip(),
            modeldb_id = (body.get("modeldb_id") or "").strip(),
            icg_id     = (body.get("icg_id")     or "").strip(),
            sort_by    = (body.get("sort_by")    or "").strip(),
            sort_dir   = (body.get("sort_dir")   or "desc").strip(),
            page       = int(body.get("page", 0)),
            size       = int(size_raw) if size_raw is not None else None,
        )
        return jsonify(result)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/detail/icg/<int:icg_id>", methods=["GET"])
def detail_by_icg_id(icg_id):
    try:
        info = get_icg_info_map().get(icg_id, {})
        return jsonify(get_channel_detail(info.get("modeldb_id", 0), info.get("suffix", "")))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/detail/<int:modeldb_id>/<path:suffix>", methods=["GET"])
def detail(modeldb_id, suffix):
    try:
        info = get_icg_index().get((modeldb_id, suffix))
        if not info:
            return jsonify({"error": "Channel not found in ICG index"}), 404
        return jsonify(get_channel_detail(modeldb_id, suffix))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/health", methods=["GET"])
def health():
    if _mchan is None:
        return jsonify({"status": "unavailable", "error": "moose.channels not available"}), 503
    try:
        idx = get_icg_index()
        return jsonify({"status": "ok", "icg_indexed": len(idx)})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500
