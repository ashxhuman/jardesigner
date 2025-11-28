from datetime import datetime
from pathlib import Path
from typing import List, Dict, Union
import json
import re

class LocalStorageManager:
    """Handles all local storage operations"""

    def __init__(self, base_dir: Union[Path, str] = "local_storage"):
        """
        Instantiate a storage manager for a specific base directory.
        Use this (do not rely on static methods) so each session can have its own storage path.
        """
        self.session_path = Path(base_dir)
        self.LOCAL_STORAGE_DIR = self.session_path
        self.SWC_DIR = self.LOCAL_STORAGE_DIR / "swc" / "neuromorpho"
        self.CLIENT_DATA_DIR = self.LOCAL_STORAGE_DIR / "client_data"
        self.METADATA_DIR = self.LOCAL_STORAGE_DIR / "metadata"

        # Ensure directories exist
        for directory in [self.SWC_DIR, self.CLIENT_DATA_DIR, self.METADATA_DIR]:
            directory.mkdir(parents=True, exist_ok=True)

    def save_client_metadata(self, client_name: str, metadata: Dict):
        """Save client metadata to local JSON file"""
        client_file = self.METADATA_DIR / f"{client_name.lower()}.json"

        existing_data = []
        if client_file.exists():
            try:
                with open(client_file, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
            except Exception:
                existing_data = []

        existing_data.append(metadata)

        with open(client_file, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, indent=2, default=str)

    def get_client_metadata(self, client_name: str) -> List[Dict]:
        """Get client metadata from local JSON file"""
        client_file = self.METADATA_DIR / f"{client_name.lower()}.json"
        if client_file.exists():
            try:
                with open(client_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
        return []

    def save_neuron_data_locally(self, client_name: str, neuron_id: Union[int, str], data: Dict):
        """Save neuron data to local JSON file"""
        self.CLIENT_DATA_DIR.mkdir(parents=True, exist_ok=True)
        # client_data_file = self.CLIENT_DATA_DIR / f"{client_name.lower()}_{neuron_id}.json"
        # with open(client_data_file, "w", encoding="utf-8") as f:
        #    json.dump(data, f, indent=2, default=str)
        self.save_json_file(self.CLIENT_DATA_DIR / f"{client_name.lower()}_{neuron_id}.json", data)


    @staticmethod
    def save_json_file(file_path: Path, data: Dict):
        """Generic method to save JSON data to file"""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        return None

    def delete_client_metadata(self, client_name: str, neuron_id: int) -> bool:
        """Delete specific neuron metadata and associated files"""
        client_file = self.METADATA_DIR / f"{client_name.lower()}.json"

        if not client_file.exists():
            print(f"Client file not found: {client_file}")
            return False

        try:
            with open(client_file, "r", encoding="utf-8") as f:
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
                    continue

            if neuron_to_delete is None:
                return False

            if neuron_to_delete.get("file_path"):
                swc_file = Path(neuron_to_delete["file_path"])
                if swc_file.exists():
                    try:
                        swc_file.unlink()
                    except Exception:
                        pass

            if neuron_to_delete.get("data_file"):
                data_file = Path(neuron_to_delete["data_file"])
                if data_file.exists():
                    try:
                        data_file.unlink()
                    except Exception:
                        pass

            if updated_data:
                with open(client_file, "w", encoding="utf-8") as f:
                    json.dump(updated_data, f, indent=2, default=str)
            else:
                try:
                    client_file.unlink()
                except Exception:
                    pass

            return True

        except Exception as e:
            print(f"Error deleting neuron metadata: {e}")
            return False

    def get_directory_size(self, path: Path) -> int:
        """Get total size of directory in bytes"""
        total = 0
        for entry in path.rglob("*"):
            if entry.is_file():
                try:
                    total += entry.stat().st_size
                except Exception:
                    pass
        return total

    def check_neuron(self):
        """check neuron and swc files are present or not"""
        client_name = "neuromorpho"
        client_file = self.METADATA_DIR / f"{client_name.lower()}.json"
        print("#" * 20)
        if not client_file.exists():
            print(f"No metadata file: {client_file}")
            print("#" * 20)
            return

        try:
            with open(client_file, "r", encoding="utf-8") as f:
                temp = json.load(f)
        except Exception:
            print("Failed to read metadata file")
            print("#" * 20)
            return

        for item in temp:
            id_ = item.get("neuron_id")
            file = Path(item.get("file_path", ""))
            swc = Path(item.get("data_file", ""))
            if file.exists() and swc.exists():
                print("*" * 20)
                print(
                    f"Neuron ID {id_} - File exists: {file} - SWC exists: {swc}"
                )
            else:
                print(
                    f"Neuron ID {id_} - File does not exist: {file} - SWC does not exist: {swc}"
                )
        print("#" * 20)

    def save_swc_and_metadata(
        self,
        client_name: str,
        neuron_id: int,
        neuron_name: str,
        swc_content: str,
        api_data: Dict,
        archive: str,
        uploaded_at: datetime = None,
    ) -> Dict:
        """
        Save SWC file and corresponding client data + metadata.
        Returns metadata dict on success. Raises Exception on failure.
        """
        try:
            uploaded_at = uploaded_at or datetime.now()
            
            # Validate inputs
            if not swc_content or not swc_content.strip():
                raise ValueError("Empty SWC content")
            
            if not neuron_name or not archive:
                raise ValueError(f"Missing required fields: neuron_name={neuron_name}, archive={archive}")

            # sanitize filename - replace invalid chars and spaces
            safe_name = re.sub(r'[^\w\-.]', '_', neuron_name.strip())
            if not safe_name:
                safe_name = f"neuron_{neuron_id}"

            # ensure directories exist
            self.SWC_DIR.mkdir(parents=True, exist_ok=True)
            self.CLIENT_DATA_DIR.mkdir(parents=True, exist_ok=True)
            self.METADATA_DIR.mkdir(parents=True, exist_ok=True)

            # Create unique filename to avoid overwrites
            file_path = self.SWC_DIR / f"{safe_name}.swc"
            if file_path.exists():
                file_path = self.SWC_DIR / f"{safe_name}_{neuron_id}.swc"

            # write SWC file with error checking
            try:
                with file_path.open("w", encoding="utf-8") as f:
                    f.write(swc_content)
                if not file_path.exists() or file_path.stat().st_size == 0:
                    raise IOError("SWC file was not written or is empty")
            except IOError as e:
                raise IOError(f"Failed to save SWC file {file_path}: {e}")

            # prepare client data with validation
            client_data = {
                "client_name": client_name.lower(),
                "neuron_id": neuron_id,
                "data": api_data or {}, 
                "uploaded_at": uploaded_at,
                "file_path": str(file_path),
                "archive": archive,
                "neuron_name": neuron_name,
            }

            # Save client data
            try:
                self.save_neuron_data_locally(client_name, neuron_id, client_data)
            except Exception as e:
                # Clean up SWC file if client data save fails
                file_path.unlink(missing_ok=True)
                raise Exception(f"Failed to save client data json: {e}")

            # prepare metadata with validation
            metadata = {
                "neuron_id": neuron_id,
                "neuron_name": neuron_name,
                "archive": archive,
                "file_path": str(file_path),
                "png_url": api_data.get("png_url", "") if api_data else "",
                "uploaded_at": uploaded_at,
                "data_file": str(self.CLIENT_DATA_DIR / f"{client_name.lower()}_{neuron_id}.json"),
            }

            try:
                self.save_client_metadata(client_name, metadata)
            except Exception as e:
                file_path.unlink(missing_ok=True)
                (self.CLIENT_DATA_DIR / f"{client_name.lower()}_{neuron_id}.json").unlink(missing_ok=True)
                raise Exception(f"Failed to save client metadata: {e}")

            return metadata

        except Exception as e:
            # Log the error for debugging
            print(f"Error in save_swc_and_metadata for neuron {neuron_id}: {str(e)}")
            raise
