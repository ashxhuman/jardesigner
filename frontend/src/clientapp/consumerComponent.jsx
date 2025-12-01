import React from "react";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Checkbox,
    Chip,
    CircularProgress,
    Container,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Select,
    Typography,
    Paper,
    Pagination,
    Snackbar,
    Alert,
    AlertTitle,
    Badge,
} from "@mui/material";
import {
    Search,
    Clear,
    ShoppingCart,
    Download,
    Info,
    Folder,
    Refresh,
    Storage,
    FileDownload,
    Delete,
} from "@mui/icons-material";
import { ThemeProvider, useNeuroMorpho, NeuroMorphoProvider } from "./coreLogic";
import { StoredDataCard, StorageInfoCard } from "./storageComponent";

// Search Filters Card Component
export function SearchFiltersCard() {
    const {
        species,
        brainRegions,
        cellTypes,
        archives,
        searchFilters,
        setSearchFilters,
        metadataLoading,
        loading,
        handleSearch,
        clearFilters,
        handleSpeciesChange,
    } = useNeuroMorpho();

    const handleFilterChange = (key, value) => {
        setSearchFilters((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

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
                                onChange={(e) => handleSpeciesChange(e.target.value)}
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
                                onChange={(e) => handleFilterChange("brain_region", e.target.value)}
                            >
                                <MenuItem value="">
                                    <em>All Brain Regions</em>
                                </MenuItem>
                                {metadataLoading ? (
                                    <MenuItem disabled>
                                        <CircularProgress size={20} /> Loading...
                                    </MenuItem>
                                ) : (
                                    brainRegions.map((region) => (
                                        <MenuItem key={region} value={region}>
                                            {region}
                                        </MenuItem>
                                    ))
                                )}
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
                                onChange={(e) => handleFilterChange("cell_type", e.target.value)}
                            >
                                <MenuItem value="">
                                    <em>All Cell Types</em>
                                </MenuItem>
                                {metadataLoading ? (
                                    <MenuItem disabled>
                                        <CircularProgress size={20} /> Loading...
                                    </MenuItem>
                                ) : (
                                    cellTypes.map((type) => (
                                        <MenuItem key={type} value={type}>
                                            {type}
                                        </MenuItem>
                                    ))
                                )}
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
                                onChange={(e) => handleFilterChange("archive", e.target.value)}
                            >
                                <MenuItem value="">
                                    <em>All Archives</em>
                                </MenuItem>
                                {metadataLoading ? (
                                    <MenuItem disabled>
                                        <CircularProgress size={20} /> Loading...
                                    </MenuItem>
                                ) : (
                                    archives.map((archive) => (
                                        <MenuItem key={archive} value={archive}>
                                            {archive}
                                        </MenuItem>
                                    ))
                                )}
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
                        onClick={() => handleSearch(0)}
                        disabled={loading || !searchFilters.species}
                        startIcon={loading ? <CircularProgress size={20} /> : <Search />}
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
    );
}

// Cart Summary Component
export function CartSummary() {
    const { selectedNeurons, loading, handleSaveCart } = useNeuroMorpho();

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
                    onClick={handleSaveCart}
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
export function SearchResultsCard() {
    const {
        searchResults,
        currentPage,
        totalPages,
        selectedNeurons,
        loading,
        toggleNeuronSelection,
        handleSearch,
    } = useNeuroMorpho();

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
                                        onChange={() => toggleNeuronSelection(neuron.neuron_id)}
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
                            onChange={(e, page) => handleSearch(page - 1)}
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
export default function NeuromorphoApp({ clientId }) {
    return (
        <ThemeProvider>
            <NeuroMorphoProvider clientId={clientId}>
                <InternalApp clientId={clientId} />
            </NeuroMorphoProvider>
        </ThemeProvider>
    );
}

// Internal component to consume context and render the layout
function InternalApp({ clientId }) {
    const { snackbar, handleCloseSnackbar } = useNeuroMorpho();

    return (
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
                <SearchFiltersCard />

                {/* Cart Summary */}
                <CartSummary />

                {/* Search Results */}
                <SearchResultsCard />

                {/* Stored Data Section */}
                <StoredDataCard clientId={clientId} />

                {/* Storage Info Section */}
                <StorageInfoCard clientId={clientId} />
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
    );
}
