##############################################
# icg.py — ICGenealogy channel database client
#
# Two data sources:
#   1. moose.channels — search corpus (ion_class, suffix, year, authors, gbar)
#   2. ICG REST API   — detail panel enrichment (classifications, notes, traces)
##############################################
import json
import os
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

try:
    import moose.channels as _mchan
except (ImportError, ModuleNotFoundError):
    _mchan = None

import httpx

ICG_API = "https://icg.neurotheory.ox.ac.uk/api/app"

_USER_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "user_uploads"
_CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "_icg_index_cache.json")
_CACHE_TTL  = 24 * 3600

# ── Lazy singletons ───────────────────────────────────────────────────────────
_opt_lock = threading.Lock()
_idx_lock = threading.Lock()

_options        = None
_icg_idx        = None
_icg_suffix_map = None
_icg_info_map   = None


# ── Disk cache ────────────────────────────────────────────────────────────────

def _load_disk_cache():
    try:
        if not os.path.exists(_CACHE_FILE):
            return None
        if time.time() - os.path.getmtime(_CACHE_FILE) > _CACHE_TTL:
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


# ── ICG REST API helpers ──────────────────────────────────────────────────────

def _icg_get(url: str, timeout: float = 15, retries: int = 2) -> httpx.Response:
    for attempt in range(retries + 1):
        try:
            with httpx.Client() as client:
                return client.get(url, timeout=timeout)
        except (httpx.TimeoutException, httpx.ConnectError):
            if attempt == retries:
                raise
            time.sleep(1.5 ** attempt)


def _fetch_family(fid: int) -> dict:
    try:
        resp = _icg_get(f"{ICG_API}/families/{fid}/")
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


def _fetch_all_families() -> tuple:
    idx, failed = {}, []
    with ThreadPoolExecutor(max_workers=5) as pool:
        partials = list(pool.map(_fetch_family, range(1, 6)))
    for fid, partial in enumerate(partials, start=1):
        if not partial:
            failed.append(fid)
        else:
            idx.update(partial)
    return idx, failed


def _fetch_icg_channel_detail(icg_id: int, fid) -> dict:
    resp = _icg_get(f"{ICG_API}/chs/{icg_id}/", timeout=10)
    if not resp.is_success:
        raise ValueError(f"ICG API returned {resp.status_code}")
    data = resp.json()
    if data.get("has_traces") and fid:
        data["trace_img_base"] = (
            f"https://icg.neurotheory.ox.ac.uk/static/icg/traces/{fid}_{icg_id}"
        )
    return data


# ── Lazy singletons ───────────────────────────────────────────────────────────

def get_icg_index() -> dict:
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
        idx, failed = _fetch_all_families()
        if not failed:
            _save_disk_cache(idx)
        else:
            print(f"[ICG] WARNING: families {failed} returned no data — cache not saved")
        _icg_idx = idx
    return _icg_idx


def _get_icg_suffix_map() -> dict:
    global _icg_suffix_map
    if _icg_suffix_map is not None:
        return _icg_suffix_map
    idx = get_icg_index()
    _icg_suffix_map = {
        info["icg_id"]: suf
        for (_mid, suf), info in idx.items()
        if info.get("icg_id")
    }
    return _icg_suffix_map


def get_icg_info_map() -> dict:
    global _icg_info_map
    if _icg_info_map is not None:
        return _icg_info_map
    idx = get_icg_index()
    _icg_info_map = {
        info["icg_id"]: info
        for info in idx.values()
        if info.get("icg_id")
    }
    return _icg_info_map


# ── Public API ────────────────────────────────────────────────────────────────

def get_options() -> dict:
    if _mchan is None:
        raise RuntimeError("moose.channels is not available — install pymoose")
    global _options
    if _options is not None:
        return _options
    with _opt_lock:
        if _options is not None:
            return _options
        all_results = _mchan.search(show=False)
        suffixes, years = set(), set()
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
                    suffixes_by_class.setdefault(ic, set()).add(suffix)
        _options = {
            "ion_classes":       _mchan.list_ion_classes(),
            "suffixes":          sorted(suffixes),
            "suffixes_by_class": {ic: sorted(s) for ic, s in suffixes_by_class.items()},
            "years":             sorted(years),
        }
    return _options


