"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  ThemeProvider as MUIThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Checkbox,
  Alert,
  AlertTitle,
  CircularProgress,
  Pagination,
  IconButton,
  Grid,
  Paper,
  Badge,
  Snackbar,
  Tooltip,
} from "@mui/material";
import {
  Search,
  ShoppingCart,
  Storage,
  Delete,
  Download,
  Info,
  Clear,
  Refresh,
  Folder,
  FileDownload,
} from "@mui/icons-material";
import { v4 as uuidv4 } from "uuid";

// API Base URL
const API_BASE_URL = import.meta.env.DEV ? "http://localhost:5000/dataclient" : "/dataclient";
console.log(API_BASE_URL)

// Function to get or create a client ID
const getClientId = () => {
  let clientId = localStorage.getItem("clientId");
  if (!clientId) {
    clientId = uuidv4();
    localStorage.setItem("clientId", clientId);
  }
  return clientId;
};

// Theme Context
const ThemeContext = createContext();

// Custom Theme Provider
export function ThemeProvider({ children }) {
  const theme = createTheme({
    palette: {
      mode: "light",
      primary: {
        main: "#2196f3",
        light: "#64b5f6",
        dark: "#1976d2",
      },
      secondary: {
        main: "#f50057",
        light: "#ff5983",
        dark: "#c51162",
      },
      background: {
        default: "#fafafa",
        paper: "#ffffff",
      },
    },
    typography: {
      fontFamily: "Inter, sans-serif",
      h1: {
        fontSize: "2.5rem",
        fontWeight: 700,
      },
      h2: {
        fontSize: "2rem",
        fontWeight: 600,
      },
      h3: {
        fontSize: "1.5rem",
        fontWeight: 600,
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: "none",
            fontWeight: 500,
          },
        },
      },
    },
  });

  return (
    <ThemeContext.Provider value={{ actualMode: "light" }}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Custom Hook for API calls
function useNeuroMorphoAPI(clientId) {
  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);

  const getHeaders = useCallback(() => {
    const headers = { "Content-Type": "application/json" };
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

  const fetchMetadata = useCallback(
    async (selectedSpecies) => {
      if (!selectedSpecies)
        return { brain_region: [], cell_type: [], archive: [] };

      setMetadataLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/neuromorpho/?species=${selectedSpecies}`,
          {
            method: "PATCH",
            headers: getHeaders(),
          }
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
    },
    [getHeaders]
  );

  const searchNeurons = useCallback(
    async (searchFilters, page = 0) => {
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
    },
    [getHeaders]
  );

  const saveCart = useCallback(
    async (selectedNeurons) => {
      if (selectedNeurons.size === 0) {
        throw new Error("No neurons selected to save.");
      }

      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/save_cart/`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            neuron_ids: Array.from(selectedNeurons),
          }),
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
    },
    [getHeaders]
  );

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

  const deleteNeuronData = useCallback(
    async (clientName, neuronId) => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/delete-neuron-data/?client_name=${clientName}&neuron_id=${neuronId}`,
          {
            method: "DELETE",
            headers: getHeaders(),
          }
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
    },
    [getHeaders]
  );

  const healthCheck = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        headers: getHeaders(),
      });
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
  }, [getHeaders]);

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

// STANDALONE Storage Info Card Component with its own data fetching
export function StorageInfoCard({
  apiBaseUrl = API_BASE_URL,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
}) {
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const clientId = getClientId();

  const fetchStorageInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/storage-info/`, {
        headers: { "X-Client-ID": clientId },
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
  }, [apiBaseUrl, clientId]);

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
  onDataChange,
}) {
  const [clientData, setClientData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const clientId = getClientId();

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
        headers: { "X-Client-ID": clientId },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setClientData(data.clients || []);
      if (onDataChange) {
        onDataChange(data.clients || []);
      }
    } catch (error) {
      console.error("Error fetching client data:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, onDataChange, clientId]);

  const deleteNeuronData = useCallback(
    async (clientName, neuronId) => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/delete-neuron-data/?client_name=${clientName}&neuron_id=${neuronId}`,
          {
            method: "DELETE",
            headers: { "X-Client-ID": clientId },
          }
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
    [apiBaseUrl, clientId]
  );

  const handleDownloadNeuron = (clientName, neuronId, neuronName) => {
    const url = `${apiBaseUrl}/download-swc/${clientName}/${neuronId}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${neuronName}.swc`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDeleteNeuron = async (clientName, neuronId) => {
    try {
      await deleteNeuronData(clientName, neuronId);
      showSnackbar(`Neuron ${neuronId} deleted successfully.`, "success");
      fetchClientData();
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
                          {neuron.file_path && (
                            <IconButton
                              color="primary"
                              size="small"
                              title="Download SWC file"
                              onClick={() =>
                                handleDownloadNeuron(
                                  client.client_name,
                                  neuron.neuron_id,
                                  neuron.neuron_name
                                )}
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

// Search Filters Card Component
export function SearchFiltersCard({
  species = [],
  brainRegions = [],
  cellTypes = [],
  archives = [],
  searchFilters,
  setSearchFilters,
  metadataLoading,
  loading,
  onSearch,
  onClearFilters,
  onSpeciesChange,
}) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <Search />
            <Typography variant="h6">Search Filters</Typography>
          </Box>
        }
        subheader="Select criteria to search for neurons in the NeuroMorpho database"
      />
      <CardContent>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Species</InputLabel>
              <Select
                value={searchFilters.species}
                label="Species"
                onChange={(e) => {
                  setSearchFilters((prev) => ({
                    ...prev,
                    species: e.target.value,
                  }));
                  onSpeciesChange(e.target.value);
                }}
              >
                <MenuItem value="">
                  <em>All Species</em>
                </MenuItem>
                {species.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl
              fullWidth
              disabled={!searchFilters.species || metadataLoading}
            >
              <InputLabel>Brain Region</InputLabel>
              <Select
                value={searchFilters.brain_region}
                label="Brain Region"
                onChange={(e) =>
                  setSearchFilters((prev) => ({
                    ...prev,
                    brain_region: e.target.value,
                  }))
                }
              >
                <MenuItem value="">
                  <em>All Brain Regions</em>
                </MenuItem>
                {brainRegions.map((region) => (
                  <MenuItem key={region} value={region}>
                    {region}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl
              fullWidth
              disabled={!searchFilters.species || metadataLoading}
            >
              <InputLabel>Cell Type</InputLabel>
              <Select
                value={searchFilters.cell_type}
                label="Cell Type"
                onChange={(e) =>
                  setSearchFilters((prev) => ({
                    ...prev,
                    cell_type: e.target.value,
                  }))
                }
              >
                <MenuItem value="">
                  <em>All Cell Types</em>
                </MenuItem>
                {cellTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl
              fullWidth
              disabled={!searchFilters.species || metadataLoading}
            >
              <InputLabel>Archive</InputLabel>
              <Select
                value={searchFilters.archive || ""}
                label="Archive"
                onChange={(e) =>
                  setSearchFilters((prev) => ({
                    ...prev,
                    archive: e.target.value,
                  }))
                }
              >
                <MenuItem value="">
                  <em>All Archives</em>
                </MenuItem>
                {archives.map((archive) => (
                  <MenuItem key={archive} value={archive}>
                    {archive}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        {metadataLoading && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              Loading metadata for selected species...
            </Box>
          </Alert>
        )}
        <Box display="flex" gap={2}>
          <Button
            variant="contained"
            onClick={onSearch}
            disabled={loading || !searchFilters.species}
            startIcon={loading ? <CircularProgress size={20} /> : <Search />}
          >
            Search
          </Button>
          <Button
            variant="outlined"
            onClick={onClearFilters}
            startIcon={<Clear />}
          >
            Clear
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// Cart Summary Component
export function CartSummary({ selectedNeurons, loading, onSaveCart }) {
  if (selectedNeurons.size === 0) return null;

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <Badge badgeContent={selectedNeurons.size} color="primary">
              <ShoppingCart />
            </Badge>
            <Typography variant="h6">
              Cart ({selectedNeurons.size} neurons selected)
            </Typography>
          </Box>
        }
      />
      <CardContent>
        <Button
          variant="contained"
          onClick={onSaveCart}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : <Download />}
        >
          Save Selected Neurons
        </Button>
      </CardContent>
    </Card>
  );
}

// Search Results Card Component
export function SearchResultsCard({
  searchResults = [],
  currentPage,
  totalPages,
  selectedNeurons,
  loading,
  onToggleNeuronSelection,
  onPageChange,
  hasNextPage,
  hasPreviousPage,
}) {
  if (searchResults.length === 0) return null;

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader
        title="Search Results"
        subheader={`Page ${currentPage + 1} of ${totalPages} (${
          searchResults.length
        } results on this page)`}
      />
      <CardContent>
        <Box>
          {searchResults.map((neuron) => (
            <Paper key={neuron.neuron_id} sx={{ p: 2, mb: 2 }}>
              <Box
                display="flex"
                alignItems="flex-start"
                justifyContent="space-between"
              >
                <Box
                  display="flex"
                  alignItems="center"
                  gap={2}
                  sx={{ flexGrow: 1 }}
                >
                  <Checkbox
                    checked={selectedNeurons.has(neuron.neuron_id)}
                    onChange={() => onToggleNeuronSelection(neuron.neuron_id)}
                  />
                  <Box>
                    <Typography variant="h6" component="h3">
                      {neuron.neuron_name}
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      <Chip label={`ID: ${neuron.neuron_id}`} size="small" />
                      <Chip
                        label={`Species: ${neuron.species}`}
                        size="small"
                        color="primary"
                      />
                      {neuron.brain_region && (
                        <Chip
                          label={`Brain Region: ${
                            Array.isArray(neuron.brain_region)
                              ? neuron.brain_region.join(", ")
                              : neuron.brain_region
                          }`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {neuron.cell_type && (
                        <Chip
                          label={`Cell Type: ${
                            Array.isArray(neuron.cell_type)
                              ? neuron.cell_type.join(", ")
                              : neuron.cell_type
                          }`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {neuron.archive && (
                        <Chip
                          label={`Archive: ${
                            Array.isArray(neuron.archive)
                              ? neuron.archive.join(", ")
                              : neuron.archive
                          }`}
                          size="small"
                          color="secondary"
                        />
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
        {/* Pagination */}
        {totalPages > 1 && (
          <Box display="flex" justifyContent="center" sx={{ mt: 3 }}>
            <Pagination
              count={totalPages}
              page={currentPage + 1}
              onChange={(e, page) => onPageChange(page - 1)}
              disabled={loading}
              color="primary"
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// Main App Component (Default Export)
export default function NeuromorphoApp() {
  const [clientId, setClientId] = useState(null);

  useEffect(() => {
    setClientId(getClientId());
  }, []);

  // Use the custom hook for API calls
  const {
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
  } = useNeuroMorphoAPI(clientId);

  // State variables
  const [species, setSpecies] = useState([]);
  const [brainRegions, setBrainRegions] = useState([]);
  const [cellTypes, setCellTypes] = useState([]);
  const [archives, setArchives] = useState([]);
  const [searchFilters, setSearchFilters] = useState({
    species: "",
    brain_region: "",
    cell_type: "",
    archive: "",
  });
  const [searchResults, setSearchResults] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [selectedNeurons, setSelectedNeurons] = useState(new Set());
  const [storageInfo, setStorageInfo] = useState(null);
  const [clientData, setClientData] = useState([]);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [isSessionRegistered, setIsSessionRegistered] = useState(false);

  // Helper function to show snackbar notifications
  const showSnackbar = (message, severity = "info") => {
    setSnackbar({ open: true, message, severity });
  };

  // Close snackbar handler
  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  // Load initial species data
  const loadSpecies = async () => {
    try {
      const speciesData = await fetchSpecies();
      setSpecies(speciesData);
      // Indicate session is ready for at least public API calls
      // This helps with initial data loading that doesn't require a session
      if (!isSessionRegistered) {
        setIsSessionRegistered(true);
      }
    } catch (error) {
      showSnackbar("Failed to fetch species.", "error");
    }
  };

  // Handle species change and load metadata
  const handleSpeciesChange = async (selectedSpecies) => {
    if (!selectedSpecies) {
      setBrainRegions([]);
      setCellTypes([]);
      setArchives([]);
      return;
    }

    try {
      const metadata = await fetchMetadata(selectedSpecies);
      setBrainRegions(metadata.brain_region);
      setCellTypes(metadata.cell_type);
      setArchives(metadata.archive);
      showSnackbar(`Metadata loaded for ${selectedSpecies}`, "success");
    } catch (error) {
      showSnackbar("Failed to fetch metadata.", "error");
    }
  };

  // Handle search
  const handleSearch = async (page = 0) => {
    try {
      const results = await searchNeurons(searchFilters, page);
      setSearchResults(results.neurondata);
      setCurrentPage(results.currentPage);
      setTotalPages(results.totalPages);
      setHasNextPage(results.hasNextPage);
      setHasPreviousPage(results.hasPreviousPage);

      if (results.neurondata.length > 0) {
        showSnackbar(`Found ${results.neurondata.length} neurons.`, "info");
      } else {
        showSnackbar("No neurons found for the current filters.", "warning");
      }
    } catch (error) {
      showSnackbar("Failed to search neurons.", "error");
    }
  };

  // Handle cart save
  const handleSaveCart = async () => {
    if (selectedNeurons.size === 0 || !isSessionRegistered) {
      showSnackbar("No neurons selected to save.", "warning");
      return;
    }

    try {
      const result = await saveCart(selectedNeurons);
      showSnackbar(
        `Saved ${result.total_successful} neurons. ${
          result.total_failed > 0 ? `(${result.total_failed} failed)` : ""
        }`,
        "success"
      );
      setSelectedNeurons(new Set());
      await loadClientData();
      await loadStorageInfo();
    } catch (error) {
      showSnackbar(`Failed to save neurons: ${error.message}`, "error");
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSearchFilters({
      species: "",
      brain_region: "",
      cell_type: "",
      archive: "",
    });
    setSearchResults([]);
    setBrainRegions([]);
    setCellTypes([]);
    setArchives([]);
    showSnackbar("Search filters cleared.", "info");
  };

  // Toggle neuron selection
  const toggleNeuronSelection = (neuronId) => {
    const newSelection = new Set(selectedNeurons);
    if (newSelection.has(neuronId)) {
      newSelection.delete(neuronId);
    } else {
      newSelection.add(neuronId);
    }
    setSelectedNeurons(newSelection);
  };

  // Load storage info
  const loadStorageInfo = async () => {
    try {
      const info = await fetchStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      showSnackbar("Failed to fetch storage info.", "error");
    }
  };

  // Load client data
  const loadClientData = async () => {
    try {
      const data = await fetchClientData();
      setClientData(data.clients);
    } catch (error) {
      showSnackbar("Failed to fetch stored neuron data.", "error");
    }
  };

  // Handle data refresh
  const handleRefreshData = () => {
    loadClientData();
    loadStorageInfo();
  };

  // Handle neuron deletion
  const handleDeleteNeuron = async (clientName, neuronId) => {
    try {
      await deleteNeuronData(clientName, neuronId);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  };

  // Initial data load
  useEffect(() => {
    if (clientId) {
      loadSpecies();
      loadClientData();
      loadStorageInfo();

      // Optional: Check backend health
      healthCheck()
        .then((health) => {
          console.log("Backend health:", health);
        })
        .catch((error) => {
          console.warn("Backend health check failed:", error);
        });
    }
  }, [clientId, fetchSpecies, fetchClientData, fetchStorageInfo, healthCheck]);

  return (
    <ThemeProvider>
      <Box>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            textAlign="center"
          >
            NeuroMorpho Database Explorer
          </Typography>

          {/* Search Filters Card */}
          <SearchFiltersCard
            species={species}
            brainRegions={brainRegions}
            cellTypes={cellTypes}
            archives={archives}
            searchFilters={searchFilters}
            setSearchFilters={setSearchFilters}
            metadataLoading={metadataLoading}
            loading={loading}
            onSearch={() => handleSearch(0)}
            onClearFilters={clearFilters}
            onSpeciesChange={handleSpeciesChange}
          />

          {/* Cart Summary */}
          <CartSummary
            selectedNeurons={selectedNeurons}
            loading={loading}
            onSaveCart={isSessionRegistered ? handleSaveCart : () => showSnackbar("Session not ready, please wait.", "warning")}
          />

          {/* Search Results */}
          <SearchResultsCard
            searchResults={searchResults}
            currentPage={currentPage}
            totalPages={totalPages}
            selectedNeurons={selectedNeurons}
            loading={loading}
            onToggleNeuronSelection={toggleNeuronSelection}
            onPageChange={handleSearch}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
          />

          {/* Stored Data Section */}
          <StoredDataCard onDataChange={setClientData} />

          {/* Storage Info Section */}
          <StorageInfoCard />
        </Container>

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
            <AlertTitle>
              {snackbar.severity.charAt(0).toUpperCase() +
                snackbar.severity.slice(1)}
            </AlertTitle>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
