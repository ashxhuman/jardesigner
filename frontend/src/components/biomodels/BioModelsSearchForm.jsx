import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Box, Button, TextField,
    CircularProgress, TablePagination, Typography,
} from '@mui/material';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function BioModelsSearchForm({ onResults, footerEl, baseUrl = 'http://localhost:5000' }) {
    const [query, setQuery]         = useState('');
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState(null);
    const [page, setPage]           = useState(0);
    const [pageSize, setPageSize]   = useState(DEFAULT_PAGE_SIZE);
    const [rowCount, setRowCount]   = useState(0);
    const lastQuery = useRef(null);

    const _fetchPage = async (q, pg, pgSize, { showSpinner = false } = {}) => {
        if (showSpinner) setLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${baseUrl}/biomodels/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, page: pg, size: pgSize }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `Search failed (HTTP ${resp.status})`);
            }
            const data = await resp.json();
            setRowCount(data.total || 0);
            setPage(pg);
            onResults(data.models || []);
        } catch (e) {
            setError(e.message);
            setRowCount(0);
            onResults([]);
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!query.trim()) { onResults([]); setRowCount(0); return; }
        lastQuery.current = query.trim();
        await _fetchPage(lastQuery.current, 0, pageSize, { showSpinner: true });
    };

    const handlePageChange = async (_, newPage) => {
        if (lastQuery.current) await _fetchPage(lastQuery.current, newPage, pageSize);
    };

    const handleRowsPerPageChange = async (e) => {
        const newSize = parseInt(e.target.value, 10);
        setPageSize(newSize);
        if (lastQuery.current) await _fetchPage(lastQuery.current, 0, newSize);
    };

    const pagination = rowCount > 0 && (
        <TablePagination
            component="div"
            count={rowCount}
            page={page}
            rowsPerPage={pageSize}
            rowsPerPageOptions={PAGE_SIZE_OPTIONS}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
            sx={{ borderTop: '1px solid #e0e0e0' }}
        />
    );

    return (
        <>
            <Box>
                <form onSubmit={handleSubmit}>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                        <TextField
                            size="small" label="Search BioModels" variant="outlined" sx={{ flex: 1, minWidth: 240 }}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            disabled={loading}
                            placeholder="e.g. calcium oscillation, insulin, BIOMD0000000012"
                        />
                        <Button type="submit" size="small" variant="contained" disabled={loading}>
                            {loading ? <CircularProgress size={16} /> : 'Search'}
                        </Button>
                    </Box>
                </form>
                {error && <Typography color="error" variant="body2" sx={{ mt: 0.5 }}>{error}</Typography>}
            </Box>
            {footerEl && pagination && createPortal(pagination, footerEl)}
        </>
    );
}
