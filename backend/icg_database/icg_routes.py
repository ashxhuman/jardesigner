"""
icg_routes.py — Flask routes for the ICGenealogy channel database.

Two data sources are combined:
  1. moose.channels — omnimodel parameters, ion_class, suffix, year, authors.
     Primary search corpus. Requires pymoose with channels subpackage.
  2. ICG REST API (icg.neurotheory.ox.ac.uk) — Neuron Type, Brain Area,
     Animal Model, Subtype metadata, has_traces, citation counts, and full
     publication info for the detail panel.

All ICG REST API calls are async (httpx) and bridged to Flask via run_async()
from extensions.py, matching the neuromorpho/allenbrain pattern.
"""
import asyncio
import json
import os
import threading
import traceback
from pathlib import Path

try:
    import moose.channels as _mchan
except (ImportError, ModuleNotFoundError):
    _mchan = None

import httpx
from extensions import run_async
from flask import Blueprint, jsonify, request

icg_routes = Blueprint("icg", __name__)

ICG_API = "https://icg.neurotheory.ox.ac.uk/api/app"
_USER_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "user_uploads"

# Class IDs we expose as filter dropdowns
_FILTER_CLASS_IDS = {4: "Subtype", 6: "Neuron Type", 7: "Animal Model",
                     8: "Brain Area", 9: "Neuron Region"}

# ── Singletons (built lazily, thread-safe) ────────────────────────────────────
_opt_lock = threading.Lock()
_idx_lock = threading.Lock()

_options     = None   # {ion_classes, ion_counts, suffixes, years, api_classes}
_icg_idx     = None   # {(modeldb_id_int, nmodl_suffix): {icg_id, cites, cls_raw, fid}}
_icg_suffix_map = None  # {icg_id_int: nmodl_suffix}
_icg_info_map   = None  # {icg_id_int: {fid, cites, ...}}

_CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "_icg_index_cache.json")
_CACHE_TTL  = 24 * 3600  # rebuild cache after 24 h


# ── Disk cache helpers (sync, no network) ─────────────────────────────────────

def _load_disk_cache():
    try:
        if not os.path.exists(_CACHE_FILE):
            return None
        if __import__("time").time() - os.path.getmtime(_CACHE_FILE) > _CACHE_TTL:
            return None
        with open(_CACHE_FILE) as f:
            raw = json.load(f)
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


# ── Async ICG API helpers ─────────────────────────────────────────────────────

async def _icg_get_async(url: str, timeout: float = 15, retries: int = 2) -> httpx.Response:
    """Async GET with exponential-backoff retry."""
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient() as client:
                return await client.get(url, timeout=timeout)
        except (httpx.TimeoutException, httpx.ConnectError):
            if attempt == retries:
                raise
            await asyncio.sleep(1.5 ** attempt)


async def _fetch_family_async(fid: int) -> dict:
    """Fetch one ICG family and return a partial index dict."""
    try:
        resp = await _icg_get_async(f"{ICG_API}/families/{fid}/")
        if not resp or not resp.is_success:
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


async def _fetch_all_families_async() -> tuple:
    """Fetch all ICG families concurrently. Returns (idx_dict, failed_fids)."""
    partials = await asyncio.gather(
        *[_fetch_family_async(fid) for fid in range(1, 6)],
        return_exceptions=True,
    )
    idx, failed = {}, []
    for fid, partial in enumerate(partials, start=1):
        if isinstance(partial, Exception) or not partial:
            failed.append(fid)
        else:
            idx.update(partial)
    return idx, failed


async def _fetch_icg_channel_detail_async(icg_id: int, fid) -> dict:
    """Fetch raw ICG API channel data and inject trace_img_base when has_traces."""
    resp = await _icg_get_async(f"{ICG_API}/chs/{icg_id}/", timeout=10)
    if not resp.is_success:
        raise ValueError(f"ICG API returned {resp.status_code}")
    data = resp.json()
    if data.get("has_traces") and fid:
        data["trace_img_base"] = (
            f"https://icg.neurotheory.ox.ac.uk/static/icg/traces/{fid}_{icg_id}"
        )
    return data


async def _fetch_icg_classes_async() -> list:
    """Fetch classification groups from ICG API for filter dropdowns."""
    try:
        resp = await _icg_get_async(f"{ICG_API}/classes/")
        if not resp.is_success:
            return []
        api_classes = []
        for cls in resp.json():
            cid = cls["id"]
            if cid in _FILTER_CLASS_IDS:
                api_classes.append({
                    "id":         cid,
                    "name":       _FILTER_CLASS_IDS[cid],
                    "subclasses": [{"id": s["id"], "name": s["name"]}
                                   for s in cls.get("subclasses", [])],
                })
        return api_classes
    except Exception:
        traceback.print_exc()
        return []


