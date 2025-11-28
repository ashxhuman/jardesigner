import asyncio
import ssl
from typing import Dict, List, Tuple
import httpx
import requests
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager
from .models import NeuronSWCData, APIError

# HTTP client configuration
NEUROMORPHO_BASE_URL = "http://cngpro.gmu.edu:8080/api/"
SEMAPHORE_LIMIT = 10

class CustomSSLAdapter(HTTPAdapter):
    """Custom SSL adapter with specific cipher configuration"""

    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        context = ssl.create_default_context()
        context.set_ciphers("DEFAULT:!DH")
        self.poolmanager = PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=context,
            **pool_kwargs,
        )

class HTTPClientManager:
    """Manages HTTP client instances with proper configuration"""
    HTTP_TIMEOUT = 40.0
    MAX_CONNECTIONS = 10
    MAX_KEEPALIVE_CONNECTIONS = 5
    SEMAPHORE_LIMIT = 10

    @staticmethod
    def get_async_client():
        """Get configured async HTTP client"""
        limits = httpx.Limits(
            max_connections=HTTPClientManager.MAX_CONNECTIONS,
            max_keepalive_connections=HTTPClientManager.MAX_KEEPALIVE_CONNECTIONS,
        )
        return httpx.AsyncClient(timeout=HTTPClientManager.HTTP_TIMEOUT, limits=limits)

    @staticmethod
    def get_sync_session():
        """Get configured sync HTTP session with custom SSL"""
        session = requests.Session()
        adapter = CustomSSLAdapter()
        session.mount("https://", adapter)
        return session

