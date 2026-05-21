import React, { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Autocomplete, CircularProgress,
  Chip, Typography, Collapse, Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

const BASE = `http://${window.location.hostname}:5000/icg`;

const ION_COLORS = {
  Na:  { bg: '#e3f0ff', border: '#1976d2', text: '#0d47a1' },
  K:   { bg: '#e8f5e9', border: '#388e3c', text: '#1b5e20' },
  Ca:  { bg: '#fff3e0', border: '#f57c00', text: '#e65100' },
  KCa: { bg: '#f3e5f5', border: '#7b1fa2', text: '#4a148c' },
  IH:  { bg: '#fce4ec', border: '#c62828', text: '#b71c1c' },
};

export default function ICGSearchBar({ onSearch, onReset, loading }) {
  const [options, setOptions] = useState({
    ion_classes: [], ion_counts: {}, suffixes: [], years: [], api_classes: [],
  });
  const [metaLoading, setMetaLoading] = useState(false);

  const [ionClass, setIonClass]   = useState(null);
  const [suffix, setSuffix]       = useState(null);
  const [year, setYear]           = useState(null);
  const [author, setAuthor]       = useState('');
  const [modeldbId, setModeldbId] = useState('');
  const [apiFilters, setApiFilters] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setMetaLoading(true);
    fetch(`${BASE}/options`)
      .then(r => r.json())
      .then(d => setOptions({
        ion_classes: d.ion_classes || [],
        ion_counts:  d.ion_counts  || {},
        suffixes:    d.suffixes    || [],
        years:       d.years       || [],
        api_classes: d.api_classes || [],
      }))
      .catch(console.error)
      .finally(() => setMetaLoading(false));
  }, []);

  const buildQuery = (overrides = {}) => {
    const ic  = overrides.ionClass    !== undefined ? overrides.ionClass    : ionClass;
    const sf  = overrides.suffix      !== undefined ? overrides.suffix      : suffix;
    const yr  = overrides.year        !== undefined ? overrides.year        : year;
    const au  = overrides.author      !== undefined ? overrides.author      : author;
    const mid = overrides.modeldbId   !== undefined ? overrides.modeldbId   : modeldbId;
    const af  = overrides.apiFilters  !== undefined ? overrides.apiFilters  : apiFilters;
    const apiF = {};
    Object.entries(af).forEach(([cid, sub]) => { if (sub) apiF[cid] = sub.id; });
    return { ion_class: ic || '', suffix: sf || '', year: yr || '', author: au, modeldb_id: mid || '', api_filters: apiF };
  };

  const handleCardClick = (ic) => {
    const next = ionClass === ic ? null : ic;
    setIonClass(next);
    onSearch(buildQuery({ ionClass: next }));
  };

  const handleApiFilterChange = (classId, subclass) => {
    const next = { ...apiFilters, [classId]: subclass };
    setApiFilters(next);
    onSearch(buildQuery({ apiFilters: next }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(buildQuery());
  };

  const handleReset = () => {
    setIonClass(null);
    setSuffix(null);
    setYear(null);
    setAuthor('');
    setModeldbId('');
    setApiFilters({});
    onReset?.();
  };

  const disabled = loading || metaLoading;
  const activeApiCount = Object.values(apiFilters).filter(Boolean).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

      {/* Ion class pills */}
      {metaLoading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={14} thickness={5} />
          <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: 0.3 }}>
            Loading channels…
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {options.ion_classes.map(ic => {
            const c = ION_COLORS[ic] || { bg: '#f3f4f6', border: '#6b7280', text: '#374151', glow: '#6b728033' };
            const selected = ionClass === ic;
            return (
              <Box
                key={ic}
                onClick={() => !disabled && handleCardClick(ic)}
                sx={{
                  cursor: disabled ? 'default' : 'pointer',
                  px: 2, py: 0.75,
                  borderRadius: 2,
                  border: `2px solid ${selected ? c.border : c.border + '88'}`,
                  bgcolor: selected ? c.border : c.bg,
                  color: selected ? '#fff' : c.text,
                  userSelect: 'none',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: disabled ? undefined : selected ? c.border : c.border + '22' },
                  minWidth: 70,
                  textAlign: 'center',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{ic}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.85 }}>
                  {options.ion_counts[ic] ?? ''}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Search row */}
      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={0}
        sx={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1,
          p: 1.25, borderRadius: 3,
          border: '1.5px solid', borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Autocomplete
          sx={{ width: 190 }}
          options={options.suffixes}
          value={suffix}
          onChange={(_, val) => setSuffix(val)}
          disabled={disabled}
          renderInput={(params) => (
            <TextField {...params} size="small" label="Suffix" variant="outlined"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          )}
        />
        <Autocomplete
          sx={{ width: 120 }}
          options={options.years}
          value={year}
          onChange={(_, val) => setYear(val)}
          disabled={disabled}
          renderInput={(params) => (
            <TextField {...params} size="small" label="Year" variant="outlined"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          )}
        />
        <TextField
          sx={{ width: 120, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          size="small"
          label="ModelDB ID"
          variant="outlined"
          value={modeldbId}
          onChange={e => setModeldbId(e.target.value.replace(/\D/g, ''))}
          disabled={disabled}
          inputProps={{ inputMode: 'numeric' }}
        />
        <TextField
          sx={{ width: 190, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          size="small"
          label="Author (partial)"
          variant="outlined"
          value={author}
          onChange={e => setAuthor(e.target.value)}
          disabled={disabled}
        />
        <Box sx={{ display: 'flex', gap: 0.75, ml: 'auto' }}>
          <Button
            type="submit"
            variant="contained"
            disabled={disabled}
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <SearchIcon />}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, px: 2.5 }}
          >
            Search
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            disabled={disabled}
            onClick={handleReset}
            startIcon={<RestartAltIcon />}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, color: 'text.secondary', borderColor: 'divider' }}
          >
            Clear
          </Button>
        </Box>
      </Paper>

      {/* More filters toggle + panel */}
      {options.api_classes.length > 0 && (
        <Box>
          <Button
            size="small"
            onClick={() => setFiltersOpen(o => !o)}
            startIcon={<TuneIcon sx={{ fontSize: '1rem !important' }} />}
            endIcon={
              <ExpandMoreIcon sx={{
                fontSize: '1rem !important',
                transition: 'transform 0.2s',
                transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }} />
            }
            sx={{
              textTransform: 'none', fontWeight: 700, fontSize: '0.8rem',
              borderRadius: 2, px: 1.5, py: 0.5,
              color: filtersOpen ? 'primary.main' : 'text.secondary',
              bgcolor: filtersOpen ? 'primary.50' : 'transparent',
              border: '1.5px solid',
              borderColor: filtersOpen ? 'primary.main' : 'divider',
              '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: 'primary.50' },
            }}
          >
            More filters
            {activeApiCount > 0 && (
              <Box component="span" sx={{
                ml: 0.75, minWidth: 18, height: 18, px: 0.5,
                borderRadius: '999px', bgcolor: 'primary.main', color: '#fff',
                fontSize: '0.65rem', fontWeight: 800, lineHeight: '18px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {activeApiCount}
              </Box>
            )}
          </Button>

          <Collapse in={filtersOpen}>
            <Paper
              elevation={0}
              sx={{
                mt: 1, p: 1.5, borderRadius: 3,
                border: '1.5px solid', borderColor: 'primary.light',
                bgcolor: 'primary.50',
                display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
                Filter by
              </Typography>
              {options.api_classes.map(cls => (
                <Autocomplete
                  key={cls.id}
                  sx={{ width: 175 }}
                  options={cls.subclasses}
                  value={apiFilters[cls.id] || null}
                  onChange={(_, val) => handleApiFilterChange(String(cls.id), val)}
                  getOptionLabel={(opt) => opt.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  disabled={disabled}
                  renderInput={(params) => (
                    <TextField {...params} size="small" label={cls.name} variant="outlined"
                      sx={{ bgcolor: 'background.paper', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                  )}
                />
              ))}
            </Paper>
          </Collapse>
        </Box>
      )}

      {/* Active filter chips */}
      {(ionClass || activeApiCount > 0) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {ionClass && (() => {
            const c = ION_COLORS[ionClass] || {};
            return (
              <Chip
                label={`Ion · ${ionClass}`}
                size="small"
                onDelete={() => { setIonClass(null); onSearch(buildQuery({ ionClass: null })); }}
                sx={{
                  bgcolor: c.bg, color: c.text, fontWeight: 700, fontSize: '0.72rem',
                  border: `1px solid ${c.border}55`,
                  '& .MuiChip-deleteIcon': { color: c.text + 'aa', '&:hover': { color: c.text } },
                }}
              />
            );
          })()}
          {Object.entries(apiFilters).map(([cid, sub]) => sub && (
            <Chip
              key={cid}
              label={`${options.api_classes.find(c => String(c.id) === cid)?.name} · ${sub.name}`}
              size="small"
              onDelete={() => handleApiFilterChange(cid, null)}
              sx={{ fontWeight: 600, fontSize: '0.72rem' }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