# ── Sync accessors (lazy singletons, call run_async internally) ───────────────

def _get_icg_index() -> dict:
    """
    Return {(modeldb_id_int, suffix): {icg_id, cites, cls_raw, fid}}.

    Load order:
      1. In-memory singleton
      2. Disk cache (24 h TTL)
      3. ICG REST API — all 5 families fetched concurrently via run_async
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
        idx, failed = run_async(_fetch_all_families_async())
        if not failed:
            _save_disk_cache(idx)
        else:
            print(f"[ICG] WARNING: families {failed} returned no data — cache not saved")
        _icg_idx = idx
    return _icg_idx


def _get_icg_suffix_map() -> dict:
    """Return {icg_id_int: nmodl_suffix} — built once from the family index."""
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


def _get_icg_info_map() -> dict:
    """Return {icg_id_int: info_dict} — built once from the family index."""
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


def _get_options() -> dict:
    """
    Build options payload once:
      - ion_classes / ion_counts / suffixes / years  from moose.channels
      - api_classes (Neuron Type, Brain Area, …)     from ICG REST API (async)
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
        ion_counts, suffixes, years = {}, set(), set()
        suffixes_by_class = {}
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
                    suffixes_by_class.setdefault(ic, set()).add(suffix)

        _options = {
            "ion_classes":      sorted(ic for ic in ion_counts if ic),
            "ion_counts":       ion_counts,
            "suffixes":         sorted(suffixes),
            "suffixes_by_class": {ic: sorted(s) for ic, s in suffixes_by_class.items()},
            "years":            sorted(years),
            "api_classes":      run_async(_fetch_icg_classes_async()),
        }
    return _options


def _icg_allowed_keys(api_filters: dict):
    """
    Given api_filters = {class_id_str: subclass_id_int}, return the set of
    (modeldb_id_int, suffix) keys that satisfy ALL filters, or None (no filter).
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
            for k, sids in info.get("cls_raw", {}).items():
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
    return allowed


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
    Body: { ion_class, suffix, author, year, modeldb_id, icg_id, page, size,
            api_filters: { class_id_str: subclass_id_int } }
    """
    body        = request.get_json(force=True, silent=True) or {}
    ion_class   = (body.get("ion_class")  or "").strip()
    suffix_q    = (body.get("suffix")     or "").strip()
    author_q    = (body.get("author")     or "").strip()
    year_q      = (body.get("year")       or "").strip()
    modeldb_q   = (body.get("modeldb_id") or "").strip()
    icg_id_q    = (body.get("icg_id")    or "").strip()
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

        mid_int = int(modeldb_q) if modeldb_q.isdigit() else None
        csv_results = _mchan.search(
            ion_class=ion_class or None,
            suffix=suffix_q     or None,
            author=author_q     or None,
            year=year_q         or None,
            modeldb_id=mid_int,
            show=False,
        )

        allowed_keys = _icg_allowed_keys(api_filters) if api_filters else None
        suffix_map   = _get_icg_suffix_map()

        # Build cls_id → {name, subs:{sub_id: sub_name}} from api_classes
        try:
            api_classes = _get_options().get("api_classes", [])
        except Exception:
            api_classes = []
        cls_lookup = {
            cls['id']: {'name': cls['name'], 'subs': {s['id']: s['name'] for s in cls.get('subclasses', [])}}
            for cls in api_classes
        }

        rows = []
        for model in csv_results:
            mid  = model["modeldb_id"]
            meta = model.get("meta", {})
            for suffix, gates in model.get("channels", {}).items():
                key = (int(mid), suffix) if mid else None
                if allowed_keys is not None and key not in allowed_keys:
                    continue
                g0 = gates[0] if gates else {}
                raw_icg_id = g0.get("icg_id", "") or meta.get("icg_id", "")
                try:
                    icg_suffix = suffix_map.get(int(raw_icg_id), suffix)
                except (ValueError, TypeError):
                    icg_suffix = suffix
                icg_info = (idx.get(key, {}) if key else {}) or (
                    idx.get((int(mid), icg_suffix), {}) if mid and icg_suffix != suffix else {}
                )
                _cc = meta.get("citation_count", "")
                cites = icg_info["cites"] if "cites" in icg_info else (int(_cc) if _cc and _cc.isdigit() else 0)
                raw_icg_id = raw_icg_id or str(icg_info.get("icg_id", ""))

                # Build classification description from cls_raw
                cls_parts = []
                for cid, sub_ids in (icg_info.get("cls_raw") or {}).items():
                    try:
                        cid_int = int(str(cid).split('_')[-1])
                    except (ValueError, TypeError):
                        continue
                    grp = cls_lookup.get(cid_int)
                    if not grp or grp['name'] == 'Subtype':
                        continue
                    sub_names = [grp['subs'][sid] for sid in sub_ids if sid in grp['subs']]
                    if sub_names:
                        cls_parts.extend(sub_names)
                title = meta.get("title", "")
                description = ', '.join(filter(None, cls_parts + ([title] if title else [])))

                rows.append({
                    "id":            f"{mid}_{suffix}",
                    "modeldb_id":    mid,
                    "icg_id":        raw_icg_id,
                    "fid":           icg_info.get("fid"),
                    "suffix":        suffix,
                    "icg_suffix":    icg_suffix,
                    "ion_class":     g0.get("ion_class", ""),
                    "authors":       meta.get("authors", ""),
                    "year":          str(meta.get("year", "")).strip(),
                    "title":         title,
                    "description":   description,
                    "pubmedid":      meta.get("pubmedid", ""),
                    "gbar_default":  float(g0["gbar_default"]) if g0.get("gbar_default") else None,
                    "has_omnimodel": True,
                    "in_icg":        bool(icg_info),
                    "cites":         cites,
                })

        if icg_id_q:
            rows = [r for r in rows if str(r.get("icg_id", "")) == icg_id_q]

        if sort_by in ("cites", "year"):
            rows.sort(
                key=lambda r: (r.get(sort_by) or 0) if sort_by == "cites" else (r.get(sort_by) or ""),
                reverse=(sort_dir != "asc"),
            )

        total = len(rows)
        page_rows = rows if size is None else rows[page * size: page * size + size]
        return jsonify({"channels": page_rows, "total": total, "page": page})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/detail/icg/<int:icg_id>", methods=["GET"])
