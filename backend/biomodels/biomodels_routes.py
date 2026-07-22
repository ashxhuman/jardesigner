##############################################
# biomodels_routes.py — Flask routes for BioModels.org
##############################################
import traceback

from flask import Blueprint, jsonify, request

from .biomodels import search_models, get_model_detail, model_to_item

biomodels_routes = Blueprint("biomodels", __name__)


@biomodels_routes.route("/search", methods=["POST"])
def search():
    body  = request.get_json(force=True, silent=True) or {}
    query = (body.get("query") or "").strip()
    page  = int(body.get("page", 0))
    size  = int(body.get("size", 20))

    if not query:
        return jsonify({"models": [], "total": 0, "page": page})

    try:
        result = search_models(query, offset=page * size, size=size)
        return jsonify({
            "models": [model_to_item(m) for m in result["models"]],
            "total":  result["total"],
            "page":   page,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@biomodels_routes.route("/detail/<model_id>", methods=["GET"])
def detail(model_id):
    try:
        return jsonify(get_model_detail(model_id))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@biomodels_routes.route("/health", methods=["GET"])
def health():
    try:
        search_models("insulin", size=1)
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500
