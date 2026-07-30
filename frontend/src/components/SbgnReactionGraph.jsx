import React, { useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import CytoscapeComponent from 'react-cytoscapejs';
import sbgnStylesheet from 'cytoscape-sbgn-stylesheet';
import { Box, Paper, IconButton, Typography } from '@mui/material';
import { ZoomIn, ZoomOut, CenterFocusStrong } from '@mui/icons-material';
import { graphDataToSbgnElements } from '../utils/sbgnTransform';

const stylesheet = sbgnStylesheet(cytoscape);

const SbgnReactionGraph = ({ graphData }) => {
  const cyRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const elements = useMemo(
    () => CytoscapeComponent.normalizeElements(graphDataToSbgnElements(graphData)),
    [graphData]
  );

  const handleCy = (cy) => {
    cyRef.current = cy;
    cy.removeAllListeners();
    // Applied directly (not via the `stylesheet` prop): that prop round-trips
    // through Cytoscape's .fromJson(), which expects plain JSON and chokes on
    // the compiled Stylesheet instance sbgnStylesheet(cytoscape) returns.
    cy.style(stylesheet);
    cy.on('tap', 'node', (evt) => {
      const data = evt.target.data();
      if (data.class === 'compartment') return;
      setSelectedNode(data);
    });
    cy.on('tap', (evt) => {
      if (evt.target === cy) setSelectedNode(null);
    });
    cy.fit(undefined, 30);
  };

  if (!graphData) {
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
        <Typography sx={{ color: '#888' }}>No Graph Data</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', bgcolor: '#f5f5f5' }}>
      <CytoscapeComponent
        elements={elements}
        layout={{ name: 'preset' }}
        cy={handleCy}
        style={{ width: '100%', height: '100%' }}
      />

      <Paper elevation={2} sx={{ position: 'absolute', bottom: 10, left: 10, zIndex: 10 }}>
        <IconButton size="small" onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)}>
          <ZoomIn />
        </IconButton>
        <IconButton size="small" onClick={() => cyRef.current?.zoom(cyRef.current.zoom() / 1.2)}>
          <ZoomOut />
        </IconButton>
        <IconButton size="small" onClick={() => cyRef.current?.fit(undefined, 30)}>
          <CenterFocusStrong />
        </IconButton>
      </Paper>

      {selectedNode && (
        <Paper sx={{ position: 'absolute', top: 10, left: 10, p: 1.5, zIndex: 10, maxWidth: 280, border: '1px solid #ccc', boxShadow: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{selectedNode.label}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>{selectedNode.class}</Typography>
          {selectedNode.metadata && Object.entries(selectedNode.metadata).map(([k, v]) => {
            if (['name', 'className', 'path'].includes(k)) return null;
            return (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ marginRight: 10, color: '#555' }}>{k}:</span>
                <b>{typeof v === 'number' ? v.toPrecision(4) : v}</b>
              </Box>
            );
          })}
        </Paper>
      )}
    </Box>
  );
};

export default SbgnReactionGraph;