def detail_by_icg_id(icg_id):
    """GET /icg/detail/icg/<icg_id> — raw ICG API response with trace_img_base injected."""
    try:
        info = _get_icg_info_map().get(icg_id, {})
        return jsonify(run_async(_fetch_icg_channel_detail_async(icg_id, info.get("fid"))))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@icg_routes.route("/detail/<int:modeldb_id>/<path:suffix>", methods=["GET"])
def detail(modeldb_id, suffix):
    """GET /icg/detail/<modeldb_id>/<suffix> — raw ICG API response with trace_img_base injected."""
    try:
        info = _get_icg_index().get((modeldb_id, suffix))
        if not info:
            return jsonify({"error": "Channel not found in ICG index"}), 404
        return jsonify(run_async(_fetch_icg_channel_detail_async(info["icg_id"], info.get("fid"))))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def get_channel_detail(modeldb_id: int, suffix: str) -> dict:
    """Return a DetailRenderer-compatible dict for an ICG channel.

    Always populates from moose.channels CSV first (guaranteed available),
    then enriches with ICG API data (classification, notes, publication) when
    reachable. If the ICG API is down the CSV data still shows in the panel.
    """
    fields = [
        {'label': 'ModelDB ID', 'value': str(modeldb_id)},
        {'label': 'Channel',    'value': suffix},
    ]
    result: dict = {'fields': fields}

    # ── CSV fallback (always populated) ──────────────────────────────────────
    if _mchan:
        try:
            csv_rows = _mchan.search(modeldb_id=modeldb_id, suffix=suffix, show=False)
            if csv_rows:
                meta  = csv_rows[0].get('meta', {})
                gates = csv_rows[0].get('channels', {}).get(suffix, [])
                g0    = gates[0] if gates else {}
                if g0.get('ion_class'):
                    fields.append({'label': 'Ion Class', 'value': g0['ion_class']})
                authors  = meta.get('authors', '')
                title    = meta.get('title', '')
                year     = str(meta.get('year', '')).strip()
                pubmedid = str(meta.get('pubmedid', '')).strip()
                cites    = str(meta.get('citation_count', '')).strip()
                if cites:
                    fields.append({'label': 'Citations', 'value': cites})
                if authors or title:
                    ref_text = ' '.join(filter(None, [
                        authors,
                        f'({year})' if year else None,
                        title,
                    ]))
                    result['references'] = [{'text': ref_text, 'pmid': pubmedid or None}]
        except Exception:
            traceback.print_exc()

    # ── ICG API enrichment (classification + notes, overrides CSV publication) ─
    info = _get_icg_index().get((modeldb_id, suffix), {})
    if info.get('icg_id'):
        try:
            data = run_async(_fetch_icg_channel_detail_async(info['icg_id'], info.get('fid')))

            ref = data.get('ref')
            if ref:
                ref_text = ' '.join(filter(None, [
                    ref.get('authors'),
                    f"({ref.get('date')})" if ref.get('date') else None,
                    ref.get('title'),
                ]))
                result['references'] = [{'text': ref_text, 'pmid': ref.get('id_pubmed')}]
                if ref.get('citations'):
                    # replace CSV citations field with more accurate ICG value
                    fields[:] = [f for f in fields if f['label'] != 'Citations']
                    fields.append({'label': 'Citations', 'value': str(ref['citations'])})

            for grp in (data.get('cls') or []):
                if 'runtime' in grp.get('name', '').lower():
                    continue
                names = [c['name'] for c in grp.get('cls', []) if c.get('name')]
                if names:
                    fields.append({'label': grp['name'], 'value': ', '.join(names)})

            skip = {'runtime', 'temperature'}
            notes = [
                f"{m['name']}: {m['value']}"
                for m in (data.get('metadata') or [])
                if m.get('value') and not any(s in m.get('name', '').lower() for s in skip)
            ]
            if notes:
                result['notes'] = '\n'.join(notes)

        except Exception:
            traceback.print_exc()

    return result

