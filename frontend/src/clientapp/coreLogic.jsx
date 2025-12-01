"use client";
import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
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
import { useNeuroMorphoAPI } from "./Neuromorpho";

// --- API Base URL ---
const API_BASE_URL = import.meta.env.DEV ? "http://localhost:5000/dataclient" : "dataclient";

// --- Theme Context and Provider (Kept as is for structure) ---
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const theme = createTheme({
        // ... (Theme configuration remains the same)
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

// --- NeuroMorpho Context ---
const NeuroMorphoContext = createContext();

// --- NeuroMorpho Provider (The Logic Container) ---
export function NeuroMorphoProvider({ children, clientId }) {
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
    const [selectedNeurons, setSelectedNeurons] = useState(new Set());
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: "",
        severity: "info",
    });

    // Helper function to show snackbar notifications
    const showSnackbar = useCallback((message, severity = "info") => {
        setSnackbar({ open: true, message, severity });
    }, []);

    // Close snackbar handler
    const handleCloseSnackbar = useCallback((event, reason) => {
        if (reason === "clickaway") {
            return;
        }
        setSnackbar((prev) => ({ ...prev, open: false }));
    }, []);

    // Load initial species data
    const loadSpecies = useCallback(async () => {
        try {
            const speciesData = await fetchSpecies();
            setSpecies(speciesData);
        } catch (error) {
            showSnackbar("Failed to fetch species.", "error");
        }
    }, [fetchSpecies, showSnackbar]);

    // Handle species change and load metadata
    const handleSpeciesChange = useCallback(
        async (selectedSpecies) => {
            setSearchFilters((prev) => ({
                ...prev,
                species: selectedSpecies,
                brain_region: "",
                cell_type: "",
                archive: "",
            }));

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
                // showSnackbar(`Metadata loaded for ${selectedSpecies}`, "success"); // Removed for less noise
            } catch (error) {
                showSnackbar("Failed to fetch metadata.", "error");
            }
        },
        [fetchMetadata, showSnackbar]
    );

    // Handle search
    const handleSearch = useCallback(
        async (page = 0) => {
            // Only search if a species is selected
            if (!searchFilters.species) {
                showSnackbar("Please select a species to search.", "warning");
                return;
            }

            try {
                const results = await searchNeurons(searchFilters, page);
                setSearchResults(results.neurondata);
                setCurrentPage(results.currentPage);
                setTotalPages(results.totalPages);

                if (results.neurondata.length > 0) {
                    showSnackbar(`Found ${results.neurondata.length} neurons.`, "info");
                } else {
                    showSnackbar("No neurons found for the current filters.", "warning");
                }
            } catch (error) {
                showSnackbar("Failed to search neurons.", "error");
            }
        },
        [searchFilters, searchNeurons, showSnackbar]
    );

    // Handle cart save
    const handleSaveCart = useCallback(async () => {
        if (selectedNeurons.size === 0) {
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
            // Trigger refresh in the StoredDataCard and StorageInfoCard via their autoRefresh or manual call
        } catch (error) {
            showSnackbar(`Failed to save neurons: ${error.message}`, "error");
        }
    }, [selectedNeurons, saveCart, showSnackbar]);

    // Clear filters
    const clearFilters = useCallback(() => {
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
    }, [showSnackbar]);

    // Toggle neuron selection
    const toggleNeuronSelection = useCallback((neuronId) => {
        setSelectedNeurons((prevSelection) => {
            const newSelection = new Set(prevSelection);
            if (newSelection.has(neuronId)) {
                newSelection.delete(neuronId);
            } else {
                newSelection.add(neuronId);
            }
            return newSelection;
        });
    }, []);

    // Initial data load
    useEffect(() => {
        loadSpecies();

        // Optional: Check backend health
        healthCheck()
            .then((health) => {
                console.log("Backend health:", health);
            })
            .catch((error) => {
                console.warn("Backend health check failed:", error);
            });
    }, [loadSpecies, healthCheck]);


    // Memoized context value
    const contextValue = useMemo(() => ({
        // State
        species,
        brainRegions,
        cellTypes,
        archives,
        searchFilters,
        searchResults,
        currentPage,
        totalPages,
        selectedNeurons,
        loading,
        metadataLoading,
        snackbar,

        // Actions/Handlers
        setSearchFilters,
        handleSpeciesChange,
        handleSearch,
        handleSaveCart,
        clearFilters,
        toggleNeuronSelection,
        handleCloseSnackbar,
        showSnackbar,
    }), [
        // State dependencies
        species,
        brainRegions,
        cellTypes,
        archives,
        searchFilters,
        searchResults,
        currentPage,
        totalPages,
        selectedNeurons,
        loading,
        metadataLoading,
        snackbar,

        // Action/Handler dependencies
        setSearchFilters,
        handleSpeciesChange,
        handleSearch,
        handleSaveCart,
        clearFilters,
        toggleNeuronSelection,
        handleCloseSnackbar,
        showSnackbar,
    ]);

    return (
        <NeuroMorphoContext.Provider value={contextValue}>
            {children}
        </NeuroMorphoContext.Provider>
    );
}

// Custom hook to use the NeuroMorpho Context
export function useNeuroMorpho() {
    const context = useContext(NeuroMorphoContext);
    if (!context) {
        throw new Error(
            "useNeuroMorpho must be used within a NeuroMorphoProvider"
        );
    }
    return context;
}
