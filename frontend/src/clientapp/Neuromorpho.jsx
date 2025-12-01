import { useState, useCallback } from "react";

const API_BASE_URL =import.meta.env.DEV ? "http://localhost:5000/dataclient" : "/dataclient";

// Custom Hook for API calls
export function useNeuroMorphoAPI(clientId) {
    const [loading, setLoading] = useState(false);
    const [metadataLoading, setMetadataLoading] = useState(false);

    const getHeaders = useCallback(() => {
        const headers = {
            "Content-Type": "application/json",
        };
        if (clientId) {
            headers["X-Client-ID"] = clientId;
        }
        return headers;
    }, [clientId]);

    const fetchSpecies = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/neuromorpho/`, {
                headers: getHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.species;
        } catch (error) {
            console.error("Error fetching species:", error);
            throw error;
        }
    }, [getHeaders]);

    const fetchMetadata = useCallback(async (selectedSpecies) => {
        if (!selectedSpecies)
            return { brain_region: [], cell_type: [], archive: [] };

        setMetadataLoading(true);
        try {
            const response = await fetch(
                `${API_BASE_URL}/neuromorpho/?species=${selectedSpecies}`,
                { method: "PATCH", headers: getHeaders() }
            );
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return {
                brain_region: data.brain_region || [],
                cell_type: data.cell_type || [],
                archive: data.archive || [],
            };
        } catch (error) {
            console.error("Error fetching metadata:", error);
            throw error;
        } finally {
            setMetadataLoading(false);
        }
    }, [getHeaders]);

    const searchNeurons = useCallback(async (searchFilters, page = 0) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/submit/`, {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({
                    species: searchFilters.species,
                    brain_region: searchFilters.brain_region,
                    cell_type: searchFilters.cell_type,
                    page: page,
                }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return {
                neurondata: data.neurondata || [],
                currentPage: data.currentPage || 0,
                totalPages: data.totalPages || 0,
                hasNextPage: data.hasNextPage || false,
                hasPreviousPage: data.hasPreviousPage || false,
            };
        } catch (error) {
            console.error("Error searching neurons:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [getHeaders]);

    const saveCart = useCallback(async (selectedNeurons) => {
        if (!clientId) {
            throw new Error("Client ID is required to save the cart.");
        }

        if (selectedNeurons.size === 0) {
            throw new Error("No neurons selected to save.");
        }

        setLoading(true);
        try {
            const payload = {
                neuron_ids: Array.from(selectedNeurons).map(id => parseInt(id, 10)),
            };

            const response = await fetch(`${API_BASE_URL}/save_cart/`, {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.error || `HTTP error! status: ${response.status}`
                );
            }
            const data = await response.json();
            return {
                success: data.success,
                message: data.message,
                total_successful: data.total_successful,
                total_failed: data.total_failed,
                stored_files: data.stored_files,
            };
        } catch (error) {
            console.error("Error saving cart:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [clientId, getHeaders]);

    const fetchStorageInfo = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/storage-info/`, {
                headers: getHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return {
                storageDirectory: data.storage_directory,
                totalSizeBytes: data.total_size_bytes,
                swcCount: data.swc_files.count,
                swcSize: data.swc_files.size_bytes,
                swcDirectory: data.swc_files.directory,
                clientDataCount: data.client_data_files.count,
                clientDataSize: data.client_data_files.size_bytes,
                clientDataDirectory: data.client_data_files.directory,
                metadataCount: data.metadata_files.count,
                metadataSize: data.metadata_files.size_bytes,
                metadataDirectory: data.metadata_files.directory,
                morphology: data.metadata_files.png_url,
            };
        } catch (error) {
            console.error("Error fetching storage info:", error);
            throw error;
        }
    }, [getHeaders]);

    const fetchClientData = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/neuron-data/`, {
                headers: getHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return {
                message: data.message,
                totalClients: data.total_clients,
                clients: data.clients || [],
            };
        } catch (error) {
            console.error("Error fetching client data:", error);
            throw error;
        }
    }, [getHeaders]);

    const deleteNeuronData = useCallback(async (clientName, neuronId) => {
        try {
            const response = await fetch(
                `${API_BASE_URL}/delete-neuron-data/?client_name=${clientName}&neuron_id=${neuronId}`,
                { method: "DELETE", headers: getHeaders() }
            );
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.detail || `HTTP error! status: ${response.status}`
                );
            }
            const data = await response.json();
            return {
                message: data.message,
                clientName: data.client_name,
                neuronId: data.neuron_id,
            };
        } catch (error) {
            console.error("Error deleting neuron data:", error);
            throw error;
        }
    }, [getHeaders]);

    const healthCheck = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/health`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return {
                status: data.status,
                neuromorphoApi: data.neuromorpho_api,
            };
        } catch (error) {
            console.error("Error checking health:", error);
            throw error;
        }
    }, []);

    return {
        loading,
        metadataLoading,
        fetchSpecies,
        fetchMetadata,
        searchNeurons,
        saveCart,
        fetchStorageInfo,
        fetchClientData,
        deleteNeuronData,
        healthCheck,
    };
}

// Utility function for formatting bytes
const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
        Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
};
