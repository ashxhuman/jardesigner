import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Chip,
    CircularProgress,
    Grid,
    IconButton,
    Paper,
    Snackbar,
    Tooltip,
    Typography,
    Alert,
} from "@mui/material";
import {
    Info,
    Folder,
    Refresh,
    Storage,
    FileDownload,
    Delete,
    Check,
} from "@mui/icons-material";

const API_BASE_URL = import.meta.env.DEV ? "http://localhost:5000/dataclient" : "/dataclient";

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

// STANDALONE Storage Info Card Component with its own data fetching
export function StorageInfoCard({
                                    apiBaseUrl = API_BASE_URL,
                                    autoRefresh = true,
                                    refreshInterval = 30000, // 30 seconds
                                    clientId,
                                }) {
    // ... (Component logic remains the same, using local state and the standalone fetch)
    const [storageInfo, setStorageInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const getHeaders = useCallback(() => {
        const headers = {
            "Content-Type": "application/json",
        };
        if (clientId) {
            headers["X-Client-ID"] = clientId;
        }
        return headers;
    }, [clientId]);

    const fetchStorageInfo = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/storage-info/`, {
                headers: getHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setStorageInfo({
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
            });
        } catch (error) {
            console.error("Error fetching storage info:", error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }, [apiBaseUrl, getHeaders]);

    useEffect(() => {
        fetchStorageInfo();

        if (autoRefresh) {
            const interval = setInterval(fetchStorageInfo, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [fetchStorageInfo, autoRefresh, refreshInterval]);

    if (error) {
        return (
            <Card>
                <CardContent>
                    <Alert severity="error">
                        Failed to load storage information: {error}
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader
                title={
                    <Box display="flex" alignItems="center" gap={1}>
                        <Info />
                        <Typography variant="h6">Storage Information</Typography>
                    </Box>
                }
                subheader="Overview of local storage usage and file counts"
            />
            <CardContent>
                {/* Storage Directory Info */}
                {storageInfo?.storageDirectory && (
                    <Box mb={3}>
                        <Chip
                            icon={<Folder />}
                            label={`Storage Directory: ${storageInfo.storageDirectory}`}
                            variant="outlined"
                            sx={{ mb: 1 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            Total Storage Used: {formatBytes(storageInfo.totalSizeBytes || 0)}
                        </Typography>
                    </Box>
                )}

                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, textAlign: "center" }}>
                            <Typography variant="h6" gutterBottom>
                                SWC Files
                            </Typography>
                            <Typography variant="h3" color="primary.main">
                                {storageInfo?.swcCount || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {formatBytes(storageInfo?.swcSize || 0)}
                            </Typography>
                            {storageInfo?.swcDirectory && (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ mt: 1, display: "block" }}
                                >
                                    {storageInfo.swcDirectory}
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, textAlign: "center" }}>
                            <Typography variant="h6" gutterBottom>
                                Client Data Files
                            </Typography>
                            <Typography variant="h3" color="primary.main">
                                {storageInfo?.clientDataCount || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {formatBytes(storageInfo?.clientDataSize || 0)}
                            </Typography>
                            {storageInfo?.clientDataDirectory && (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ mt: 1, display: "block" }}
                                >
                                    {storageInfo.clientDataDirectory}
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, textAlign: "center" }}>
                            <Typography variant="h6" gutterBottom>
                                Metadata Files
                            </Typography>
                            <Typography variant="h3" color="primary.main">
                                {storageInfo?.metadataCount || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {formatBytes(storageInfo?.metadataSize || 0)}
                            </Typography>
                            {storageInfo?.metadataDirectory && (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ mt: 1, display: "block" }}
                                >
                                    {storageInfo.metadataDirectory}
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
                <Box mt={3} textAlign="center">
                    <Button
                        variant="outlined"
                        startIcon={loading ? <CircularProgress size={16} /> : <Refresh />}
                        onClick={fetchStorageInfo}
                        disabled={loading}
                    >
                        {loading ? "Refreshing..." : "Refresh Storage Info"}
                    </Button>
                </Box>
            </CardContent>
        </Card>
    );
}

//Stored Data Card
export function StoredDataCard({
                                   apiBaseUrl = API_BASE_URL,
                                   autoRefresh = true,
                                   refreshInterval = 30000,
                                   clientId,
                                   onFileSelect,
                               }) {
    // ... (Component logic remains the same, using local state and the standalone fetch)
    const [clientData, setClientData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: "",
        severity: "info",
    });

    const getHeaders = useCallback(() => {
        const headers = {
            "Content-Type": "application/json",
        };
        if (clientId) {
            headers["X-Client-ID"] = clientId;
        }
        return headers;
    }, [clientId]);

    const showSnackbar = (message, severity = "info") => {
        setSnackbar({ open: true, message, severity });
    };

    const handleCloseSnackbar = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    const fetchClientData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/neuron-data/`, {
                headers: getHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setClientData(data.clients || []);
        } catch (error) {
            console.error("Error fetching client data:", error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }, [apiBaseUrl, getHeaders]);

    const deleteNeuronData = useCallback(
        async (clientName, neuronId) => {
            try {
                const response = await fetch(
                    `${apiBaseUrl}/delete-neuron-data/?client_name=${clientName}&neuron_id=${neuronId}`,
                    { method: "DELETE", headers: getHeaders() }
                );
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(
                        errorData.detail || `HTTP error! status: ${response.status}`
                    );
                }
                return await response.json();
            } catch (error) {
                console.error("Error deleting neuron data:", error);
                throw error;
            }
        },
        [apiBaseUrl, getHeaders]
    );

    const handleDeleteNeuron = async (clientName, neuronId) => {
        try {
            await deleteNeuronData(clientName, neuronId);
            showSnackbar(`Neuron ${neuronId} deleted successfully.`, "success");
            fetchClientData();
            // Note: StoredDataCard does not automatically refresh StorageInfoCard.
            // If the user wants total data usage to update immediately after a delete,
            // the refresh logic would need to be coordinated, perhaps using a global event or another context.
        } catch (error) {
            console.error("Error deleting neuron:", error);
            showSnackbar(`Failed to delete neuron: ${error.message}`, "error");
        }
    };

    useEffect(() => {
        fetchClientData();

        if (autoRefresh) {
            const interval = setInterval(fetchClientData, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [fetchClientData, autoRefresh, refreshInterval]);

    if (error) {
        return (
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Alert severity="error">
                        Failed to load stored data: {error}
                        <Button onClick={fetchClientData} sx={{ ml: 2 }}>
                            Retry
                        </Button>
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box display="flex" alignItems="center" gap={1}>
                            <Storage />
                            <Typography variant="h6">
                                Stored Neuron Data (SWC Files)
                            </Typography>
                        </Box>
                    }
                    subheader="Manage your locally stored neuron data and SWC files"
                    action={
                        <IconButton onClick={fetchClientData} disabled={loading}>
                            {loading ? <CircularProgress size={20} /> : <Refresh />}
                        </IconButton>
                    }
                />
                <CardContent>
                    {clientData.length === 0 ? (
                        <Typography
                            variant="body1"
                            color="text.secondary"
                            textAlign="center"
                            sx={{ py: 4 }}
                        >
                            No stored data found. Save neurons from the Search Neurons section
                            to see them here.
                        </Typography>
                    ) : (
                        <Box>
                            {clientData.map((client) => (
                                <Paper key={client.client_name} sx={{ p: 2, mb: 2 }}>
                                    <Box
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="space-between"
                                        mb={2}
                                    >
                                        <Typography variant="h6">
                                            Client: {client.client_name}
                                        </Typography>
                                        <Chip
                                            label={`${client.neuron_count} neurons`}
                                            color="primary"
                                            size="small"
                                        />
                                    </Box>
                                    {client.neurons &&
                                        client.neurons.map((neuron) => (
                                            <Box
                                                key={neuron.neuron_id}
                                                display="flex"
                                                alignItems="center"
                                                justifyContent="space-between"
                                                sx={{
                                                    borderBottom: "1px dashed",
                                                    borderColor: "divider",
                                                    py: 1,
                                                    "&:last-child": { borderBottom: "none" },
                                                }}
                                            >
                                                <Box sx={{ flexGrow: 1 }}>
                                                    <Tooltip
                                                        title={
                                                            <img
                                                                src={neuron.png_url}
                                                                alt="Neuron Morphology"
                                                                style={{
                                                                    maxWidth: "300px",
                                                                    maxHeight: "300px",
                                                                    display: "block",
                                                                }}
                                                            />
                                                        }
                                                        arrow
                                                        placement="top"
                                                    >
                                                        <Typography variant="body1">
                                                            {neuron.neuron_name} (ID: {neuron.neuron_id})
                                                        </Typography>
                                                    </Tooltip>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Path: {neuron.file_path}
                                                    </Typography>
                                                    {neuron.archive && (
                                                        <Box mt={0.5}>
                                                            <Chip
                                                                label={`Archive: ${neuron.archive}`}
                                                                size="small"
                                                                variant="outlined"
                                                            />
                                                        </Box>
                                                    )}
                                                    {neuron.uploaded_at && (
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                            display="block"
                                                        >
                                                            Uploaded:{" "}
                                                            {new Date(neuron.uploaded_at).toLocaleString()}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                <Box display="flex" gap={1}>
                                                    {onFileSelect && (
                                                        <IconButton
                                                            color="primary"
                                                            size="small"
                                                            onClick={() => onFileSelect({ filename: neuron.file_path })}
                                                            title="Select this file"
                                                        >
                                                            <Check />
                                                        </IconButton>
                                                    )}
                                                    {neuron.file_path && (
                                                        <IconButton
                                                            color="primary"
                                                            size="small"
                                                            title="Download SWC file"
                                                        >
                                                            <FileDownload />
                                                        </IconButton>
                                                    )}
                                                    <IconButton
                                                        color="error"
                                                        size="small"
                                                        onClick={() =>
                                                            handleDeleteNeuron(
                                                                client.client_name,
                                                                neuron.neuron_id
                                                            )
                                                        }
                                                        title="Delete neuron data"
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </Box>
                                            </Box>
                                        ))}
                                </Paper>
                            ))}
                        </Box>
                    )}
                </CardContent>
            </Card>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            >
                <Alert
                    onClose={handleCloseSnackbar}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: "100%" }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
}
