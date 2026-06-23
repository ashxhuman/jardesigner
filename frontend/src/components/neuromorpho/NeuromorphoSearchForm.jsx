import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, TablePagination, Typography } from '@mui/material';
import NeuromorphoSearchBar from './NeuromorphoSearchBar';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const toItem = (n) => ({
    id:              `nm_${n.neuron_id}`,
    name:            n.neuron_name,
    source:          `NeuroMorpho / ${n.archive || ''}`,
    description:     [n.species, n.brain_region, n.cell_type].filter(Boolean).join(' '),
    source_type:     'swc',
    topTen:          false,
    server_file:     `nm_${n.neuron_id}`,
    staged_filename: `nm_${n.neuron_id}`,
    ...(n.note || n.reference ? {
        details: {
            ...(n.note      && { full_description: n.note }),
            ...(n.reference && { references: [{ text: n.reference, url: n.doi || '' }] }),
        },
    } : {}),
});

export default function NeuromorphoSearchForm({ onResults, footerEl, baseUrl = 'http://localhost:5000' }) {
    const [searching, setSearching]   = useState(false);
    const [error, setError]           = useState(null);
    const [page, setPage]             = useState(0);
    const [pageSize, setPageSize]     = useState(DEFAULT_PAGE_SIZE);
    const [rowCount, setRowCount]     = useState(0);
    const lastQuery = useRef(null);

    const _fetchPage = async (query, pg, pgSize, { showSpinner = false } = {}) => {
        if (showSpinner) setSearching(true);
        setError(null);
        try {
            const resp = await fetch(`${baseUrl}/neuromorpho/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...query, page: pg, size: pgSize }),
            });
            if (!resp.ok) throw new Error('Search failed');
            const data = await resp.json();
            setRowCount(data.page?.totalElements || 0);
            setPage(pg);
            onResults((data.neurons || []).map(toItem));
        } catch (e) {
            setError(e.message);
            setRowCount(0);
            onResults([]);
        } finally {
            if (showSpinner) setSearching(false);
        }
    };

    const handleSearch = async (query) => {
        if (!query.species) { setError('Please select a species.'); return; }
        lastQuery.current = query;
        await _fetchPage(query, 0, pageSize, { showSpinner: true });
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
                <NeuromorphoSearchBar onSearch={handleSearch} loading={searching} baseUrl={baseUrl} />
                {error && <Typography color="error" variant="body2" sx={{ mt: 0.5 }}>{error}</Typography>}
            </Box>
            {footerEl && pagination && createPortal(pagination, footerEl)}
        </>
    );
}
