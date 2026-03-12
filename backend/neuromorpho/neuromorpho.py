import requests
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

BASE_URL = "http://cngpro.gmu.edu:8080/api"
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

    url = f"{BASE_URL}/neuron/select?page={page}&size={size}"
    print(f"[search_neurons] POST {url} body={body}")
    resp = requests.post(url, json=body, headers=_HEADERS, timeout=30)
    print(f"[search_neurons] status={resp.status_code}")

    # NeuroMorpho returns 404 when query has no results — treat as empty, not error
    if resp.status_code == 404:
        return {"_embedded": {"neuronResources": []}, "page": {"totalPages": 0, "number": 0, "totalElements": 0}}

    resp.raise_for_status()
    data = resp.json()
    neurons = data.get("_embedded", {}).get("neuronResources", [])
    print(f"[search_neurons] total_elements={data.get('page', {}).get('totalElements')} returned={len(neurons)}")
    return data


def fetch_neuron_metadata(species: str) -> Dict:
    """
    Collect all brain regions, cell types, and archives for a species.

    This fetches every page sequentially — it's the slow call (~5-20s for
    large species). Cache the result on disk; see neuromorpho_routes.py.
    """
    # Get total page count using the same page size as the loop below.
    # Without size=500 the API returns totalPages based on ~20 items/page,
    # but the loop fetches 500/page — so page counts differ and 404s appear.
    resp = requests.post(
        f"{BASE_URL}/neuron/select?page=0&size=500",
        json={"species": [species]},
        headers=_HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    total_pages = resp.json().get("page", {}).get("totalPages", 1)

    brain_regions: set = set()
    cell_types: set = set()
    archives: set = set()

    for page in range(total_pages):
        try:
            r = requests.post(
                f"{BASE_URL}/neuron/select?page={page}&size=500",
                json={"species": [species]},
                headers=_HEADERS,
                timeout=40,
            )
            if r.status_code == 404:
                break
            r.raise_for_status()
            neurons = r.json().get("_embedded", {}).get("neuronResources", [])
            for n in neurons:
                _collect(brain_regions, n.get("brain_region"))
                _collect(cell_types, n.get("cell_type"))
                _collect(archives, n.get("archive"))
        except Exception as e:
            print(f"[neuromorpho] page {page} failed: {e}")

    return {
        "species": [species],
        "brain_region": sorted(str(v) for v in brain_regions),
        "cell_type": sorted(str(v) for v in cell_types),
        "archive": sorted(str(v) for v in archives),
    }


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


def fetch_swc_files(neuron_ids: List[int]) -> Tuple[List[NeuronSWCData], List[Dict]]:
    """
    Download SWC files for a list of neuron IDs.
    Returns (successes, failures) where each failure is {neuron_id, error}.
    """
    successes: List[NeuronSWCData] = []
    failures: List[Dict] = []
    for nid in neuron_ids:
        try:
            # Look up the neuron record to get archive + name
            meta = requests.get(f"{BASE_URL}/neuron/id/{nid}", headers=_HEADERS, timeout=30)
            meta.raise_for_status()
            item = meta.json()

            archive = item.get("archive", "").lower()
            name = item.get("neuron_name", "")

            if not archive or not name:
                failures.append({"neuron_id": nid, "error": "Missing archive or neuron_name"})
                continue

            # Download the SWC file from neuromorpho.org
            swc = requests.get(f"https://neuromorpho.org/dableFiles/{archive}/CNG version/{name}.CNG.swc", headers=_HEADERS, timeout=40)

            if swc.status_code != 200:
                failures.append({"neuron_id": nid, "error": f"SWC download failed: HTTP {swc.status_code}"})
                continue

            successes.append(NeuronSWCData(
                neuron_id=nid,
                neuron_name=name,
                archive_name=archive,
                swc_content=swc.text,
                api_data=item,
            ))

        except Exception as e:
            failures.append({"neuron_id": nid, "error": str(e)})

    return successes, failures


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------

def _collect(target: set, value) -> None:
    if isinstance(value, list):
        target.update(v for v in value if v)
    elif value:
        target.add(value)