def _upsert_channel_registry(dest_dir: Path, item: dict) -> None:
    """Upsert item into user_registry.json under the 'chan' section."""
    path = dest_dir / "user_registry.json"
    try:
        registry = json.loads(path.read_text())
    except FileNotFoundError:
        registry = {}
    except json.JSONDecodeError:
        print(f"[ICG] WARNING: {path} is corrupt — resetting")
        registry = {}
    registry.setdefault("morpho", {"items": []})
    registry.setdefault("chem",   {"items": []})
    section = registry.setdefault("chan", {"items": []})
    items_list = section.setdefault("items", [])
    for i, existing in enumerate(items_list):
        if existing.get("id") == item["id"]:
            items_list[i] = item
            break
    else:
        items_list.append(item)
    path.write_text(json.dumps(registry, indent=2))
    print(f"[ICG] Saved channel {item['id']} to {path}")


def stage_channel(modeldb_id: int, suffix: str, client_id: str) -> dict:
    """Save an ICG channel to the session user_registry.json.

    No file to download — just records metadata so the item appears in the
    Local tab on refresh. Follows the same pattern as neuromorpho stage_neuron.
    """
    dest_dir = _USER_UPLOADS_DIR / client_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    ion_class, description = '', ''
    if _mchan:
        try:
            csv_rows = _mchan.search(modeldb_id=modeldb_id, suffix=suffix, show=False)
            if csv_rows:
                meta  = csv_rows[0].get('meta', {})
                gates = csv_rows[0].get('channels', {}).get(suffix, [])
                g0    = gates[0] if gates else {}
                ion_class   = g0.get('ion_class', '')
                title = meta.get('title', '')
                year  = str(meta.get('year', '')).strip()
                description = ' '.join(filter(None, [title, f'({year})' if year else None]))
        except Exception:
            traceback.print_exc()

    server_file = f'{suffix}_{modeldb_id}'
    info = _get_icg_index().get((modeldb_id, suffix), {})
    item = {
        'id':          f'icg_{modeldb_id}_{suffix}',
        'name':        f'{suffix}_{modeldb_id}',
        'source':      f'ICG/{ion_class}' if ion_class else 'ICG',
        'description': description,
        'source_type': 'file',
        'server_file': server_file,
        'modeldb_id':  modeldb_id,
        'suffix':      suffix,
        'icg_id':      str(info.get('icg_id', '')),
        'fid':         info.get('fid'),
        'details':     get_channel_detail(modeldb_id, suffix),
    }
    _upsert_channel_registry(dest_dir, item)
    return {'filename': server_file}


@icg_routes.route("/health", methods=["GET"])
def health():
    if _mchan is None:
        return jsonify({"status": "unavailable", "error": "moose.channels is not available"}), 503
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
