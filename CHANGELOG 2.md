## Changelog

### v0.2.8 (2024-12-24)

#### Features

- **Edge Weights:**
    - Introduced an optional `weight` property to the `Edge` interface to represent relationship strength in the range of 0-1.
    - Edge weights now default to 1 if not specified.

- **Enhanced Search:**
  - Modified `SearchManager` to include immediate neighbor nodes in `searchNodes` and `openNodes` results.

**Impact:**

- **Edge Weights:**
  - Enables a more nuanced representation of relationships in the knowledge graph, allowing for the expression of varying degrees of connection strength or confidence.
  - No changes in schemas.
  - 
- **Enhanced Search:**
  - Provides a more comprehensive view of the relevant portion of the knowledge graph returning more contextually relevant information to the AI.
