import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Union


class NeuronStorage:
    """
    All local-disk operations scoped to one client session directory.

    session_dir: e.g. user_uploads/<client_id>
    Subfolders created automatically:
        swc/neuromorpho/   ← .swc files
        client_data/       ← per-neuron JSON blobs
        metadata/          ← per-client index JSON lists
    """

    def __init__(self, session_dir: Union[Path, str]) -> None:
        self.root = Path(session_dir)
        self.swc_dir = self.root / "swc" / "neuromorpho"
        self.data_dir = self.root / "client_data"
        self.meta_dir = self.root / "metadata"
        for d in (self.swc_dir, self.data_dir, self.meta_dir):
            d.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Save
    # ------------------------------------------------------------------

    def save_neuron(
        self,
        *,
        neuron_id: int,
        neuron_name: str,
        swc_content: str,
        api_data: Dict,
        archive: str,
    ) -> Dict:
        """
        Write the SWC file and update the metadata index.
        Returns the metadata dict. Raises on failure.
        """
        if not swc_content or not swc_content.strip():
            raise ValueError("Empty SWC content")
        if not neuron_name or not archive:
            raise ValueError(f"Missing neuron_name or archive for neuron {neuron_id}")

        safe_name = re.sub(r"[^\w\-.]", "_", neuron_name.strip()) or f"neuron_{neuron_id}"
        swc_path = self.swc_dir / f"{safe_name}.swc"
        if swc_path.exists():
            swc_path = self.swc_dir / f"{safe_name}_{neuron_id}.swc"

        swc_path.write_text(swc_content, encoding="utf-8")
        if not swc_path.exists() or swc_path.stat().st_size == 0:
            raise IOError(f"SWC file not written: {swc_path}")

        # Per-neuron data blob
        data_path = self.data_dir / f"neuromorpho_{neuron_id}.json"
        data_path.write_text(
            json.dumps({
                "neuron_id": neuron_id, "neuron_name": neuron_name,
                "archive": archive, "api_data": api_data,
                "swc_path": str(swc_path),
            }, indent=2, default=str),
            encoding="utf-8",
        )

        # Metadata index entry
        meta = {
            "neuron_id": neuron_id,
            "neuron_name": neuron_name,
            "archive": archive,
            "file_path": str(swc_path),
            "data_file": str(data_path),
            "png_url": (api_data or {}).get("png_url", ""),
            "uploaded_at": datetime.now().isoformat(),
        }
        self._append_metadata(meta)
        return meta

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_neurons(self) -> List[Dict]:
        """Return the metadata index (all neurons for this session)."""
        index_file = self.meta_dir / "neuromorpho.json"
        if not index_file.exists():
            return []
        try:
            return json.loads(index_file.read_text(encoding="utf-8"))
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_neuron(self, neuron_id: int) -> bool:
        """Remove one neuron from the index and delete its files."""
        index_file = self.meta_dir / "neuromorpho.json"
        if not index_file.exists():
            return False

        try:
            data: List[Dict] = json.loads(index_file.read_text(encoding="utf-8"))
        except Exception:
            return False

        target = None
        remaining = []
        for entry in data:
            if entry.get("neuron_id") == neuron_id:
                target = entry
            else:
                remaining.append(entry)

        if target is None:
            return False

        for key in ("file_path", "data_file"):
            p = Path(target.get(key, ""))
            if p.exists():
                p.unlink(missing_ok=True)

        if remaining:
            index_file.write_text(json.dumps(remaining, indent=2, default=str), encoding="utf-8")
        else:
            index_file.unlink(missing_ok=True)

        return True

    # ------------------------------------------------------------------
    # Disk usage
    # ------------------------------------------------------------------

    def disk_usage(self) -> Dict:
        """Return a breakdown of storage size by subdirectory."""
        return {
            "total_bytes": self._dir_size(self.root),
            "swc_files": {"count": len(list(self.swc_dir.glob("*.swc"))), "bytes": self._dir_size(self.swc_dir)},
            "data_files": {"count": len(list(self.data_dir.glob("*.json"))), "bytes": self._dir_size(self.data_dir)},
            "meta_files": {"count": len(list(self.meta_dir.glob("*.json"))), "bytes": self._dir_size(self.meta_dir)},
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _append_metadata(self, entry: Dict) -> None:
        index_file = self.meta_dir / "neuromorpho.json"
        existing = []
        if index_file.exists():
            try:
                existing = json.loads(index_file.read_text(encoding="utf-8"))
            except Exception:
                existing = []
        existing.append(entry)
        index_file.write_text(json.dumps(existing, indent=2, default=str), encoding="utf-8")

    @staticmethod
    def _dir_size(path: Path) -> int:
        return sum(
            f.stat().st_size for f in path.rglob("*") if f.is_file()
        )