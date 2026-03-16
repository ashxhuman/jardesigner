import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Autocomplete,
  TextField,
  CircularProgress,
} from '@mui/material';

const BASE = 'http://localhost:5000/neuromorpho';

const PRIORITY_SPECIES = ['rat', 'mouse'];

function sortSpecies(speciesList) {
  return [...speciesList].sort((a, b) => {
    const aIdx = PRIORITY_SPECIES.indexOf(a.toLowerCase());
    const bIdx = PRIORITY_SPECIES.indexOf(b.toLowerCase());
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
}

function toTitleCase(str) {
  return str.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function NeuromorphoSearchBar({ onSearch, loading }) {
  const [species, setSpecies] = useState(null);
  const [brainRegion, setBrainRegion] = useState(null);
  const [cellType, setCellType] = useState(null);
  const [archive, setArchive] = useState(null);

  const [speciesList, setSpeciesList] = useState([]);
  const [metadataOptions, setMetadataOptions] = useState({ brain_region: [], cell_type: [], archive: [] });
  const [metaLoading, setMetaLoading] = useState(false);

  // Load species on mount
  useEffect(() => {
    fetch(`${BASE}/`)
      .then((r) => r.json())
      .then((d) => setSpeciesList(sortSpecies(d.species || [])))
      .catch(console.error);
  }, []);

  // Load brain regions + cell types when species changes
  useEffect(() => {
    if (!species) {
      setMetadataOptions({ brain_region: [], cell_type: [], archive: [] });
      setBrainRegion(null);
      setCellType(null);
      setArchive(null);
      return;
    }
    setMetaLoading(true);
    fetch(`${BASE}/metadata?species=${encodeURIComponent(species)}`)
      .then((r) => {
        if (!r.ok) {
          return r.json().then((d) => { throw new Error(d.error || `HTTP ${r.status}`); });
        }
        return r.json();
      })
      .then((d) => {
        setMetadataOptions({
          brain_region: d.brain_region || [],
          cell_type: d.cell_type || [],
          archive: d.archive || [],
        });
        setBrainRegion(null);
        setCellType(null);
        setArchive(null);
      })
      .catch((e) => {
        console.error('metadata fetch failed:', e.message);
        setMetadataOptions({ brain_region: [], cell_type: [], archive: [] });
      })
      .finally(() => setMetaLoading(false));
  }, [species]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch({ species, brain_region: brainRegion || '', cell_type: cellType || '', archive: archive || '' });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        {/* Species */}
        <Autocomplete
          sx={{ width: 300 }}
          options={speciesList}
          value={species}
          onChange={(_, val) => setSpecies(val)}
          getOptionLabel={(opt) => toTitleCase(opt)}
          disabled={loading}
          renderInput={(params) => (
            <TextField {...params} label="Species" variant="outlined" />
          )}
        />

        {/* Brain Region — only shown after species selected */}
        {species && (
          <Autocomplete
            sx={{ width: 300 }}
            options={metadataOptions.brain_region}
            value={brainRegion}
            onChange={(_, val) => setBrainRegion(val)}
            disabled={loading || metaLoading}
            loading={metaLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Brain Region"
                variant="outlined"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {metaLoading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
        )}

        {/* Cell Type — only shown after species selected */}
        {species && (
          <Autocomplete
            sx={{ width: 300 }}
            options={metadataOptions.cell_type}
            value={cellType}
            onChange={(_, val) => setCellType(val)}
            disabled={loading || metaLoading}
            loading={metaLoading}
            renderInput={(params) => (
              <TextField {...params} label="Cell Type" variant="outlined" />
            )}
          />
        )}

        {/* Archive — only shown after species selected */}
        {species && (
          <Autocomplete
            sx={{ width: 300 }}
            options={metadataOptions.archive}
            value={archive}
            onChange={(_, val) => setArchive(val)}
            disabled={loading || metaLoading}
            loading={metaLoading}
            renderInput={(params) => (
              <TextField {...params} label="Archive" variant="outlined" />
            )}
          />
        )}

        <Button type="submit" variant="contained" disabled={loading || !species}>
          Search
        </Button>
      </Box>
    </form>
  );
}
