import ssl
import requests
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

BASE_URL = "http://cngpro.gmu.edu:8080/api"


# ---------------------------------------------------------------------------
# SSL adapter — strips DH ciphers that neuromorpho.org rejects
# ---------------------------------------------------------------------------

class _SSLAdapter(HTTPAdapter):
    def init_poolmanager(self, connections, maxsize, block=False, **kwargs):
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT:!DH")
        self.poolmanager = PoolManager(
            num_pools=connections, maxsize=maxsize, block=block,
            ssl_context=ctx, **kwargs
        )


def _session() -> requests.Session:
    s = requests.Session()
    s.mount("https://", _SSLAdapter())
    return s


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
    resp = requests.get(f"{BASE_URL}/neuron/fields/species", timeout=30)
    resp.raise_for_status()
    return sorted(resp.json()["fields"])


def search_neurons(
    species: Optional[str] = None,
    brain_region: Optional[str] = None,
    cell_type: Optional[str] = None,
    page: int = 0,
) -> Dict:
    """Paginated neuron search. Returns the raw API JSON.

    Uses a list-of-tuples for params so repeated 'fq' keys are preserved.
    Values are quoted so Solr handles multi-word names (e.g. "basal ganglia").
    """
    
    params: List[tuple] = [("page", page)]
    if species:
        params.append(("q", f'species:"{species}"'))

    print(f"[search_neurons] GET {BASE_URL}/neuron/select params={params}")
    resp = requests.get(f"{BASE_URL}/neuron/select", params=params, timeout=30)
    print(f"[search_neurons] status={resp.status_code}")

    # NeuroMorpho returns 404 when query has no results — treat as empty, not error
    if resp.status_code == 404:
        return {"_embedded": {"neuronResources": []}, "page": {"totalPages": 0, "number": 0, "totalElements": 0}}

    resp.raise_for_status()
    return resp.json()


def fetch_neuron_metadata(species: str) -> Dict:
    """
    Collect all brain regions, cell types, and archives for a species.

    This fetches every page sequentially — it's the slow call (~5-20s for
    large species). Cache the result on disk; see neuromorpho_routes.py.
    """
    # Get total page count using the same page size as the loop below.
    # Without size=500 the API returns totalPages based on ~20 items/page,
    # but the loop fetches 500/page — so page counts differ and 404s appear.
    resp = requests.get(
        f"{BASE_URL}/neuron/select",
        params={"q": f'species:"{species}"', "size": 500},
        timeout=30,
    )
    resp.raise_for_status()
    total_pages = resp.json().get("page", {}).get("totalPages", 1)

    brain_regions: set = set()
    cell_types: set = set()
    archives: set = set()

    for page in range(total_pages):
        try:
            r = requests.get(
                f"{BASE_URL}/neuron/select",
                params={"q": f'species:"{species}"', "size": 500, "page": page},
                timeout=40,
            )
            # 404 means the page doesn't exist — stop iterating, don't crash
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

    # sorted() requires all items to be the same type — cast to str to be safe
    return {
        "species": [species],
        "brain_region": sorted(str(v) for v in brain_regions),
        "cell_type": sorted(str(v) for v in cell_types),
        "archive": sorted(str(v) for v in archives),
    }


def fetch_swc_files(neuron_ids: List[int]) -> Tuple[List[NeuronSWCData], List[Dict]]:
    """
    Download SWC files for a list of neuron IDs.
    Returns (successes, failures) where each failure is {neuron_id, error}.
    """
    successes: List[NeuronSWCData] = []
    failures: List[Dict] = []
    session = _session()

    try:
        for nid in neuron_ids:
            try:
                # Look up the neuron record to get archive + name
                meta = requests.get(f"{BASE_URL}/neuron/id/{nid}", timeout=30)
                meta.raise_for_status()
                item = meta.json()

                archive = item.get("archive", "").lower()
                name = item.get("neuron_name", "")

                if not archive or not name:
                    failures.append({"neuron_id": nid, "error": "Missing archive or neuron_name"})
                    continue

                # Download the SWC file from neuromorpho.org
                url = f"https://neuromorpho.org/dableFiles/{archive}/CNG version/{name}.CNG.swc"
                swc = session.get(url, headers={"User-Agent": "MOOSENeuro / ashish@ncbs.res.in"}, timeout=40)

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
    finally:
        session.close()

    return successes, failures


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------

def _collect(target: set, value) -> None:
    if isinstance(value, list):
        target.update(v for v in value if v)
    elif value:
        target.add(value)