class NeuroMorphoAPI:
    """Handles all NeuroMorpho API interactions"""

    @staticmethod
    async def fetch_species() -> List[str]:
        """Fetch all available species from NeuroMorpho API"""
        async with HTTPClientManager.get_async_client() as client:
            try:
                response = await client.get(f"{NEUROMORPHO_BASE_URL}/neuron/fields/species")
                response.raise_for_status()
                return sorted(response.json()["fields"])
            except httpx.HTTPStatusError as e:
                raise APIError(f"Failed to fetch species: {e.response.text}", e.response.status_code)
            except Exception as e:
                raise APIError(f"An unexpected error occurred: {str(e)}")

    @staticmethod
    async def fetch_neuron_data(neuron_id: str) -> Dict:
        """Fetch neuron data by ID"""
        async with HTTPClientManager.get_async_client() as client:
            try:
                response = await client.get(f"{NEUROMORPHO_BASE_URL}/neuron/id/{neuron_id}")
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                raise APIError(f"Failed to fetch neuron data for ID {neuron_id}: {e.response.text}", e.response.status_code)
            except Exception as e:
                raise APIError(f"An unexpected error occurred: {str(e)}")

    @staticmethod
    async def fetch_page_data(species: str, page: int, semaphore: asyncio.Semaphore):
        """Fetch a single page of neuron data for a species"""
        async with semaphore:
            try:
                async with HTTPClientManager.get_async_client() as client:
                    response = await client.get(
                        f'{NEUROMORPHO_BASE_URL}/neuron/select?q=species:"{species}"&size:500&page={page}'
                    )
                    response.raise_for_status()
                    return response
            except Exception as e:
                print(f"Error fetching page {page}: {e}")
                return None

    @staticmethod
    def search_neurons(species: str, brain_region: str, cell_type: str, page: int = 0) -> Dict:
        """Search neurons with given criteria"""
        params = {"page": page}
        filter_queries = []

        if species:
            params["q"] = f'species:"{species}"'
        if brain_region:
            filter_queries.append(f"brain_region:{brain_region}")
        if cell_type:
            filter_queries.append(f"cell_type:{cell_type}")
        if filter_queries:
            params["fq"] = filter_queries
        
        try:
            response = requests.get(f"{NEUROMORPHO_BASE_URL}/neuron/select", params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            raise APIError(f"Failed to search neurons: {e.response.text}", e.response.status_code)
        except Exception as e:
            raise APIError(f"An unexpected error occurred: {str(e)}")
        

    
    @staticmethod
    def extract_metadata(neurons: List[Dict]) -> Dict[str, set]:
        """Extract brain regions, cell types, and archives from neuron data"""
        brain_regions = set()
        cell_types = set()
        archives = set()

        for neuron in neurons:
            # Handle brain_region
            if neuron.get("brain_region"):
                if isinstance(neuron["brain_region"], list):
                    brain_regions.update(neuron["brain_region"])
                else:
                    brain_regions.add(neuron["brain_region"])

            # Handle cell_type
            if neuron.get("cell_type"):
                if isinstance(neuron["cell_type"], list):
                    cell_types.update(neuron["cell_type"])
                else:
                    cell_types.add(neuron["cell_type"])

            # Handle archive
            if neuron.get("archive"):
                if isinstance(neuron["archive"], list):
                    archives.update(neuron["archive"])
                else:
                    archives.add(neuron["archive"])

        return {
            "brain_regions": brain_regions,
            "cell_types": cell_types,
            "archives": archives,
        }

    @staticmethod
    async def fetch_neuron_swc_data(neuron_ids: List[int]) -> Tuple[List[NeuronSWCData], List[Dict]]:
        """
        Process neuron data and return SWC file content.
        Returns a tuple of (successful_results, failed_neurons).
        """
        responses: List[NeuronSWCData] = []
        failed_neurons: List[Dict] = []

        session = HTTPClientManager.get_sync_session()

        try:
            for neuron_id in neuron_ids:
                try:
                    neuron_item = await NeuroMorphoAPI.fetch_neuron_data(str(neuron_id))
                    archive = neuron_item.get("archive", "").lower()
                    neuron_name = neuron_item.get("neuron_name", "")

                    if not archive or not neuron_name:
                        failed_neurons.append({"neuron_id": neuron_id, "error": "Missing archive or neuron_name in API response"})
                        continue

                    header = {"User-Agent": "MOOSENeuro / ashish@ncbs.res.in"}
                    swc_url = f"https://neuromorpho.org/dableFiles/{archive}/CNG version/{neuron_name}.CNG.swc"
                    
                    swc_response = session.get(swc_url, headers=header)
                    if swc_response.status_code != 200:
                        failed_neurons.append({"neuron_id": neuron_id, "error": f"Failed to download SWC file: HTTP {swc_response.status_code}"})
                        continue
                    
                    swc_content = swc_response.text
                    print(swc_content)
                    neuron_swc_data = NeuronSWCData(
                        neuron_id=neuron_id,
                        neuron_name=neuron_name,
                        archive_name=archive,
                        swc_content=swc_content,
                        api_data=neuron_item
                    )
                    responses.append(neuron_swc_data)
                except APIError as e:
                    failed_neurons.append({"neuron_id": neuron_id, "error": f"API error: {e.message}"})
                except Exception as e:
                    failed_neurons.append({"neuron_id": neuron_id, "error": f"Unexpected error: {str(e)}"})
        finally:
            session.close()

        return responses, failed_neurons
    
    @staticmethod
    async def fetch_all_metadata_for_species(species: str) -> Dict:
        """Fetch all metadata (brain regions, cell types, archives) for a given species."""
        semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)

        async with HTTPClientManager.get_async_client() as client:
            response = await client.get(
                f"{NEUROMORPHO_BASE_URL}/neuron/select?q=species:{species}"
            )
            data = response.json()
            total_pages = data.get("page", {}).get("totalPages", 1)

            tasks = [
                NeuroMorphoAPI.fetch_page_data(species, page, semaphore)
                for page in range(total_pages)
            ]
            responses = await asyncio.gather(*tasks)

            all_metadata = {
                "brain_regions": set(),
                "cell_types": set(),
                "archives": set(),
            }

            for resp in responses:
                if resp is None:
                    continue
                neurons = resp.json().get("_embedded", {}).get("neuronResources", [])
                metadata = NeuroMorphoAPI.extract_metadata(neurons)

                all_metadata["brain_regions"].update(metadata["brain_regions"])
                all_metadata["cell_types"].update(metadata["cell_types"])
                all_metadata["archives"].update(metadata["archives"])

            result = {
                "species": [species],
                "brain_region": list(all_metadata["brain_regions"]),
                "cell_type": list(all_metadata["cell_types"]),
                "archive": list(all_metadata["archives"]),
            }
            return result