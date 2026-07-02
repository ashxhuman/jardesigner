##############################################
# neuromorpho.py — NeuroMorpho.org API client
#
# Handles all outbound HTTP requests to the NeuroMorpho API.
# Selects primary or fallback base URL on startup.
##############################################
import datetime
import re
import requests
import gevent
from dataclasses import dataclass, field
from gevent.pool import Pool
from typing import Any, Dict, List, Optional, Tuple

_PRIMARY_URL = "http://cngpro.gmu.edu:8080/api"
_FALLBACK_URL = "https://neuromorpho.org/api"

def _get_base_url() -> str:
    try:
        requests.get(f"{_PRIMARY_URL}/neuron/fields/species", timeout=5)
        return _PRIMARY_URL
    except Exception:
        return _FALLBACK_URL


BASE_URL = _get_base_url()
USER_AGENT = "www.mooseneuro.org/1.0 (contact: mooseneuro@gmail.com)"
_HEADERS = {"User-Agent": USER_AGENT}


# ---------------------------------------------------------------------------
# Data container
# ---------------------------------------------------------------------------

@dataclass
class NeuronSWCData:
    neuron_id: int
    neuron_name: str
    archive_name: str
    swc_content: str
    api_data: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# API calls
# ---------------------------------------------------------------------------

