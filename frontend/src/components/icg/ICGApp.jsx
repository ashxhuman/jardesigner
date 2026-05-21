import React, { useState, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import ICGSearchBar from './ICGSearchBar';
import ICGResultsGrid from './ICGResultsGrid';
import ICGDetailPanel from './ICGDetailPanel';

const BASE = `http://${window.location.hostname}:5000/icg`;

export default function ICGApp({ onChanImport, onClose }) {
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [searched, setSearched]     = useState(false);
  const [total, setTotal]           = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [detailRow, setDetailRow]   = useState(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 20 });
  const [sortModel, setSortModel] = useState([]);

  const lastQuery = useRef(null);
  const lastSort  = useRef([]);

  const _fetchPage = async (query, page, pageSize, sort = lastSort.current) => {
    setLoading(true);
    setError(null);
    const sortParam = sort[0] ? { sort_by: sort[0].field, sort_dir: sort[0].sort } : {};
    try {
      const resp = await fetch(`${BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...query, page, size: pageSize, ...sortParam }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Search failed (HTTP ${resp.status})`);
      }
      const data = await resp.json();
      setResults(data.channels || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message);
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    lastQuery.current = query;
    setSearched(true);
    const newModel = { page: 0, pageSize: paginationModel.pageSize };
    setPaginationModel(newModel);
    await _fetchPage(query, 0, newModel.pageSize);
  };

  const handlePaginationChange = async (newModel) => {
    setPaginationModel(newModel);
    if (lastQuery.current) await _fetchPage(lastQuery.current, newModel.page, newModel.pageSize);
  };

  const handleSortChange = async (newSort) => {
    setSortModel(newSort);
    lastSort.current = newSort;
    if (lastQuery.current) {
      setPaginationModel(prev => ({ ...prev, page: 0 }));
      await _fetchPage(lastQuery.current, 0, paginationModel.pageSize, newSort);
    }
  };

  const handleReset = () => {
    setResults([]);
    setTotal(0);
    setSearched(false);
    setError(null);
    setSelectedId(null);
    setDetailRow(null);
    setPaginationModel({ page: 0, pageSize: 20 });
    lastQuery.current = null;
  };

  const handleSelect = (row) => {
    if (!row) { setSelectedId(null); return; }
    setSelectedId(row.id);
    onChanImport?.({ type: 'icg', modeldb_id: row.modeldb_id, suffix: row.suffix });
    onClose?.();
  };

  const handleRowClick = (row) => {
    setDetailRow(prev => (prev?.id === row.id ? null : row));
  };

  return (
    <Box sx={{ p: 2 }}>
      <ICGSearchBar onSearch={handleSearch} onReset={handleReset} loading={loading} />

      {error && (
        <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>
      )}

      {searched && (
        <Box sx={{ display: 'flex', gap: 0, mt: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ICGResultsGrid
              results={results}
              loading={loading}
              total={total}
              paginationModel={paginationModel}
              onPaginationModelChange={handlePaginationChange}
              sortModel={sortModel}
              onSortModelChange={handleSortChange}
              selectedId={selectedId}
              onSelect={handleSelect}
              onRowClick={handleRowClick}
            />
          </Box>
          <ICGDetailPanel
            row={detailRow}
            onClose={() => setDetailRow(null)}
          />
        </Box>
      )}
    </Box>
  );
}
