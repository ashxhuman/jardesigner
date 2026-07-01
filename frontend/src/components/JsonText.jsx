// src/components/JsonText.jsx

import React, { useState } from 'react';
import { Box, TextField, Button } from '@mui/material';

const JsonText = ({ jsonString }) => {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <Box sx={{
      height: '100%',
      p: 2,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Button
        variant="contained"
        fullWidth
        onClick={() => setRefreshKey(k => k + 1)}
        sx={{ mb: 2, flexShrink: 0 }}
      >
        Show Model JSON
      </Button>

      <TextField
        key={refreshKey}
        fullWidth
        multiline
        // MODIFIED: Value is now only the original jsonString
        value={jsonString || ''}
        InputProps={{
          readOnly: true,
        }}
        variant="outlined"
        sx={{
          flexGrow: 1,
          '& .MuiInputBase-root': {
            height: '100%',
            alignItems: 'flex-start',
          },
        }}
      />
    </Box>
  );
};

export default JsonText;
