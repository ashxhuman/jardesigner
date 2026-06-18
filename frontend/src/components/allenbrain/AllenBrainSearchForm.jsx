import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, TablePagination, Typography } from '@mui/material';
import AllenBrainSearchBar from './AllenBrainSearchBar';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const toItem = (s) => ({
    id:              `ab_${s.specimen__id}`,
    name:            s.specimen__name || `Specimen ${s.specimen__id}`,
    source:          `AllenBrain/${s.donor__species || ''}`,
    description:     [s.structure__acronym, s.structure__layer, s.tag__dendrite_type].filter(Boolean).join(' · '),
    source_type:     'swc',
    topTen:          false,
    server_file:     `ab_${s.specimen__id}`,
    staged_filename: `ab_${s.specimen__id}`,
});

export default function AllenBrainSearchForm({ onResults, footerEl, baseUrl = 'http://localhost:5000' }) {
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);
    const [page, setPage]       = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [rowCount, setRowCount] = useState(0);
    const lastQuery = useRef(null);

    const _fetchPage = async (query, pg, pgSize, { showSpinner = false } = {}) => {
        if (showSpinner) setLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${baseUrl}/allenbrain/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...query, page: pg, size: pgSize }),
            });
            if (!resp.ok) throw new Error('Search failed');
            const data = await resp.json();
            setRowCount(data.total || 0);
            setPage(pg);
            onResults((data.neurons || []).map(toItem));
        } catch (e) {
            setError(e.message);
            setRowCount(0);
            onResults([]);
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    const handleSearch = async (query) => {
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
                <AllenBrainSearchBar onSearch={handleSearch} loading={loading} baseUrl={baseUrl} />
                {error && <Typography color="error" variant="body2" sx={{ mt: 0.5 }}>{error}</Typography>}
            </Box>
            {footerEl && pagination && createPortal(pagination, footerEl)}
        </>
    );
}
