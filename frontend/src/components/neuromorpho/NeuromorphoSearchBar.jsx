import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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

export default function NeuromorphoSearchBar({ onSearch, loading }) {
  const [species, setSpecies] = useState('');
  const [brainRegion, setBrainRegion] = useState('');
  const [cellType, setCellType] = useState('');
  const [archive, setArchive] = useState('');

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
      setBrainRegion('');
      setCellType('');
      setArchive('');
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
        setBrainRegion('');
        setCellType('');
        setArchive('');
      })
      .catch((e) => {
        console.error('metadata fetch failed:', e.message);
        setMetadataOptions({ brain_region: [], cell_type: [] });
      })
      .finally(() => setMetaLoading(false));
  }, [species]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch({ species, brain_region: brainRegion, cell_type: cellType, archive });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        {/* Species */}
        <FormControl sx={{ width: 200 }} variant="outlined">
          <InputLabel id="nm-species-label">Species</InputLabel>
          <Select
            labelId="nm-species-label"
            value={species}
            label="Species"
            onChange={(e) => setSpecies(e.target.value)}
            disabled={loading}
          >
            {speciesList.map((s) => (
              <MenuItem key={s} value={s}>{s.toLowerCase().split(' ').map(function(word) {return word.charAt(0).toUpperCase() + word.slice(1);}).join(' ')}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Brain Region — only shown after species selected */}
        {species && (
          <FormControl sx={{ width: 220 }} variant="outlined">
            <InputLabel id="nm-region-label">Brain Region</InputLabel>
            <Select
              labelId="nm-region-label"
              value={brainRegion}
              label="Brain Region"
              onChange={(e) => setBrainRegion(e.target.value)}
              disabled={loading || metaLoading}
              endAdornment={metaLoading ? <CircularProgress size={16} sx={{ mr: 3 }} /> : null}
            >
              <MenuItem value=""><em>Any</em></MenuItem>
              {metadataOptions.brain_region.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Cell Type — only shown after species selected */}
        {species && (
          <FormControl sx={{ width: 200 }} variant="outlined">
            <InputLabel id="nm-celltype-label">Cell Type</InputLabel>
            <Select
              labelId="nm-celltype-label"
              value={cellType}
              label="Cell Type"
              onChange={(e) => setCellType(e.target.value)}
              disabled={loading || metaLoading}
            >
              <MenuItem value=""><em>Any</em></MenuItem>
              {metadataOptions.cell_type.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Archive — only shown after species selected */}
        {species && (
          <FormControl sx={{ width: 200 }} variant="outlined">
            <InputLabel id="nm-archive-label">Archive</InputLabel>
            <Select
              labelId="nm-archive-label"
              value={archive}
              label="Archive"
              onChange={(e) => setArchive(e.target.value)}
              disabled={loading || metaLoading}
            >
              <MenuItem value=""><em>Any</em></MenuItem>
              {metadataOptions.archive.map((a) => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Button type="submit" variant="contained" disabled={loading || !species}>
          Search
        </Button>
      </Box>
    </form>
  );
}