import React, { useState, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import NeuromorphoSearchBar from './NeuromorphoSearchBar';
import NeuromorphoResultsGrid from './NeuromorphoResultsGrid';
//import NeuromorphoCart from "./NeuromorphoCart";
//import NeuromorphoSavedNeurons from "./NeuromorphoSavedNeurons";

import { API_BASE_URL } from '../../config.js';

const BASE = `${API_BASE_URL}/neuromorpho`;
const SERVER = API_BASE_URL;

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

  const [rowCount, setRowCount] = useState(0);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 20 });
  const lastQuery = useRef(null);

  const _fetchPage = async (query, page, pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...query, page, size: pageSize }),
      });
      if (!resp.ok) throw new Error('Search request failed');
      const data = await resp.json();
      setResults(data.neurons || []);
      setRowCount(data.page?.totalElements || 0);
    } catch (e) {
      setError(e.message);
      setResults([]);
      setRowCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    if (!query.species) {
      setError('Please select a species.');
      return;
    }
    lastQuery.current = query;
    setSearched(true);
    const newModel = { page: 0, pageSize: paginationModel.pageSize };
    setPaginationModel(newModel);
    await _fetchPage(query, 0, newModel.pageSize);
  };

  const handlePaginationChange = async (newModel) => {
    setPaginationModel(newModel);
    if (lastQuery.current) {
      await _fetchPage(lastQuery.current, newModel.page, newModel.pageSize);
    }
  };

  const handleSelectMorphology = async (neuron) => {
    if (!neuron) { setMountMorphology(null); return; }
    if (!clientId) {
      setError('No client session available.');
      return;
    }
     if (!onFileChange) { setError('onFileChange prop is missing.'); return; }

    const { neuron_id: neuronId, neuron_name: neuronName, archive } = neuron;
    setMountMorphology(neuronId);
    setMorphLoading(true);
    setError(null);

    try {
      // STEP 1: Fetch SWC — pass name+archive to skip the metadata lookup round-trip
      const params = new URLSearchParams({ name: neuronName, archive });
      const swcResp = await fetch(`${BASE}/swc/${neuronId}?${params}`);
      if (!swcResp.ok) throw new Error('Failed to fetch SWC file');
      const swcText = await swcResp.text();

      const filename = `${neuronName}.swc`;

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

      {(loading || morphLoading) && (
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

      {searched && (
        <NeuromorphoResultsGrid
          results={results}
          loading={loading}
          rowCount={rowCount}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationChange}
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
