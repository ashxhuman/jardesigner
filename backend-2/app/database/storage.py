import json
from pathlib import Path, PurePath
from typing import List, Dict

# Configuration
user_upload = Path("../backend/user_uploads").resolve()
LOCAL_STORAGE_DIR = user_upload / "local_storage"
SWC_DIR = LOCAL_STORAGE_DIR / "swc" / "neuromorpho"
CLIENT_DATA_DIR = LOCAL_STORAGE_DIR / "client_data"
METADATA_DIR = LOCAL_STORAGE_DIR / "metadata"

# Ensure directories exist
for directory in [SWC_DIR, CLIENT_DATA_DIR, METADATA_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

class LocalStorageManager:
    """Handles all local storage operations"""

    @staticmethod
    def save_client_metadata(client_name: str, metadata: Dict):
        """Save client metadata to local JSON file"""
        client_file = METADATA_DIR / f"{client_name.lower()}.json"

        existing_data = []
        if client_file.exists():
            with open(client_file, "r") as f:
                existing_data = json.load(f)

        existing_data.append(metadata)

        with open(client_file, "w") as f:
            json.dump(existing_data, f, indent=2, default=str)

    @staticmethod
    def get_client_metadata(client_name: str) -> List[Dict]:
        """Get client metadata from local JSON file"""
        client_file = METADATA_DIR / f"{client_name.lower()}.json"
        if client_file.exists():
            with open(client_file, "r") as f:
                return json.load(f)
        return []

    @staticmethod
    def save_neuron_data_locally(client_name: str, neuron_id: str, data: Dict):
        """Save neuron data to local JSON file"""
        client_data_file = CLIENT_DATA_DIR / f"{client_name.lower()}_{neuron_id}.json"
        with open(client_data_file, "w") as f:
            json.dump(data, f, indent=2, default=str)

    @staticmethod
    def save_json_file(file_path: Path, data: Dict):
        """Generic method to save JSON data to file"""
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2, default=str)

    @staticmethod
    def delete_client_metadata(client_name: str, neuron_id: int) -> bool:
        """Delete specific neuron metadata and associated files"""
        client_file = METADATA_DIR / f"{client_name.lower()}.json"

        if not client_file.exists():
            print(f"Client file not found: {client_file}")
            return False

        try:
            with open(client_file, "r") as f:
                existing_data = json.load(f)

            neuron_to_delete = None
            updated_data = []

            for neuron in existing_data:
                if isinstance(neuron, dict):
                    if neuron.get("neuron_id") == neuron_id:
                        neuron_to_delete = neuron
                    else:
                        updated_data.append(neuron)
                else:
                    print(f"Skipping invalid neuron data: {neuron}")
                    continue

            if neuron_to_delete is None:
                print(f"Neuron with ID {neuron_id} not found")
                return False

            if neuron_to_delete.get("file_path"):
                swc_file = Path(neuron_to_delete["file_path"])
                if swc_file.exists():
                    swc_file.unlink()
                    print(f"Deleted SWC file: {swc_file}")

            if neuron_to_delete.get("data_file"):
                data_file = Path(neuron_to_delete["data_file"])
                if data_file.exists():
                    data_file.unlink()
                    print(f"Deleted data file: {data_file}")

            if updated_data:
                with open(client_file, "w") as f:
                    json.dump(updated_data, f, indent=2, default=str)
            else:
                client_file.unlink()
                print(f"Deleted empty metadata file: {client_file}")

            print(f"Successfully deleted neuron {neuron_id}")
            return True

        except Exception as e:
            print(f"Error deleting neuron metadata: {e}")
            return False

    @staticmethod
    def get_directory_size(path: Path) -> int:
        """Get total size of directory in bytes"""
        total = 0
        for entry in path.rglob("*"):
            if entry.is_file():
                total += entry.stat().st_size
        return total

    @staticmethod
    def check_neuron():
        """check neuron and swc files are present or not"""
        client_name = "neuromorpho"
        client_file = METADATA_DIR / f"{client_name.lower()}.json"
        print("#" * 20)
        with open(client_file, "r") as f:
            temp = json.load(f)
            for item in temp:
                id = item["neuron_id"]
                file = Path(item["file_path"])
                swc = Path(item["data_file"])
                if file.exists() and swc.exists():
                    print("*" * 20)
                    print(
                        f"Neuron ID {item['neuron_id']} - File exists: {file} - SWC exists: {swc}"
                    )
                else:
                    print(
                        f"Neuron ID {item['neuron_id']} - File does not exists: {file} - SWC does not exist:{swc}"
                    )
        print("#" * 20)
