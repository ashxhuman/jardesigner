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
  Tabs,
  Tab,
  Alert,
  AlertTitle,
  CircularProgress,
  Pagination,
  IconButton,
  Grid,
  Paper,
  Divider,
  FormControlLabel,
  Switch,
  AppBar,
  Toolbar,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from "@mui/material";

import {
  Search,
  ShoppingCart,
  Storage,
  Delete,
  Download,
  Info,
  LightMode,
  DarkMode,
  SettingsBrightness,
  Clear,
  Refresh,
} from "@mui/icons-material";

// Theme Context
const ThemeContext = createContext();

// Custom Theme Provider
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("system");
  const [actualMode, setActualMode] = useState("light");

  useEffect(() => {
    // Determine the actual theme mode based on user preference or system setting
    if (mode === "system") {
      const systemMode = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      setActualMode(systemMode);
    } else {
      setActualMode(mode);
    }
  }, [mode]);

  useEffect(() => {
    // Listen for changes in system color scheme preference
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (mode === "system") {
        setActualMode(mediaQuery.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mode]);

  // Create the Material-UI theme
  const theme = createTheme({
    palette: {
      mode: actualMode, // Set the theme mode (light or dark)
      primary: {
        main: "#2196f3", // Blue
        light: "#64b5f6",
        dark: "#1976d2",
      },
      secondary: {
        main: "#f50057", // Pink
        light: "#ff5983",
        dark: "#c51162",
      },
      background: {
        default: actualMode === "dark" ? "#121212" : "#fafafa", // Darker background for dark mode
        paper: actualMode === "dark" ? "#1e1e1e" : "#ffffff", // Darker paper for dark mode
      },
    },
    typography: {
      fontFamily: "Inter, sans-serif", // Custom font
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
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)", // Subtle shadow for cards
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
    <ThemeContext.Provider value={{ mode, setMode, actualMode }}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
}

// Custom hook to use theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Theme Toggle Component
function ThemeToggle() {
  const { mode, setMode } = useTheme(); // Access theme mode and setter

  const themeOptions = [
    { value: "light", icon: <LightMode />, label: "Light" },
    { value: "dark", icon: <DarkMode />, label: "Dark" },
    { value: "system", icon: <SettingsBrightness />, label: "System" },
  ];

  return (
    <Box display="flex" gap={1}>
      {themeOptions.map(({ value, icon, label }) => (
        <IconButton
          key={value}
          onClick={() => setMode(value)} // Set the theme mode
          color={mode === value ? "primary" : "default"} // Highlight active mode
          title={label}
          sx={{
            border: mode === value ? "2px solid" : "1px solid",
            borderColor: mode === value ? "primary.main" : "divider",
          }}
        >
          {icon}
        </IconButton>
      ))}
    </Box>
  );
}

export default function NeuroMorphoApp() {
  // State variables for application data and UI control
  const [species, setSpecies] = useState([]);
  const [brainRegions, setBrainRegions] = useState([]);
  const [cellTypes, setCellTypes] = useState([]);
  const [searchFilters, setSearchFilters] = useState({
    species: "",
    brain_region: "",
    cell_type: "",
  });
  const [searchResults, setSearchResults] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedNeurons, setSelectedNeurons] = useState(new Set()); // Using a Set for efficient selection
  const [loading, setLoading] = useState(false); // For general loading states
  const [metadataLoading, setMetadataLoading] = useState(false); // For metadata-specific loading
  const [storageInfo, setStorageInfo] = useState(null); // To store storage usage info
  const [clientData, setClientData] = useState([]); // To store locally saved client data
  const [clientDataFetched, setClientDataFetched] = useState(false); // To track if client data has been fetched
  const [errorMessage, setErrorMessage] = useState(null); // To store error messages for display
  const [tabValue, setTabValue] = useState(0); // Controls active tab
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  }); // For showing snackbar notifications

  const API_BASE_URL = "http://localhost:8000";

  // Actual API calls (replace simulated ones)
  // Helper function to show snackbar notifications (stable reference)
  const showSnackbar = useCallback((message, severity = "info") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const fetchSpecies = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/neuromorpho/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSpecies(data.species);
    } catch (error) {
      console.error("Error fetching species:", error);
      setErrorMessage("Failed to fetch species. Please try again later.");
      showSnackbar("Failed to fetch species.", "error");
    }
  }, [showSnackbar]);

  const fetchMetadata = async (selectedSpecies) => {
    if (!selectedSpecies) return;
    setMetadataLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/neuromorpho/?species=${selectedSpecies}`,
        {
          method: "PATCH",
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setBrainRegions(data.brain_region);
      setCellTypes(data.cell_type);
      showSnackbar(`Metadata loaded for ${selectedSpecies}`, "success");
    } catch (error) {
      console.error("Error fetching metadata:", error);
      setErrorMessage("Failed to fetch metadata. Please try again later.");
      showSnackbar("Failed to fetch metadata.", "error");
    } finally {
      setMetadataLoading(false);
    }
  };

  const searchNeurons = async (page = 0) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/submit/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      setSearchResults(data.neurondata);
      setCurrentPage(data.currentPage);
      setTotalPages(data.totalPages);
      if (data.neurondata.length > 0) {
        showSnackbar(`Found ${data.neurondata.length} neurons.`, "info");
      } else {
        showSnackbar("No neurons found for the current filters.", "warning");
      }
    } catch (error) {
      console.error("Error searching neurons:", error);
      setErrorMessage("Failed to search for neurons. Please try again later.");
      showSnackbar("Failed to search neurons.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Close snackbar handler
  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  // Toggle neuron selection for the cart
  const toggleNeuronSelection = (neuronId) => {
    const newSelection = new Set(selectedNeurons);
    if (newSelection.has(neuronId)) {
      newSelection.delete(neuronId);
    } else {
      newSelection.add(neuronId);
    }
    setSelectedNeurons(newSelection);
  };

  // Save cart to local storage via backend
  const saveCart = async () => {
    if (selectedNeurons.size === 0) {
      showSnackbar("No neurons selected to save.", "warning");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/save_cart/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      showSnackbar(
        `Saved ${data.total_successful} neurons. ${
          data.total_failed > 0 ? `(${data.total_failed} failed)` : ""
        }`,
        "success"
      );
      setSelectedNeurons(new Set()); // Clear selection after saving
      setClientDataFetched(false); // Invalidate client data cache
      fetchClientData(); // Refresh client data after saving
    } catch (error) {
      console.error("Error saving cart:", error);
      setErrorMessage(`Failed to save neurons: ${error.message}`);
      showSnackbar(`Failed to save neurons: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Clear all search filters and results
  const clearFilters = () => {
    setSearchFilters({ species: "", brain_region: "", cell_type: "" });
    setSearchResults([]);
    setBrainRegions([]);
    setCellTypes([]);
    setErrorMessage(null);
    showSnackbar("Search filters cleared.", "info");
  };

  // Function to format bytes into human-readable units
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  };

  // Fetch storage information
  const fetchStorageInfo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/storage-info/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setStorageInfo({
        swcCount: data.swc_files.count,
        swcSize: data.swc_files.size_bytes,
        clientDataCount: data.client_data_files.count, // Assuming client_data_files.count represents the number of stored neurons
        clientDataSize: data.client_data_files.size_bytes,
        metadataCount: data.metadata_files.count,
        metadataSize: data.metadata_files.size_bytes,
      });
      showSnackbar("Storage info refreshed.", "info");
    } catch (error) {
      console.error("Error fetching storage info:", "error");
      setErrorMessage("Failed to fetch storage info. Please try again later.");
      showSnackbar("Failed to fetch storage info.", "error");
    }
  }, [showSnackbar]);

  // Fetch client neuron data
  const fetchClientData = useCallback(async () => {
    if (clientDataFetched) return; // Don't fetch if already fetched
    try {
      const response = await fetch(`${API_BASE_URL}/neuron-data/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(data);
      setClientData(data.clients);
      setClientDataFetched(true); // Mark as fetched
      showSnackbar("Stored neuron data refreshed.", "info");
    } catch (error) {
      console.error("Error fetching client data:", error);
      setErrorMessage(
        "Failed to fetch stored neuron data. Please try again later."
      );
      showSnackbar("Failed to fetch stored neuron data.", "error");
    }
  }, [showSnackbar, clientDataFetched]);

  // Initial data fetch on component mount
  useEffect(() => {
    fetchSpecies();
    fetchClientData(); // Fetch client data on mount
    fetchStorageInfo(); // Fetch storage info on mount
  }, [fetchSpecies, fetchClientData, fetchStorageInfo]);

  return (
    <ThemeProvider>
      <Box>
        {/* Header */}
        <AppBar position="static" elevation={2}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              MOOSE Data Explorer
            </Typography>
            <ThemeToggle /> {/* Theme toggle button */}
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ py: 4 }}>
          {/* Title Section */}
          <Box textAlign="center" mb={4}>
            <Typography variant="h1" component="h1" gutterBottom>
              MOOSE Data Explorer
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Search, explore, and manage neuron morphology data
            </Typography>
          </Box>

          {/* Error Message Display */}
          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <AlertTitle>Error</AlertTitle>
              {errorMessage}
            </Alert>
          )}

          {/* Tabs for different sections */}
          <Paper sx={{ mb: 3 }}>
            <Tabs
              value={tabValue}
              onChange={(e, newValue) => setTabValue(newValue)}
              centered // Center the tabs
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              <Tab label="Search Neurons" icon={<Search />} />
              <Tab label="Stored Data" icon={<Storage />} />
              <Tab label="Storage Info" icon={<Info />} />
            </Tabs>
          </Paper>

          {/* Search Tab Content */}
          {tabValue === 0 && (
            <Box>
              {/* Search Filters Card */}
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
                    <Grid item xs={12} md={4}>
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
                            fetchMetadata(e.target.value); // Fetch metadata when species changes
                          }}
                        >
                          {/* Render species options */}
                          {species.map((s) => (
                            <MenuItem key={s} value={s}>
                              {s}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <FormControl
                        fullWidth
                        disabled={!searchFilters.species || metadataLoading} // Disable if no species or loading
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
                          {/* Render brain region options */}
                          {brainRegions.map((region) => (
                            <MenuItem key={region} value={region}>
                              {region}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <FormControl
                        fullWidth
                        disabled={!searchFilters.species || metadataLoading} // Disable if no species or loading
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
                          {/* Render cell type options */}
                          {cellTypes.map((type) => (
                            <MenuItem key={type} value={type}>
                              {type}
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
                      onClick={() => searchNeurons(0)} // Start search from page 0
                      disabled={loading || !searchFilters.species} // Disable if loading or no species selected
                      startIcon={
                        loading ? <CircularProgress size={20} /> : <Search />
                      }
                    >
                      Search
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={clearFilters}
                      startIcon={<Clear />}
                    >
                      Clear
                    </Button>
                  </Box>
                </CardContent>
              </Card>

              {/* Cart Summary */}
              {selectedNeurons.size > 0 && (
                <Card sx={{ mb: 3 }}>
                  <CardHeader
                    title={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Badge
                          badgeContent={selectedNeurons.size}
                          color="primary"
                        >
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
                      onClick={saveCart}
                      disabled={loading}
                      startIcon={
                        loading ? <CircularProgress size={20} /> : <Download />
                      }
                    >
                      Save Selected Neurons
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Search Results */}
              {searchResults.length > 0 && (
                <Card>
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
                                onChange={() =>
                                  toggleNeuronSelection(neuron.neuron_id)
                                }
                              />
                              <Box>
                                <Typography variant="h6" component="h3">
                                  {neuron.neuron_name}
                                </Typography>
                                <Box
                                  display="flex"
                                  gap={1}
                                  flexWrap="wrap"
                                  sx={{ mt: 1 }}
                                >
                                  <Chip
                                    label={`ID: ${neuron.neuron_id}`}
                                    size="small"
                                    sx={{ p: 2, mb: 2 }}
                                  />
                                  <Chip
                                    label={`Species: ${neuron.species}`}
                                    size="small"
                                    color="primary"
                                    sx={{ p: 2, mb: 2 }}
                                  />
                                  <Chip
                                    label={`Brain Region: ${neuron.brain_region}`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ p: 2, mb: 2 }}
                                  />
                                  <Chip
                                    label={`Cell Type: ${neuron.cell_type}`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ p: 2, mb: 2 }}
                                  />
                                </Box>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 1 }}
                                >
                                  Archive: {neuron.archive}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        </Paper>
                      ))}
                    </Box>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <Box
                        display="flex"
                        justifyContent="center"
                        sx={{ mt: 3 }}
                      >
                        <Pagination
                          count={totalPages}
                          page={currentPage + 1} // Pagination component is 1-indexed
                          onChange={(e, page) => searchNeurons(page - 1)} // Our searchNeurons is 0-indexed
                          disabled={loading}
                          color="primary"
                        />
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}
            </Box>
          )}

          {/* Stored Data Tab */}
          {tabValue === 1 && (
            <Card>
              <CardHeader
                title={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Storage />
                    <Typography variant="h6">Stored Neuron Data</Typography>
                  </Box>
                }
                subheader="Manage your locally stored neuron data and SWC files"
                action={
                  <IconButton onClick={fetchClientData} disabled={loading}>
                    <Refresh />
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
                    No stored data found. Save neurons from the Search Neurons
                    tab to see them here.
                  </Typography>
                ) : (
                  <Box>
                    {clientData.map((client) => (
                      <Paper key={client.client_name} sx={{ p: 2, mb: 2 }}>
                        <Typography variant="h6" gutterBottom>
                          Client: {client.client_name} ({client.neuron_count}{" "}
                          neurons)
                        </Typography>
                        {client.neurons.map((neuron) => (
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
                            <Box>
                              <Typography variant="body1">
                                {neuron.neuron_name} (ID: {neuron.neuron_id})
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Path: {neuron.file_path}
                              </Typography>
                            </Box>
                            <IconButton
                              color="error"
                              onClick={async () => {
                                try {
                                  const response = await fetch(
                                    `${API_BASE_URL}/delete-neuron-data/?client_name=${client.client_name}&neuron_id=${neuron.neuron_id}`,
                                    {
                                      method: "DELETE",
                                    }
                                  );
                                  if (!response.ok) {
                                    throw new Error(
                                      `HTTP error! status: ${response.status}`
                                    );
                                  }
                                  showSnackbar(
                                    `Neuron ${neuron.neuron_id} deleted successfully.`,
                                    "success"
                                  );
                                  setClientDataFetched(false); // Invalidate to refetch
                                  fetchClientData(); // Refresh list
                                  fetchStorageInfo(); // Refresh storage info
                                } catch (error) {
                                  console.error(
                                    "Error deleting neuron:",
                                    error
                                  );
                                  setErrorMessage(
                                    `Failed to delete neuron: ${error.message}`
                                  );
                                  showSnackbar(
                                    `Failed to delete neuron: ${error.message}`,
                                    "error"
                                  );
                                }
                              }}
                            >
                              <Delete />
                            </IconButton>
                          </Box>
                        ))}
                      </Paper>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Storage Info Tab */}
          {tabValue === 2 && (
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
                    </Paper>
                  </Grid>
                </Grid>
                <Box mt={3} textAlign="center">
                  <Button
                    variant="outlined"
                    startIcon={<Refresh />}
                    onClick={fetchStorageInfo}
                  >
                    Refresh Storage Info
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}
        </Container>

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
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
      </Box>
    </ThemeProvider>
  );
}
