"""
icg_routes.py — Flask routes for the ICGenealogy channel database.

Two data sources are combined:
  1. moose.channels — omnimodel parameters, ion_class, suffix, year, authors.
     Primary search corpus. Requires pymoose with channels subpackage.
  2. ICG REST API (icg.neurotheory.ox.ac.uk) — Neuron Type, Brain Area,
     Animal Model, Subtype metadata, has_traces, citation counts, and full
     publication info for the detail panel.
"""
import json
import os
import threading
import time
import traceback

try:
    import moose.channels as _mchan
except (ImportError, ModuleNotFoundError):
    _mchan = None

import requests
from flask import Blueprint, jsonify, request

icg_routes = Blueprint("icg", __name__)

ICG_API = "https://icg.neurotheory.ox.ac.uk/api/app"

# Class IDs we expose as filter dropdowns
_FILTER_CLASS_IDS = {4: "Subtype", 6: "Neuron Type", 7: "Animal Model",
                     8: "Brain Area", 9: "Neuron Region"}

# ── Singletons (built lazily, thread-safe) ────────────────────────────────────
_opt_lock = threading.Lock()
_idx_lock = threading.Lock()

_options = None   # {ion_classes, ion_counts, suffixes, years, api_classes}
_icg_idx = None   # {(modeldb_id_int, nmodl_suffix): {icg_id, cites, cls_raw, fid}}
_icg_suffix_map = None # {icg_id_int: nmodl_suffix} for URL construction
_icg_info_map = None   # {icg_id_int: {fid, cites, ...}} for direct detail lookup

_CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "_icg_index_cache.json")
_CACHE_TTL  = 24 * 3600  # rebuild cache after 24 h


def _load_disk_cache():
    """Return cached index from disk if it exists and is less than 24 h old."""
    try:
        if not os.path.exists(_CACHE_FILE):
            return None
        if (import_time := os.path.getmtime(_CACHE_FILE)) and \
                (__import__("time").time() - import_time > _CACHE_TTL):
            return None
        with open(_CACHE_FILE) as f:
            raw = json.load(f)
        # JSON keys are strings; restore to (int, str) tuples
        return {(int(k.split(",", 1)[0]), k.split(",", 1)[1]): v
                for k, v in raw.items()}
    except Exception:
        return None


def _save_disk_cache(idx):
    try:
        raw = {f"{k[0]},{k[1]}": v for k, v in idx.items()}
        with open(_CACHE_FILE, "w") as f:
            json.dump(raw, f)
    except Exception:
        traceback.print_exc()


try:
    import eventlet.tpool as _tpool
    def _blocking_get(url, timeout):
        return _tpool.execute(requests.get, url, timeout=timeout)
except ImportError:
    def _blocking_get(url, timeout):
        return requests.get(url, timeout=timeout)


def _icg_get(url, timeout=15, retries=2):
    """GET via a real OS thread (eventlet.tpool) with exponential-backoff retry.

    eventlet.monkey_patch() replaces the SSL layer with green equivalents that
    break when called from ThreadPoolExecutor threads.  tpool.execute() runs the
    blocking requests.get in a genuine OS thread while letting eventlet wait
    cooperatively, avoiding the Connection-reset-by-peer errors.
    """
    for attempt in range(retries + 1):
        try:
            return _blocking_get(url, timeout)
        except (requests.Timeout, requests.ConnectionError):
            if attempt == retries:
                raise
            time.sleep(1.5 ** attempt)


def _fetch_family(fid):
    """Fetch one ICG family and return a partial index dict."""
    try:
        resp = _icg_get(f"{ICG_API}/families/{fid}/")
        if not resp or not resp.ok:
            return {}
        result = {}
        for ch in resp.json().get("chans", []):
            mid    = ch.get("id_moddb")
            suffix = ch.get("name", "")
            if mid and suffix:
                result[(int(mid), suffix)] = {
                    "icg_id":  ch["id"],
                    "fid":     fid,
                    "cites":   int(ch.get("cites") or 0),
                    "cls_raw": ch.get("cls", {}),
                }
        return result
    except Exception:
        traceback.print_exc()
        return {}


