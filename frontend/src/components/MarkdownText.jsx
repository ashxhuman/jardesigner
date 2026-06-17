import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Typography, CircularProgress } from '@mui/material';

// Helper function to generate slug from text (converts heading to anchor ID)
const generateSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
};

const MarkdownText = () => {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [clickedLinks, setClickedLinks] = useState(new Set());

  useEffect(() => {
    // Fetch the markdown file from the public folder
    // Note that this does not use the /api/ prefix as it is a static
    // frontend asset. It lives in the public folder.
    fetch('documentation.md')
      .then(response => response.text())
      .then(text => {
        setMarkdown(text);
        setLoading(false);
      })
      .catch(error => {
        console.error("Error fetching documentation:", error);
        setMarkdown("# Error\n\nCould not load the documentation file.");
        setLoading(false);
      });
  }, []);

  // Handle link click - add to clicked set
  const handleLinkClick = (href) => {
    setClickedLinks(prev => new Set(prev).add(href));
  };

  // Custom components to add IDs to headings for anchor links
  const components = {
    h1: ({ children }) => <h1 id={generateSlug(String(children))}>{children}</h1>,
    h2: ({ children }) => <h2 id={generateSlug(String(children))}>{children}</h2>,
    h3: ({ children }) => <h3 id={generateSlug(String(children))}>{children}</h3>,
    h4: ({ children }) => <h4 id={generateSlug(String(children))}>{children}</h4>,
    h5: ({ children }) => <h5 id={generateSlug(String(children))}>{children}</h5>,
    h6: ({ children }) => <h6 id={generateSlug(String(children))}>{children}</h6>,
    a: ({ href, children }) => {
      const isClicked = clickedLinks.has(href);
      return (
        <a
          href={href}
          onClick={() => handleLinkClick(href)}
          style={{ 
            color: isClicked ? '#9c27b0' : '#1976d2',
          }}
        >
          {children}
        </a>
      );
    },
  };

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      ) : (
        // The 'prose' class is a common convention for styling markdown output.
        // You would need to add CSS for it, but MUI's Typography handles most styling.
        <Typography component="div" className="prose">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={components}
          >
            {markdown}
          </ReactMarkdown>
        </Typography>
      )}
    </Box>
  );
};

export default MarkdownText;