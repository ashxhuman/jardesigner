// Maps the Graphviz dot-json reaction graph payload (see jarReacGraph.py /
// ReactionGraph.jsx) onto Cytoscape.js elements styled with cytoscape-sbgn-stylesheet.
// Pure transform, no side effects - safe to call from useMemo.

const SPECIES_CLASSNAMES = new Set(['Pool', 'BufPool', 'ConcChan']);
const PROCESS_CLASSNAMES = new Set(['Reac', 'Enz', 'MMenz', 'Function']);

const SBGN_NODE_CLASS = {
  Pool: 'simple chemical',
  BufPool: 'simple chemical',
  ConcChan: 'unspecified entity',
  Reac: 'process',
  Enz: 'process',
  MMenz: 'process',
  Function: 'process',
};

function nodeClassFor(className) {
  return SBGN_NODE_CLASS[className] || 'unspecified entity';
}

// jarReacGraph.py's DOT source leaves Pool/BufPool nodes auto-sized to their
// (usually short) label text, so Graphviz packs them far tighter than the
// fixed SBGN glyph sizes cytoscape-sbgn-stylesheet enforces (e.g. 48x48 for
// "simple chemical" - see element.js). Spread the reused positions out so
// same-size-in-Graphviz nodes don't collide once forced to SBGN's fixed size.
const POSITION_SCALE = 2.2;

// jarReacGraph.py's findGroup_compt() walks up an element's MOOSE ownership
// chain to its nearest compartment ancestor - not necessarily the immediate
// parent. Enzymes in particular sit one level deeper, under their parent
// pool (e.g. ".../kinetics[0]/a[0]/enz2[0]") rather than directly under the
// compartment. Mirror that by walking every ancestor segment (nearest first)
// and returning the first one that matches a known cluster label. Cluster
// labels are the plain compartment name (grp_obj.name); MOOSE paths carry an
// array-index suffix per segment (e.g. "kinetics[0]") that has to be stripped
// before comparing.
function compartmentNameFromPath(path, knownCompartmentNames) {
  if (!path) return null;
  const parts = path.split('/').filter(Boolean).map((p) => p.replace(/\[\d+\]$/, ''));
  for (let i = parts.length - 2; i >= 0; i--) {
    if (knownCompartmentNames.has(parts[i])) return parts[i];
  }
  return null;
}

export function graphDataToSbgnElements(graphData) {
  if (!graphData?.objects) return { nodes: [], edges: [] };

  // Graphviz's -Tjson `edges[].tail`/`.head` are _gvid indices into `objects`
  // (array position, not the node's `name` string) - resolve through this map.
  const nodeByGvid = graphData.objects.reduce((acc, obj) => {
    acc[obj._gvid] = obj;
    return acc;
  }, {});

  const clusters = graphData.objects.filter((obj) => obj.name.startsWith('cluster_'));
  const plainNodes = graphData.objects.filter((obj) => !obj.name.startsWith('cluster_'));

  const clusterIdByLabel = clusters.reduce((acc, cluster) => {
    if (cluster.label) acc[cluster.label] = cluster.name;
    return acc;
  }, {});
  const knownCompartmentNames = new Set(Object.keys(clusterIdByLabel));

  // cytoscape-sbgn-stylesheet's glyph drawers read these fields unguarded
  // (e.g. node.data('unitsOfInformation').length) - every node needs them,
  // not just ones that actually have state variables / clone markers.
  const sbgnDefaults = {
    stateVariables: [],
    unitsOfInformation: [],
    clonemarker: false,
  };

  const nodes = [
    ...clusters.map((cluster) => ({
      data: {
        id: cluster.name,
        class: 'compartment',
        label: cluster.label || cluster.name.replace(/^cluster_/, ''),
        ...sbgnDefaults,
      },
    })),
    ...plainNodes.map((obj) => {
      const className = obj.metadata?.className;
      const compartmentName = compartmentNameFromPath(obj.metadata?.path, knownCompartmentNames);
      const parent = compartmentName ? clusterIdByLabel[compartmentName] : undefined;
      // Reuse the same raw Graphviz x,y ReactionGraph.jsx already renders with
      // (no axis flip) so the SBGN layout matches the existing tab's orientation,
      // scaled up to make room for SBGN's larger fixed glyph sizes.
      const [x, y] = (obj.pos || '0,0').split(',').map(parseFloat);
      return {
        data: {
          id: obj.name,
          class: nodeClassFor(className),
          label: obj.label || obj.metadata?.name || obj.name,
          metadata: obj.metadata,
          ...sbgnDefaults,
          ...(parent ? { parent } : {}),
        },
        position: { x: x * POSITION_SCALE, y: y * POSITION_SCALE },
      };
    }),
  ];

  const edges = (graphData.edges || [])
    .filter((edge) => nodeByGvid[edge.tail] && nodeByGvid[edge.head])
    .map((edge, i) => {
      const tailNode = nodeByGvid[edge.tail];
      const headNode = nodeByGvid[edge.head];
      const tailClass = tailNode.metadata?.className;
      const headClass = headNode.metadata?.className;

      let sbgnClass = 'consumption';
      if (edge.style === 'dashed') {
        sbgnClass = 'catalysis';
      } else if (SPECIES_CLASSNAMES.has(tailClass) && PROCESS_CLASSNAMES.has(headClass)) {
        sbgnClass = 'consumption';
      } else if (PROCESS_CLASSNAMES.has(tailClass) && SPECIES_CLASSNAMES.has(headClass)) {
        sbgnClass = 'production';
      }

      return {
        data: {
          id: `sbgn-edge-${i}`,
          class: sbgnClass,
          source: tailNode.name,
          target: headNode.name,
        },
      };
    });

  return { nodes, edges };
}
