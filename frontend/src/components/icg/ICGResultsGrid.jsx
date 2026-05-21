import React from 'react';
import { Box, Button, IconButton, Tooltip, Chip } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { DataGrid } from '@mui/x-data-grid';

const ION_COLORS = {
  Na:  '#1976d2',
  K:   '#388e3c',
  Ca:  '#f57c00',
  KCa: '#7b1fa2',
  IH:  '#c62828',
};

export default function ICGResultsGrid({
  results, loading, total,
  paginationModel, onPaginationModelChange,
  sortModel, onSortModelChange,
  selectedId, onSelect, onRowClick,
}) {
  const columns = [
    { field: 'modeldb_id', headerName: 'ModelDB ID', width: 95 },
    {
      field: 'suffix',
      headerName: 'Suffix',
      width: 145,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <span>{params.row.suffix}</span>
        </Box>
      ),
    },
    {
      field: 'ion_class',
      headerName: 'Ion',
      width: 65,
      renderCell: (params) => (
        <Box sx={{
          px: 1, borderRadius: 1,
          bgcolor: (ION_COLORS[params.value] || '#9e9e9e') + '22',
          color: ION_COLORS[params.value] || '#424242',
          fontWeight: 700, fontSize: '0.78rem',
        }}>
          {params.value}
        </Box>
      ),
    },
    { field: 'cites', headerName: 'Cited', width: 65, type: 'number', sortable: true },
    {
      field: 'authors',
      headerName: 'Authors',
      flex: 1,
      minWidth: 140,
      valueFormatter: (value) => value || '',
    },
    { field: 'year', headerName: 'Year', width: 60 },
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 150,
      valueFormatter: (value) => value || '',
    },
    {
      field: 'view',
      headerName: 'View',
      width: 55,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Tooltip title="Open in ICGenealogy">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              const { fid, icg_id } = params.row;
              if (fid && icg_id) window.open(`https://icg.neurotheory.ox.ac.uk/channels/${fid}/${icg_id}`, '_blank');
            }}
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: 'import',
      headerName: 'Import',
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const isSelected = selectedId === params.row.id;
        return (
          <Button
            variant={isSelected ? 'contained' : 'outlined'}
            size="small"
            color={isSelected ? 'success' : 'primary'}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isSelected ? null : params.row);
            }}
          >
            {isSelected ? 'Imported' : 'Import'}
          </Button>
        );
      },
    },
  ];

  return (
    <Box sx={{ height: 430, width: '100%', mt: 2 }}>
      <DataGrid
        rows={results}
        columns={columns}
        getRowId={(row) => row.id}
        paginationMode="server"
        rowCount={total}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        pageSizeOptions={[20, 50, 100]}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        loading={loading}
        showToolbar
        disableRowSelectionOnClick
        onRowClick={(params) => onRowClick?.(params.row)}
        sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
      />
    </Box>
  );
}