def search_channels(ion_class="", suffix="", author="", year="",
                    modeldb_id=None, icg_id="", sort_by="", sort_dir="desc",
                    page=0, size=None) -> dict:
    if _mchan is None:
        raise RuntimeError("moose.channels is not available — install pymoose")

    idx        = get_icg_index()
    suffix_map = _get_icg_suffix_map()

    mid_int = int(modeldb_id) if str(modeldb_id or "").isdigit() else None
    csv_results = _mchan.search(
        ion_class=ion_class or None,
        suffix=suffix       or None,
        author=author       or None,
        year=year           or None,
        modeldb_id=mid_int,
        show=False,
    )

    rows = []
    for model in csv_results:
        mid  = model["modeldb_id"]
        meta = model.get("meta", {})
        for sfx, gates in model.get("channels", {}).items():
            key = (int(mid), sfx) if mid else None
            g0  = gates[0] if gates else {}
            raw_icg_id = g0.get("icg_id", "") or meta.get("icg_id", "")
            try:
                icg_suffix = suffix_map.get(int(raw_icg_id), sfx)
            except (ValueError, TypeError):
                icg_suffix = sfx
            icg_info = (idx.get(key, {}) if key else {}) or (
                idx.get((int(mid), icg_suffix), {}) if mid and icg_suffix != sfx else {}
            )
            _cc = meta.get("citation_count", "")
            cites = icg_info["cites"] if "cites" in icg_info else (int(_cc) if _cc and _cc.isdigit() else 0)
            raw_icg_id = raw_icg_id or str(icg_info.get("icg_id", ""))
            title = meta.get("title", "")
            rows.append({
                "id":            f"{mid}_{sfx}",
                "modeldb_id":    mid,
                "icg_id":        raw_icg_id,
                "fid":           icg_info.get("fid"),
                "suffix":        sfx,
                "icg_suffix":    icg_suffix,
                "ion_class":     g0.get("ion_class", ""),
                "authors":       meta.get("authors", ""),
                "year":          str(meta.get("year", "")).strip(),
                "title":         title,
                "description":   title,
                "pubmedid":      meta.get("pubmedid", ""),
                "gbar_default":  float(g0["gbar_default"]) if g0.get("gbar_default") else None,
                "has_omnimodel": True,
                "in_icg":        bool(icg_info),
                "cites":         cites,
            })

    if icg_id:
        rows = [r for r in rows if str(r.get("icg_id", "")) == str(icg_id)]

    if sort_by in ("cites", "year"):
        rows.sort(
            key=lambda r: (r.get(sort_by) or 0) if sort_by == "cites" else (r.get(sort_by) or ""),
            reverse=(sort_dir != "asc"),
        )

    total = len(rows)
    page_rows = rows if size is None else rows[page * size: page * size + size]
    return {"channels": page_rows, "total": total, "page": page}


def get_channel_detail(modeldb_id: int, suffix: str) -> dict:
    fields = [
        {'label': 'ModelDB ID', 'value': str(modeldb_id)},
        {'label': 'Channel',    'value': suffix},
    ]
    result = {'fields': fields}

    if _mchan:
        try:
            csv_rows = _mchan.search(modeldb_id=modeldb_id, suffix=suffix, show=False)
            if csv_rows:
                meta     = csv_rows[0].get('meta', {})
                gates    = csv_rows[0].get('channels', {}).get(suffix, [])
                g0       = gates[0] if gates else {}
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
                    ref_text = ' '.join(filter(None, [authors, f'({year})' if year else None, title]))
                    result['references'] = [{'text': ref_text, 'pmid': pubmedid or None}]
        except Exception:
            traceback.print_exc()

    info = get_icg_index().get((modeldb_id, suffix), {})
    if info.get('icg_id'):
        try:
            data = _fetch_icg_channel_detail(info['icg_id'], info.get('fid'))
            ref = data.get('ref')
            if ref:
                ref_text = ' '.join(filter(None, [
                    ref.get('authors'),
                    f"({ref.get('date')})" if ref.get('date') else None,
                    ref.get('title'),
                ]))
                result['references'] = [{'text': ref_text, 'pmid': ref.get('id_pubmed')}]
                if ref.get('citations'):
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


def stage_channel(modeldb_id: int, suffix: str, client_id: str) -> dict:
    dest_dir = _USER_UPLOADS_DIR / client_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    ion_class, description = '', ''
    if _mchan:
        try:
            csv_rows = _mchan.search(modeldb_id=modeldb_id, suffix=suffix, show=False)
            if csv_rows:
                meta      = csv_rows[0].get('meta', {})
                gates     = csv_rows[0].get('channels', {}).get(suffix, [])
                g0        = gates[0] if gates else {}
                ion_class = g0.get('ion_class', '')
                title     = meta.get('title', '')
                year      = str(meta.get('year', '')).strip()
                description = ' '.join(filter(None, [title, f'({year})' if year else None]))
        except Exception:
            traceback.print_exc()

    server_file = f'{suffix}_{modeldb_id}'
    info = get_icg_index().get((modeldb_id, suffix), {})
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
    section    = registry.setdefault("chan", {"items": []})
    items_list = section.setdefault("items", [])
    for i, existing in enumerate(items_list):
        if existing.get("id") == item["id"]:
            items_list[i] = item
            break
    else:
        items_list.append(item)
    path.write_text(json.dumps(registry, indent=2))
    print(f"[ICG] Saved channel {item['id']} to {path}")

    return {'filename': server_file}