def fetch_species() -> List[str]:
    """Return a sorted list of all species available on NeuroMorpho."""
    resp = requests.get(f"{BASE_URL}/neuron/fields/species", headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    return sorted(resp.json()["fields"])


def search_neurons(
    species: Optional[str] = None,
    brain_region: Optional[str] = None,
    cell_type: Optional[str] = None,
    archive: Optional[str] = None,
    page: int = 0,
    size: int = 20,
) -> Dict:
    """Paginated neuron search. Returns the raw API JSON.

    Uses POST /neuron/select with a JSON body to avoid URL-encoding issues.
    Body format: {"field": ["value1", ...]}
    Pagination params go in the query string.
    """
    body: Dict[str, List[str]] = {}
    if species:
        body["species"] = [species]
    if brain_region:
        body["brain_region"] = [brain_region]
    if cell_type:
        body["cell_type"] = [cell_type]
    if archive:
        body["archive"] = [archive]

    url = f"{BASE_URL}/neuron/select?page={page}&size={size}"
    resp = requests.post(url, json=body, headers=_HEADERS, timeout=30)

    # NeuroMorpho returns 404 when query has no results — treat as empty, not error
    if resp.status_code == 404:
        return {"_embedded": {"neuronResources": []}, "page": {"totalPages": 0, "number": 0, "totalElements": 0}}

    resp.raise_for_status()
    return resp.json()


# Pages fetched concurrently per batch, and how many consecutive stale
# batches (no new brain_region/cell_type/archive values) before we stop.
# Measured against the live API: records aren't shuffled, so new archive
# names keep appearing almost to the last page for large species (Rat has
# 123 pages of 500 and still adds new archives at page 120) — the
# early-stop rarely fires. The real win is concurrency: batch size 25
# brings Rat from ~7min sequential to under a minute, tested error-free
# up to 60 concurrent against the live API.
_METADATA_BATCH_SIZE = 25
_METADATA_STALL_BATCHES = 2


def _fetch_metadata_page(species: str, page: int, retries: int = 1) -> Optional[Dict]:
    for attempt in range(retries + 1):
        try:
            r = requests.post(
                f"{BASE_URL}/neuron/select?page={page}&size=500",
                json={"species": [species]},
                headers=_HEADERS,
                timeout=40,
            )
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt < retries:
                gevent.sleep(1)
                continue
            print(f"[neuromorpho] page {page} failed after {attempt + 1} attempt(s): {e}")
            return None


def fetch_neuron_metadata(species: str) -> Dict:
    """
    Collect all brain regions, cell types, and archives for a species.

    Fetches pages in concurrent batches (gevent) and stops once a couple of
    consecutive batches add no new values, instead of walking every page
    sequentially — the latter never finishes in practice for large species
    like Rat. Cache the result on disk; see neuromorpho_routes.py.
    """
    first_data = _fetch_metadata_page(species, 0)
    if first_data is None:
        return {"species": [species], "brain_region": [], "cell_type": [], "archive": []}

    total_pages = first_data.get("page", {}).get("totalPages", 1)

    brain_regions: set = set()
    cell_types: set = set()
    archives: set = set()

    def _absorb(data: Dict) -> bool:
        """Merge a page's values into the running sets; return True if any were new."""
        before = len(brain_regions) + len(cell_types) + len(archives)
        for n in data.get("_embedded", {}).get("neuronResources", []):
            _collect(brain_regions, n.get("brain_region"))
            _collect(cell_types, n.get("cell_type"))
            _collect(archives, n.get("archive"))
        after = len(brain_regions) + len(cell_types) + len(archives)
        return after > before

    _absorb(first_data)

    stale_batches = 0
    page = 1
    while page < total_pages and stale_batches < _METADATA_STALL_BATCHES:
        batch = range(page, min(page + _METADATA_BATCH_SIZE, total_pages))
        pool = Pool(_METADATA_BATCH_SIZE)
        results = pool.map(lambda p, _species=species: _fetch_metadata_page(_species, p), batch)

        found_new = False
        for data in results:
            if data and _absorb(data):
                found_new = True

        stale_batches = 0 if found_new else stale_batches + 1
        page += _METADATA_BATCH_SIZE

    return {
        "species": [species],
        "brain_region": sorted(str(v) for v in brain_regions),
        "cell_type": sorted(str(v) for v in cell_types),
        "archive": sorted(str(v) for v in archives),
    }


def fetch_neuron_by_id(neuron_id: int) -> Dict:
    """Return the raw neuron record for a single neuron ID."""
    resp = requests.get(f"{BASE_URL}/neuron/id/{neuron_id}", headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _coerce_list(v) -> str:
    return ', '.join(v) if isinstance(v, list) else (v or '')


def neuron_to_item(neuron: Dict) -> Dict:
    """Map a raw NeuroMorpho neuron record to the ProtoPicker item schema."""
    nid = neuron['neuron_id']
    return {
        'id':              f"nm_{nid}",
        'name':            neuron.get('neuron_name', str(nid)),
        'source':          f"NeuroMorpho / {neuron.get('archive', '')}",
        'description':     ' '.join(filter(None, [
                               _coerce_list(neuron.get('species')),
                               _coerce_list(neuron.get('brain_region')),
                               _coerce_list(neuron.get('cell_type')),
                           ])),
        'source_type':     'file',
        'topTen':          False,
        'server_file':     f"nm_{nid}",
        'staged_filename': f"nm_{nid}",
        'details':         neuron_to_details(neuron),
    }


def fetch_archive_pmids(archive: str) -> List[str]:
    """Return all unique PMIDs from every neuron in this archive."""
    try:
        result = search_neurons(archive=archive, size=500)
        neurons = result.get("_embedded", {}).get("neuronResources", [])
        seen: set = set()
        pmids: List[str] = []
        for n in neurons:
            for p in (n.get("reference_pmid") or []):
                s = str(p)
                if s not in seen:
                    seen.add(s)
                    pmids.append(s)
        return pmids
    except Exception:
        return []


def fetch_literature_by_pmid(pmid: str) -> Optional[Dict]:
    """Fetch paper metadata from NeuroMorpho literature API by PMID."""
    try:
        resp = requests.get(
            f"{BASE_URL}/literature/select",
            params={"q": f"pmid:{pmid}", "size": 1},
            headers=_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        resources = resp.json().get("_embedded", {}).get("publicationResources", [])
        return resources[0] if resources else None
    except Exception:
        return None


def _format_ref_text(lit: Dict) -> str:
    authors = lit.get("authors") or []
    author_str = ", ".join(authors[:3])
    if len(authors) > 3:
        author_str += " et al."
    ms = lit.get("publishedDate")
    year = str(datetime.datetime.utcfromtimestamp(ms / 1000).year) if ms else ""
    title = lit.get("title", "")
    journal = lit.get("journal", "")
    parts = [p for p in [author_str, f"({year})" if year else "", title, journal] if p]
    return " ".join(parts)


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def neuron_to_details(neuron: Dict) -> Dict:
    """Build the ProtoPicker details object from a raw NeuroMorpho record."""
    raw_fields = [
        ('Archive',        neuron.get('archive')),
        ('Species',        _coerce_list(neuron.get('species'))),
        ('Brain Region',   _coerce_list(neuron.get('brain_region'))),
        ('Cell Type',      _coerce_list(neuron.get('cell_type'))),
        ('Age',            neuron.get('age_classification')),
        ('Gender',         neuron.get('gender')),
        ('Reconstruction', neuron.get('reconstruction_software')),
        ('Protocol',       neuron.get('protocol')),
    ]
    detail: Dict = {
        'fields': [{'label': k, 'value': v} for k, v in raw_fields if v],
    }

    if neuron.get('note'):
        detail['notes'] = _strip_html(neuron['note'])

    # reference_pmid and reference_doi are parallel arrays on the neuron record
    pmids = [str(p) for p in (neuron.get('reference_pmid') or [])]
    dois  = neuron.get('reference_doi') or []

    refs = []
    for i, pmid in enumerate(pmids):
        doi  = dois[i] if i < len(dois) else None
        ref: Dict = {'pmid': pmid}
        lit = fetch_literature_by_pmid(pmid)
        if lit:
            ref['text'] = _format_ref_text(lit)
            doi = doi or lit.get('doi')
        else:
            ref['text'] = f"PMID: {pmid}"
        if doi:
            ref['url'] = f"https://doi.org/{doi}" if not doi.startswith('http') else doi
        else:
            ref['url'] = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        refs.append(ref)

    if refs:
        detail['references'] = refs

    if neuron.get('png_url'):
        detail['image_url'] = neuron['png_url']

    return detail


def fetch_swc_direct(archive: str, name: str, neuron_id: int) -> Tuple[List["NeuronSWCData"], List[Dict]]:
    """
    Download a single SWC file when archive and neuron_name are already known.
    Skips the /neuron/id/{nid} metadata lookup — one fewer HTTP round-trip.
    """
    try:
        swc = requests.get(f"https://neuromorpho.org/dableFiles/{archive.lower()}/CNG version/{name}.CNG.swc", headers=_HEADERS, timeout=40)
        if swc.status_code != 200:
            return [], [{"neuron_id": neuron_id, "error": f"SWC download failed: HTTP {swc.status_code}"}]
        return [NeuronSWCData(
            neuron_id=neuron_id,
            neuron_name=name,
            archive_name=archive.lower(),
            swc_content=swc.text,
            api_data={},
        )], []
    except Exception as e:
        return [], [{"neuron_id": neuron_id, "error": str(e)}]


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------

def _collect(target: set, value) -> None:
    if isinstance(value, list):
        target.update(v for v in value if v)
    elif value:
        target.add(value)