def _get_icg_index():
    """
    Return {(modeldb_id_int, suffix): {icg_id, cites, cls_raw, fid}}.

    Load order:
      1. In-memory singleton (fastest)
      2. Disk cache (avoids network on restart, 24 h TTL)
      3. ICG REST API — families fetched sequentially with retry
    Failures are non-fatal; an empty dict is returned so searches degrade gracefully.
    """
    global _icg_idx
    if _icg_idx is not None:
        return _icg_idx
    with _idx_lock:
        if _icg_idx is not None:
            return _icg_idx
        cached = _load_disk_cache()
        if cached is not None:
            _icg_idx = cached
            return _icg_idx
        idx = {}
        failed = []
        for fid in range(1, 6):
            partial = _fetch_family(fid)
            if partial:
                idx.update(partial)
            else:
                failed.append(fid)
        # Only cache when every family loaded — a partial index causes silent gaps
        if not failed:
            _save_disk_cache(idx)
        elif failed:
            print(f"[ICG] WARNING: families {failed} returned no data — cache not saved")
        _icg_idx = idx
    return _icg_idx


def _get_icg_suffix_map():
    """Return {icg_id_int: nmodl_suffix} — built once from the family index.

    channel_db.csv stores the original .mod filename stem (e.g. 'Na_mit_usb')
    which differs from the NMODL SUFFIX declaration (e.g. 'nafast') used in
    ICG visualizer URLs.  icg_channel_meta.csv provides the icg_id that bridges
    both; this map resolves icg_id → correct URL suffix.
    """
    global _icg_suffix_map
    if _icg_suffix_map is not None:
        return _icg_suffix_map
    idx = _get_icg_index()
    _icg_suffix_map = {
        info["icg_id"]: suf
        for (_mid, suf), info in idx.items()
        if info.get("icg_id")
    }
    return _icg_suffix_map


def _get_icg_info_map():
    """Return {icg_id_int: info_dict} — built once from the family index.

    Allows O(1) fid/cites lookup by icg_id alone, so the detail route can
    work without a (modeldb_id, suffix) key.
    """
    global _icg_info_map
    if _icg_info_map is not None:
        return _icg_info_map
    idx = _get_icg_index()
    _icg_info_map = {
        info["icg_id"]: info
        for info in idx.values()
        if info.get("icg_id")
    }
    return _icg_info_map



def _get_options():
    """
    Build the options payload once:
      - ion_classes / ion_counts / suffixes / years  from moose.channels
      - api_classes (Neuron Type, Brain Area, …)     from ICG REST API
    """
    if _mchan is None:
        raise RuntimeError("moose.channels is not available — install pymoose: pip install pymoose")
    global _options
    if _options is not None:
        return _options
    with _opt_lock:
        if _options is not None:
            return _options

        all_results = _mchan.search(show=False)

        ion_counts = {}
        suffixes   = set()
        years      = set()
        for model in all_results:
            meta = model.get("meta", {})
            y = str(meta.get("year", "")).strip()
            if y:
                years.add(y)
            for suffix, gates in model.get("channels", {}).items():
                if suffix:
                    suffixes.add(suffix)
                ic = gates[0].get("ion_class", "") if gates else ""
                if ic:
                    ion_counts[ic] = ion_counts.get(ic, 0) + 1

        # Fetch class/subclass names from ICG API for the filter dropdowns
        api_classes = []
        try:
            resp = _icg_get(f"{ICG_API}/classes/")
            if resp.ok:
                for cls in resp.json():
                    cid = cls["id"]
                    if cid in _FILTER_CLASS_IDS:
                        api_classes.append({
                            "id":         cid,
                            "name":       _FILTER_CLASS_IDS[cid],
                            "subclasses": [{"id": s["id"], "name": s["name"]}
                                           for s in cls.get("subclasses", [])],
                        })
        except Exception:
            traceback.print_exc()

        _options = {
            "ion_classes": _mchan.list_ion_classes(),
            "ion_counts":  ion_counts,
            "suffixes":    sorted(suffixes),
            "years":       sorted(years),
            "api_classes": api_classes,
        }
    return _options


