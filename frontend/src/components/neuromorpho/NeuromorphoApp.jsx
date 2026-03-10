import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import NeuromorphoSearchBar from './NeuromorphoSearchBar';
import NeuromorphoResultsGrid from './NeuromorphoResultsGrid';
//import NeuromorphoCart from "./NeuromorphoCart";
//import NeuromorphoSavedNeurons from "./NeuromorphoSavedNeurons";

const BASE = 'http://localhost:5000/neuromorpho';
const SERVER = 'http://localhost:5000';

// // Stable client ID — persisted in sessionStorage so it survives page refresh
// // but resets on new browser session (matches server.py's disconnect cleanup)
// function getClientId() {
//   let id = sessionStorage.getItem("neuromorpho_client_id");
//   if (!id) {
//     id = crypto.randomUUID();
//     sessionStorage.setItem("neuromorpho_client_id", id);
//   }
//   return id;
// }

// const CLIENT_ID = getClientId();

export default function NeuromorphoApp({clientId, onFileChange, onClose}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [cart, setCart] = useState([]);
  const [mountMorphology, setMountMorphology] = useState(null);
  const [morphLoading, setMorphLoading] = useState(false);

  // Server-side pagination state
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const lastQuery = useRef(null);

  const handleSearch = async (query, page = 0) => {
    if (!query.species) {
      setError('Please select a species.');
      return;
    }
    lastQuery.current = query;
    setSearched(true);
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...query, page }),
      });
      if (!resp.ok) throw new Error('Search request failed');
      const data = await resp.json();
      setResults(data.neurons || []);
      setTotalPages(data.total_pages || 0);
      setCurrentPage(data.current_page || 0);
    } catch (e) {
      setError(e.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMorphology = async (neuronId) => {
    if (!clientId) {
      setError('No client session available.');
      return;
    }
     if (!onFileChange) { setError('onFileChange prop is missing.'); return; } 

    setMountMorphology(neuronId);
    setMorphLoading(true);
    setError(null);

    try {
      // STEP 1: Fetch SWC from neuromorpho blueprint
      const swcResp = await fetch(`${BASE}/swc/${neuronId}`);
      if (!swcResp.ok) throw new Error('Failed to fetch SWC file');
      const swcText = await swcResp.text();

      // Extract filename from Content-Disposition header, fallback to neuron_id
      const disposition = swcResp.headers.get('Content-Disposition');
      const match = disposition?.match(/filename=(.+\.swc)/);
      const filename = match ? match[1] : `${neuronId}.swc`;

      // STEP 2: Upload SWC to server under this client's session dir
      const formData = new FormData();
      const swcBlob = new Blob([swcText], { type: 'text/plain' });
      formData.append('file', swcBlob, filename);
      formData.append('clientId', clientId);

      const uploadResp = await fetch(`${SERVER}/upload_file`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResp.ok) throw new Error('Failed to upload SWC file');

      // STEP 3: Notify parent via onFileChange — this triggers:
      // handleMorphologyFileChange → updateJsonData → buildModelOnServer
      // Launch + socket room join are handled entirely by useAppLogic
      onFileChange?.({ filename });

      // STEP 4: Close the dialog — onClose is injected by MorphoMenuBox
      onClose?.();
    } catch (err) {
      console.error('Morphology flow failed:', err);
      setError(err.message);
    } finally {
      setMorphLoading(false);
    }
  };

  return (
    <Box sx={{ padding: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        {/* <Typography variant="h4">Neuromorpho.org</Typography> */}
        {/*<NeuromorphoSavedNeurons clientId={CLIENT_ID} />*/}
      </Box>

      <NeuromorphoSearchBar onSearch={handleSearch} loading={loading} />

      {loading || morphLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <CircularProgress />
          {
            morphLoading && (
              <Typography sx={{ml:2, alignSelf: 'center'}}>
                Loading Morphology...
              </Typography>
            )
          }
        </Box>
      )}

      {error && (
        <Typography color="error" sx={{ marginTop: 2 }}>
          {error}
        </Typography>
      )}

      {!loading && !error && searched && (
        <NeuromorphoResultsGrid
          results={results}
          cart={cart}
          onCartChange={setCart}
          mountMorphology={mountMorphology}
          selectMorphology={handleSelectMorphology}
        />
      )}

      {/* For downloading multiple swc files */}

      {/*<NeuromorphoCart*/}
      {/*  cart={cart}*/}
      {/*  onCartChange={setCart}*/}
      {/*  clientId={CLIENT_ID}*/}
      {/*/>*/}
    </Box>
  );
}
