##############################################
# neuromorpho.py — NeuroMorpho.org API client
##############################################
import asyncio
import datetime
import re
import httpx
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

_PRIMARY_URL  = "http://cngpro.gmu.edu:8080/api"
_FALLBACK_URL = "https://neuromorpho.org/api"


def _get_base_url() -> str:
    try:
        httpx.get(f"{_PRIMARY_URL}/neuron/fields/species", timeout=5)
        return _PRIMARY_URL
    except Exception:
        return _FALLBACK_URL


BASE_URL   = _get_base_url()
USER_AGENT = "www.mooseneuro.org/1.0 (contact: mooseneuro@gmail.com)"
_HEADERS   = {"User-Agent": USER_AGENT}


# ---------------------------------------------------------------------------
# Data container
# ---------------------------------------------------------------------------

@dataclass
class NeuronSWCData:
    neuron_id:    int
    neuron_name:  str
    archive_name: str
    swc_content:  str
    api_data:     Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# API calls
# ---------------------------------------------------------------------------

async def fetch_species() -> List[str]:
    async with httpx.AsyncClient(headers=_HEADERS, timeout=30) as client:
        resp = await client.get(f"{BASE_URL}/neuron/fields/species")
        resp.raise_for_status()
        return sorted(resp.json()["fields"])


async def search_neurons(
    species:      Optional[str] = None,
    brain_region: Optional[str] = None,
    cell_type:    Optional[str] = None,
    archive:      Optional[str] = None,
    page:         int = 0,
    size:         int = 20,
) -> Dict:
    body: Dict[str, List[str]] = {}
    if species:      body["species"]      = [species]
    if brain_region: body["brain_region"] = [brain_region]
    if cell_type:    body["cell_type"]    = [cell_type]
    if archive:      body["archive"]      = [archive]

    url = f"{BASE_URL}/neuron/select?page={page}&size={size}"
    async with httpx.AsyncClient(headers=_HEADERS, timeout=30) as client:
        resp = await client.post(url, json=body)

    if resp.status_code == 404:
        return {"_embedded": {"neuronResources": []}, "page": {"totalPages": 0, "number": 0, "totalElements": 0}}
    resp.raise_for_status()
    return resp.json()


async def fetch_neuron_metadata(species: str) -> Dict:
    """Fetch all brain regions/cell types/archives for a species.
    Remaining pages are fetched concurrently after the first response."""
    async with httpx.AsyncClient(headers=_HEADERS, timeout=40) as client:
        first_resp = await client.post(
            f"{BASE_URL}/neuron/select?page=0&size=500",
            json={"species": [species]},
        )
        first_resp.raise_for_status()
        first_data  = first_resp.json()
        total_pages = first_data.get("page", {}).get("totalPages", 1)

        if total_pages > 1:
            page_resps = await asyncio.gather(*[
                client.post(
                    f"{BASE_URL}/neuron/select?page={p}&size=500",
                    json={"species": [species]},
                )
                for p in range(1, total_pages)
            ], return_exceptions=True)
        else:
            page_resps = []

    brain_regions: set = set()
    cell_types:    set = set()
    archives:      set = set()

    all_pages = [first_data] + [
        r.json() for r in page_resps
        if not isinstance(r, Exception) and r.status_code == 200
    ]
    for data in all_pages:
        for n in data.get("_embedded", {}).get("neuronResources", []):
            _collect(brain_regions, n.get("brain_region"))
            _collect(cell_types,    n.get("cell_type"))
            _collect(archives,      n.get("archive"))

    return {
        "species":      [species],
        "brain_region": sorted(str(v) for v in brain_regions),
        "cell_type":    sorted(str(v) for v in cell_types),
        "archive":      sorted(str(v) for v in archives),
    }


async def fetch_neuron_by_id(neuron_id: int) -> Dict:
    async with httpx.AsyncClient(headers=_HEADERS, timeout=30) as client:
        resp = await client.get(f"{BASE_URL}/neuron/id/{neuron_id}")
        resp.raise_for_status()
        return resp.json()


def _coerce_list(v) -> str:
    return ', '.join(v) if isinstance(v, list) else (v or '')


async def fetch_literature_by_pmid(pmid: str) -> Optional[Dict]:
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=10) as client:
            resp = await client.get(
                f"{BASE_URL}/literature/select",
                params={"q": f"pmid:{pmid}", "size": 1},
            )
            resp.raise_for_status()
            resources = resp.json().get("_embedded", {}).get("publicationResources", [])
            return resources[0] if resources else None
    except Exception:
        return None


def _format_ref_text(lit: Dict) -> str:
    authors    = lit.get("authors") or []
    author_str = ", ".join(authors[:3])
    if len(authors) > 3:
        author_str += " et al."
    ms      = lit.get("publishedDate")
    year    = str(datetime.datetime.utcfromtimestamp(ms / 1000).year) if ms else ""
    title   = lit.get("title", "")
    journal = lit.get("journal", "")
    parts   = [p for p in [author_str, f"({year})" if year else "", title, journal] if p]
    return " ".join(parts)


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


async def neuron_to_details(neuron: Dict) -> Dict:
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
        detail['full_description'] = _strip_html(neuron['note'])

    pmids = [str(p) for p in (neuron.get('reference_pmid') or [])]
    dois  = neuron.get('reference_doi') or []

    if pmids:
        lit_results = await asyncio.gather(*[fetch_literature_by_pmid(p) for p in pmids])
        refs = []
        for i, (pmid, lit) in enumerate(zip(pmids, lit_results)):
            doi = dois[i] if i < len(dois) else None
            ref: Dict = {'pmid': pmid}
            if lit:
                ref['text'] = _format_ref_text(lit)
                doi = doi or lit.get('doi')
            else:
                ref['text'] = f"PMID: {pmid}"
            ref['url'] = (
                f"https://doi.org/{doi}" if doi and not doi.startswith('http')
                else doi or f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            )
            refs.append(ref)
        detail['references'] = refs

    if neuron.get('png_url'):
        detail['image_url'] = neuron['png_url']

    return detail


async def neuron_to_item(neuron: Dict) -> Dict:
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
        'details':         await neuron_to_details(neuron),
    }


async def fetch_archive_pmids(archive: str) -> List[str]:
    try:
        result = await search_neurons(archive=archive, size=500)
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


async def fetch_swc_direct(archive: str, name: str, neuron_id: int) -> Tuple[List[NeuronSWCData], List[Dict]]:
    url = f"https://neuromorpho.org/dableFiles/{archive.lower()}/CNG version/{name}.CNG.swc"
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=40) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return [], [{"neuron_id": neuron_id, "error": f"SWC download failed: HTTP {resp.status_code}"}]
        return [NeuronSWCData(
            neuron_id=neuron_id,
            neuron_name=name,
            archive_name=archive.lower(),
            swc_content=resp.text,
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