def _icg_allowed_keys(api_filters):
    """
    Given api_filters = {class_id_str: subclass_id_int}, return the set of
    (modeldb_id_int, suffix) keys from the ICG index that satisfy ALL filters.
    Returns None if no valid filter was specified (i.e. no restriction).
    """
    idx = _get_icg_index()
    allowed = None
    for cid_s, sid in api_filters.items():
        if not sid:
            continue
        try:
            cid = int(cid_s)
        except (ValueError, TypeError):
            continue

        matching = set()
        for key, info in idx.items():
            cls_raw = info.get("cls_raw", {})
            for k, sids in cls_raw.items():
                try:
                    k_int = int(k.lstrip("c_"))
                except (ValueError, AttributeError):
                    try:
                        k_int = int(k)
                    except (ValueError, TypeError):
                        continue
                if k_int == cid and sid in sids:
                    matching.add(key)
                    break
        allowed = matching if allowed is None else allowed & matching
    return allowed   # None means "no filter"


# ── Routes ────────────────────────────────────────────────────────────────────

@icg_routes.route("/options", methods=["GET"])
def options():
    try:
        return jsonify(_get_options())
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/search", methods=["POST"])
def search():
    """
    POST /icg/search
    Body: { ion_class, suffix, author, year, page, size, api_filters: { class_id_str: subclass_id_int } }

    Primary search runs against moose.channels (CSV-backed).
    Results are then:
      - intersected with ICG API class filters (Neuron Type, Brain Area, etc.)
      - enriched with has_traces / cites from the ICG family index
    Each model can have multiple suffixes; each (modeldb_id, suffix) pair
    becomes one row in the response.
    """
    body        = request.get_json(force=True, silent=True) or {}
    ion_class   = (body.get("ion_class")  or "").strip()
    suffix_q    = (body.get("suffix")     or "").strip()
    author_q    = (body.get("author")     or "").strip()
    year_q      = (body.get("year")       or "").strip()
    modeldb_q   = (body.get("modeldb_id") or "").strip()
    api_filters = body.get("api_filters") or {}
    sort_by     = (body.get("sort_by") or "").strip()
    sort_dir    = (body.get("sort_dir") or "desc").strip()
    page        = int(body.get("page", 0))
    size        = body.get("size")
    size        = int(size) if size is not None else None

    if _mchan is None:
        return jsonify({"error": "moose.channels is not available — install pymoose: pip install pymoose"}), 503

    try:
        idx = _get_icg_index()

        # 1. Primary search via moose.channels → [{modeldb_id, meta, channels}]
        mid_int = int(modeldb_q) if modeldb_q.isdigit() else None
        csv_results = _mchan.search(
            ion_class=ion_class  or None,
            suffix=suffix_q      or None,
            author=author_q      or None,
            year=year_q          or None,
            modeldb_id=mid_int,
            show=False,
        )

        # 2. ICG API class filter (optional)
        allowed_keys = _icg_allowed_keys(api_filters) if api_filters else None

        # 3. Expand each model × suffix into one flat row
        suffix_map = _get_icg_suffix_map()
        rows = []
        for model in csv_results:
            mid  = model["modeldb_id"]
            meta = model.get("meta", {})
            for suffix, gates in model.get("channels", {}).items():
                key      = (int(mid), suffix) if mid else None
                if allowed_keys is not None and key not in allowed_keys:
                    continue
                g0 = gates[0] if gates else {}
                # channel_db.csv has icg_id per (modeldb_id, suffix) — use it
                # directly; fall back to the model-level meta only if missing.
                raw_icg_id = g0.get("icg_id", "") or meta.get("icg_id", "")
                try:
                    icg_suffix = suffix_map.get(int(raw_icg_id), suffix)
                except (ValueError, TypeError):
                    icg_suffix = suffix
                # Look up by channel_db suffix first; if not found, retry with
                # ICG NMODL suffix (e.g. 'nafast' vs 'Na_mit_usb')
                icg_info = (idx.get(key, {}) if key else {}) or (
                    idx.get((int(mid), icg_suffix), {}) if mid and icg_suffix != suffix else {}
                )
                ic = g0.get("ion_class", "")
                _cc = meta.get("citation_count", "")
                cites = icg_info["cites"] if "cites" in icg_info else (int(_cc) if _cc and _cc.isdigit() else 0)
                raw_icg_id = raw_icg_id or str(icg_info.get("icg_id", ""))
                rows.append({
                    "id":            f"{mid}_{suffix}",
                    "modeldb_id":    mid,
                    "icg_id":        raw_icg_id,
                    "fid":           icg_info.get("fid"),
                    "suffix":        suffix,
                    "icg_suffix":    icg_suffix,
                    "ion_class":     ic,
                    "authors":       meta.get("authors", ""),
                    "year":          str(meta.get("year", "")).strip(),
                    "title":         meta.get("title", ""),
                    "pubmedid":      meta.get("pubmedid", ""),
                    "gbar_default":  float(g0["gbar_default"]) if g0.get("gbar_default") else None,
                    "has_omnimodel": True,
                    "in_icg":        bool(icg_info),
                    "cites":         cites,
                })

        if sort_by in ("cites", "year"):
            rows.sort(
                key=lambda r: (r.get(sort_by) or 0) if sort_by == "cites" else (r.get(sort_by) or ""),
                reverse=(sort_dir != "asc"),
            )

        total = len(rows)
        if size is None:
            page_rows = rows
        else:
            start = page * size
            page_rows = rows[start: start + size]
        return jsonify({
            "channels": page_rows,
            "total":    total,
            "page":     page,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/detail/icg/<int:icg_id>", methods=["GET"])
def detail_by_icg_id(icg_id):
    """
    GET /icg/detail/icg/<icg_id>
    Fetch full channel detail from ICG REST API using icg_id directly.
    Preferred over the (modeldb_id, suffix) route because icg_id is stable
    and avoids the channel_db suffix ≠ NMODL suffix mismatch.
    """
    try:
        info_map = _get_icg_info_map()
        info = info_map.get(icg_id, {})

        resp = _icg_get(f"{ICG_API}/chs/{icg_id}/", timeout=10)
        if not resp.ok:
            return jsonify({"error": f"ICG API returned {resp.status_code}"}), 502
        data = resp.json()
        if data.get("has_traces"):
            fid = info.get("fid", "")
            data["trace_img_base"] = (
                f"https://icg.neurotheory.ox.ac.uk/static/icg/traces/{fid}_{icg_id}"
            )
        return jsonify(data)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/detail/<int:modeldb_id>/<path:suffix>", methods=["GET"])
def detail(modeldb_id, suffix):
    """
    GET /icg/detail/<modeldb_id>/<suffix>
    Looks up the ICG channel id in the family index, then fetches full detail
    from the ICG REST API for display in the detail panel.
    """
    try:
        idx  = _get_icg_index()
        info = idx.get((modeldb_id, suffix))
        if not info:
            return jsonify({"error": "Channel not found in ICG index"}), 404

        resp = _icg_get(f"{ICG_API}/chs/{info['icg_id']}/", timeout=10)
        if not resp.ok:
            return jsonify({"error": f"ICG API returned {resp.status_code}"}), 502
        data = resp.json()
        if data.get("has_traces"):
            icg_id = info["icg_id"]
            fid    = info.get("fid", "")
            data["trace_img_base"] = (
                f"https://icg.neurotheory.ox.ac.uk/static/icg/traces/{fid}_{icg_id}"
            )
        return jsonify(data)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500



@icg_routes.route("/health", methods=["GET"])
def health():
    if _mchan is None:
        return jsonify({"status": "unavailable", "error": "moose.channels is not available — install pymoose: pip install pymoose"}), 503
    try:
        all_results = _mchan.search(show=False)
        idx = _get_icg_index()
        return jsonify({
            "status":       "ok",
            "csv_channels": sum(len(m.get("channels", {})) for m in all_results),
            "icg_indexed":  len(idx),
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500
