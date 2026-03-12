import React, { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

// Inline detail view for a single neuron (mirrors ModelDetails.jsx)
function NeuronDetail({ neuron }) {
  if (!neuron) return null;
  const fields = [
    ['Neuron ID', neuron.neuron_id],
    ['Archive', neuron.archive],
    ['Species', neuron.species],
    ['Brain Region', Array.isArray(neuron.brain_region) ? neuron.brain_region.join(', ') : neuron.brain_region],
    ['Cell Type', Array.isArray(neuron.cell_type) ? neuron.cell_type.join(', ') : neuron.cell_type],
    ['Age', neuron.age_classification],
    ['Gender', neuron.gender],
    ['Reconstruction Software', neuron.reconstruction_software],
    ['Protocol', neuron.protocol],
  ];
  return (
    <Box sx={{ minWidth: 320 }}>
      <Typography variant="h6" gutterBottom>{neuron.neuron_name}</Typography>
      <Divider sx={{ mb: 2 }} />
      {fields.map(([label, value]) =>
        value ? (
          <Box key={label} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" component="span" sx={{ fontWeight: 'bold' }}>
              {label}:
            </Typography>
            <Typography variant="body2" component="span" color="text.secondary" sx={{ ml: 1 }}>
              {value}
            </Typography>
          </Box>
        ) : null
      )}
      {neuron.png_url && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="subtitle2" gutterBottom>Morphology</Typography>
          <img
            src={neuron.png_url}
            alt={neuron.neuron_name}
            style={{ maxWidth: '100%', borderRadius: 4 }}
            onError={(e) => { e.target.parentElement.style.display = 'none'; }}
          />
        </Box>
      )}
    </Box>
  );
}

export default function NeuromorphoResultsGrid({ results, loading, rowCount, paginationMode, paginationModel, onPaginationModelChange, cart, onCartChange, selectMorphology, mountMorphology }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedNeuron, setSelectedNeuron] = useState(null);

  const cartSet = new Set(cart);

  const handleDetails = (neuron) => {
    setSelectedNeuron(neuron);
    setDetailOpen(true);
  };

  const toggleCart = (neuronId) => {
    if (cartSet.has(neuronId)) {
      onCartChange(cart.filter((id) => id !== neuronId));
    } else {
      onCartChange([...cart, neuronId]);
    }
  };

  const columns = [
    { field: 'neuron_name', headerName: 'Neuron Name', width: 220 },
    { field: 'neuron_id', headerName: 'ID', width: 100 },
    { field: 'archive', headerName: 'Archive', width: 130 },
    {
      field: 'brain_region',
      headerName: 'Brain Region',
      width: 160,
      valueFormatter: (value) =>
        Array.isArray(value) ? value.join(', ') : value ?? '',
    },
    {
      field: 'cell_type',
      headerName: 'Cell Type',
      width: 150,
      valueFormatter: (value) =>
        Array.isArray(value) ? value.join(', ') : value ?? '',
    },
    {
      field: 'details',
      headerName: 'More Details',
      width: 110,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          onClick={(e) => { e.stopPropagation(); handleDetails(params.row); }}
        >
          Details
        </Button>
      ),
    },

    // Use this when trying to download multiple swc files and comment the Select Morphology
    // {
    //   field: "cart",
    //   headerName: "Cart",
    //   width: 130,
    //   sortable: false,
    //   filterable: false,
    //   renderCell: (params) => {
    //     const inCart = cartSet.has(params.row.neuron_id);
    //     return (
    //       <Button
    //         variant={inCart ? "contained" : "outlined"}
    //         size="small"
    //         color={inCart ? "success" : "primary"}
    //         onClick={(e) => { e.stopPropagation(); toggleCart(params.row.neuron_id); }}
    //       >
    //         {inCart ? "✓ Added" : "Add"}
    //       </Button>
    //     );
    //   },
    // },

    {
      field: 'Import',
      headerName: 'Import',
      width: 130,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const isSelected = mountMorphology === params.row.neuron_id;
        return (
            <Button
                variant={isSelected ? 'contained' : 'outlined'}
                size="small"
                color={isSelected ? 'success' : 'primary'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSelected) {
                    selectMorphology(null);
                  }
                  else{
                    selectMorphology(params.row);
                  }
                }}
            >
              {isSelected ? 'Imported' : 'Import'}
            </Button>
        );
      },
    },
  ];

  return (
    <Box sx={{ display: 'flex', height: 450, width: '100%', marginTop: '20px' }}>
      <Box sx={{ flex: 1, height: '100%' }}>
        <DataGrid
          rows={results}
          columns={columns}
          getRowId={(row) => row.neuron_id}
          paginationMode={paginationMode}
          rowCount={rowCount}
          paginationModel={paginationModel}
          onPaginationModelChange={onPaginationModelChange}
          pageSizeOptions={[20, 50, 100]}
          loading={loading}
          showToolbar
          disableRowSelectionOnClick
        />
      </Box>

      {/* Neuron detail dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth='sm' fullWidth>
      <DialogTitle>
      Neuron Details
              <IconButton
        size="small"
        onClick={() =>
                  window.open(
          `https://neuromorpho.org/neuron_info.jsp?neuron_name=${selectedNeuron.neuron_name}`,
          '_blank'
        )
        }
      >
      <OpenInNewIcon />
    </IconButton>
  </DialogTitle>        
  <DialogContent>
        <NeuronDetail neuron={selectedNeuron} />

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
