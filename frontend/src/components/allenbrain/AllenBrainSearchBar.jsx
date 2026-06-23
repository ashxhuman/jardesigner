import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Autocomplete,
  TextField,
  CircularProgress,
} from '@mui/material';

const SPECIES_OPTIONS = ['Homo Sapiens', 'Mus musculus'];

// Sort key for layer strings: "1"→1, "2/3"→2.33, "6a"→6.1, "6b"→6.2
function layerSortKey(l) {
  if (l.includes('/')) {
    const [a, b] = l.split('/').map(Number);
    return a + 1 / (b + 1);
  }
  const m = l.match(/^(\d+)([a-z]?)$/);
  if (m) return Number(m[1]) + ({ a: 0.1, b: 0.2, c: 0.3 }[m[2]] || 0);
  return 99;
}

export default function AllenBrainSearchBar({ onSearch, onClear, loading, baseUrl = 'http://localhost:5000' }) {
  const [species, setSpecies]   = useState(null);
  const [area, setArea]         = useState(null);
  const [layer, setLayer]       = useState(null);
  const [lineName, setLineName] = useState(null);

  const [meta, setMeta]           = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);

  // Fetch species-specific metadata when species changes.
  // Fix 1 (race condition): AbortController cancels in-flight request when species changes again.
  // Fix 3 (stale values): downstream fields reset here, not in onChange, so they're always
  //   cleared before the new options arrive regardless of how quickly species changes.
  useEffect(() => {
    setArea(null);
    setLayer(null);
    setLineName(null);
    if (!species) {
      setMeta(null);
      return;
    }
    const controller = new AbortController();
    setMetaLoading(true);
    fetch(`${baseUrl}/allenbrain/metadata?species=${encodeURIComponent(species)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => setMeta(d))
      .catch((e) => { if (e.name !== 'AbortError') console.error(e); })
      .finally(() => setMetaLoading(false));

    return () => controller.abort();
  }, [species, baseUrl]);

  const areaMap  = {};
  (meta?.brain_areas || []).forEach((a) => { areaMap[a.acronym] = a; });
  const areaOpts  = Object.keys(areaMap).sort((a, b) => a.localeCompare(b));

  const layerOpts = (meta?.layers || [])
    .slice()
    .sort((a, b) => layerSortKey(a) - layerSortKey(b));

  const lineOpts  = species === 'Mus musculus' ? (meta?.line_names || []) : [];

  const handleClear = () => {
    setSpecies(null);
    setArea(null);
    setLayer(null);
    setLineName(null);
    if (onClear) onClear();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!species) return;

    const entry      = area ? areaMap[area] : null;
    const isParent   = entry?.is_parent ?? false;

    onSearch({
      species,
      brain_area_acronym:        isParent ? '' : (area || ''),
      brain_area_parent_acronym: isParent ? area : '',
      layer:                     layer || '',
      line_name:                 lineName || '',
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>

        {/* Species */}
        <Autocomplete
          size="small"
          sx={{ width: 200 }}
          options={SPECIES_OPTIONS}
          value={species}
          onChange={(_, val) => setSpecies(val)}
          disabled={loading}
          renderInput={(params) => (
            <TextField {...params} label="Species" size="small" variant="outlined" />
          )}
        />

        {/* Brain Area — always rendered once species is chosen; disabled while loading
            Fix 2 (layout shift): keeps form width stable during metadata fetch */}
        <Autocomplete
          size="small"
          sx={{ width: 220, display: species ? 'inline-flex' : 'none' }}
          options={areaOpts}
          value={area}
          onChange={(_, val) => setArea(val)}
          disabled={!species || loading || metaLoading}
          loading={metaLoading}
          getOptionLabel={(opt) => `${opt} — ${areaMap[opt]?.name || ''}`}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Brain Area"
              size="small"
              variant="outlined"
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {metaLoading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />

        {/* Cortical Layer — always rendered, hidden until species chosen */}
        <Autocomplete
          size="small"
          sx={{ width: 140, display: species ? 'inline-flex' : 'none' }}
          options={layerOpts}
          value={layer}
          onChange={(_, val) => setLayer(val)}
          disabled={!species || loading || metaLoading}
          loading={metaLoading}
          getOptionLabel={(opt) => `Layer ${opt}`}
          renderInput={(params) => (
            <TextField {...params} label="Layer" size="small" variant="outlined" />
          )}
        />

        {/* Transgenic Line — rendered only for mouse (lineOpts appear after meta loads) */}
        <Autocomplete
          size="small"
          sx={{ width: 200, display: species === 'Mus musculus' ? 'inline-flex' : 'none' }}
          options={lineOpts}
          value={lineName}
          onChange={(_, val) => setLineName(val)}
          disabled={!species || loading || metaLoading}
          loading={metaLoading}
          renderInput={(params) => (
            <TextField {...params} label="Transgenic Line" size="small" variant="outlined" />
          )}
        />

        <Button size="medium" type="submit" variant="contained" disabled={loading || !species}>
          Search
        </Button>
        {species && (
          <Button size="medium" variant="text" onClick={handleClear} disabled={loading}>
            Clear
          </Button>
        )}

      </Box>
    </form>
  );
}
