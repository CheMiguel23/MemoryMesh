// src/schema/loader/schemaProcessor.js

/**
 * Creates a node based on schema definition and input data.
 *
 * @param {Object} data - Input data for the node.
 * @param {Object} schema - Schema definition from SchemaBuilder.
 * @param {string} nodeType - Type of node to create.
 * @returns {Promise<Object>} - Object containing nodes and edges arrays.
 * @throws {Error} If required fields are missing or processing fails.
 */
export async function createSchemaNode(data, schema, nodeType) {
    const {metadataConfig, relationships} = schema;

    // Initialize arrays for metadata, nodes, and edges
    const metadata = [];
    const nodes = [];
    const edges = [];

    // Create a comprehensive set of fields to exclude from additional properties
    const excludedFields = new Set([
        'name',  // Exclude name as it's handled separately
        ...metadataConfig.requiredFields,
        ...metadataConfig.optionalFields,
        ...(metadataConfig.excludeFields || []),
    ]);

    // Add relationship fields to excluded set
    if (relationships) {
        Object.keys(relationships).forEach(field => excludedFields.add(field));
    }

    // Process required fields first
    for (const field of metadataConfig.requiredFields) {
        if (data[field] === undefined) {
            throw new Error(`Required field "${field}" is missing`);
        }
        // Skip if this field is part of a relationship
        if (!relationships || !relationships[field]) {
            if (Array.isArray(data[field])) {
                metadata.push(`${field}: ${data[field].join(', ')}`);
            } else {
                metadata.push(`${field}: ${data[field]}`);
            }
        }
    }

    // Process optional fields
    for (const field of metadataConfig.optionalFields) {
        if (data[field] !== undefined && (!relationships || !relationships[field])) {
            if (Array.isArray(data[field])) {
                metadata.push(`${field}: ${data[field].join(', ')}`);
            } else {
                metadata.push(`${field}: ${data[field]}`);
            }
        }
    }

    // Process relationships
    if (relationships) {
        for (const [field, config] of Object.entries(relationships)) {
            if (data[field]) {
                const value = data[field];
                if (Array.isArray(value)) {
                    value.forEach(target => {
                        edges.push({
                            from: data.name,
                            to: target,
                            edgeType: config.edgeType
                        });
                    });
                } else {
                    edges.push({
                        from: data.name,
                        to: value,
                        edgeType: config.edgeType
                    });
                }
                // Add relationship field to metadata only once
                if (Array.isArray(value)) {
                    metadata.push(`${field}: ${value.join(', ')}`);
                } else {
                    metadata.push(`${field}: ${value}`);
                }
            }
        }
    }

    // Process additional properties (only those not already handled)
    for (const [key, value] of Object.entries(data)) {
        if (!excludedFields.has(key) && value !== undefined) {
            if (Array.isArray(value)) {
                metadata.push(`${key}: ${value.join(', ')}`);
            } else {
                metadata.push(`${key}: ${value}`);
            }
        }
    }

    // Create the main node without duplicating the name in metadata
    const mainNode = {
        name: data.name,
        nodeType,
        metadata
    };
    nodes.push(mainNode);

    return {nodes, edges};
}

/**
 * Updates a node's metadata and relationships based on schema definition.
 *
 * @param {Object} updates - Update data for the node.
 * @param {Object} currentNode - Current node to update.
 * @param {Object} schema - Schema definition from SchemaBuilder.
 * @param {Object} currentGraph - Current graph state.
 * @returns {Promise<Object>} - Updated node metadata and edge changes.
 * @throws {Error} If processing updates fails.
 */
export async function updateSchemaNode(updates, currentNode, schema, currentGraph) {
    const {metadataConfig, relationships} = schema;
    const metadata = new Map(); // Use a Map to track unique metadata entries
    const edgeChanges = {
        remove: [],
        add: []
    };

    // Create a set of all schema-defined fields
    const schemaFields = new Set([
        ...metadataConfig.requiredFields,
        ...metadataConfig.optionalFields,
        ...(metadataConfig.excludeFields || []),
        'name',
        'metadata'
    ]);

    // Add relationship fields to schema fields
    if (relationships) {
        Object.keys(relationships).forEach(field => schemaFields.add(field));
    }

    // First, process existing metadata into the Map
    currentNode.metadata.forEach(meta => {
        const colonIndex = meta.indexOf(':');
        if (colonIndex !== -1) {
            const key = meta.substring(0, colonIndex).trim().toLowerCase();
            const value = meta.substring(colonIndex + 1).trim();
            metadata.set(key, value);
        }
    });

    // Function to update metadata entry
    const updateMetadataEntry = (key, value) => {
        const formattedValue = Array.isArray(value) ? value.join(', ') : value;
        metadata.set(key.toLowerCase(), formattedValue);
    };

    // Handle all schema-defined fields (both required and optional)
    const allSchemaFields = [...metadataConfig.requiredFields, ...metadataConfig.optionalFields];
    for (const field of allSchemaFields) {
        if (updates[field] !== undefined && !relationships[field]) {
            updateMetadataEntry(field, updates[field]);
        }
    }

    // Process relationships
    if (relationships) {
        for (const [field, config] of Object.entries(relationships)) {
            if (updates[field] !== undefined) {
                // Find existing edges for this relationship
                const existingEdges = currentGraph.edges.filter(edge =>
                    edge.from === currentNode.name &&
                    edge.edgeType === config.edgeType
                );

                // Mark existing edges for removal
                edgeChanges.remove.push(...existingEdges);

                // Create new edges
                const value = updates[field];
                if (Array.isArray(value)) {
                    value.forEach(target => {
                        edgeChanges.add.push({
                            from: currentNode.name,
                            to: target,
                            edgeType: config.edgeType
                        });
                    });
                } else if (value) {
                    edgeChanges.add.push({
                        from: currentNode.name,
                        to: value,
                        edgeType: config.edgeType
                    });
                }

                // Update metadata for relationship
                updateMetadataEntry(field, value);
            }
        }
    }

    // Process additional properties (only those not in schema)
    for (const [key, value] of Object.entries(updates)) {
        if (!schemaFields.has(key) && value !== undefined) {
            updateMetadataEntry(key, value);
        }
    }

    // Convert Map back to array format with proper capitalization
    const updatedMetadata = Array.from(metadata).map(([key, value]) => {
        const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
        return `${capitalizedKey}: ${value}`;
    });

    return {
        metadata: updatedMetadata,
        edgeChanges
    };
}

/**
 * Handles the complete update process for a schema-based entity.
 *
 * @param {Object} updates - Update data for the entity.
 * @param {Object} schema - Schema definition from SchemaBuilder.
 * @param {string} nodeType - Type of node to update.
 * @param {Object} knowledgeGraphManager - Graph manager instance.
 * @returns {Promise<Object>} - Updated nodes and edge changes.
 * @throws {Error} If handling the update fails.
 */
export async function handleSchemaUpdate(updates, schema, nodeType, knowledgeGraphManager) {
    const graph = await knowledgeGraphManager.readGraph();

    // Find the node
    const node = graph.nodes.find(n => n.name === updates.name && n.nodeType === nodeType);
    if (!node) {
        throw new Error(`${nodeType} "${updates.name}" not found`);
    }

    // Process updates using the schema
    const {metadata, edgeChanges} = await updateSchemaNode(
        updates,
        node,
        schema,
        graph
    );

    // Update the node
    const updatedNode = {
        ...node,
        metadata
    };

    // Handle edge changes in a transaction-like manner
    if (edgeChanges.remove.length > 0) {
        await knowledgeGraphManager.deleteEdges(edgeChanges.remove);
    }

    if (edgeChanges.add.length > 0) {
        await knowledgeGraphManager.addEdges(edgeChanges.add);
    }

    // Update the node in the graph
    await knowledgeGraphManager.updateNodes([updatedNode]);

    return {
        updatedNodes: [updatedNode],
        edgeChanges
    };
}

/**
 * Handles the complete delete process for a schema-based entity.
 *
 * @param {string} nodeName - Name of the node to delete.
 * @param {string} nodeType - Type of node to delete.
 * @param {Object} knowledgeGraphManager - Graph manager instance.
 * @returns {Promise<Object>} - Result of the deletion.
 * @throws {Error} If handling the deletion fails.
 */
export async function handleSchemaDelete(nodeName, nodeType, knowledgeGraphManager) {
    const graph = await knowledgeGraphManager.readGraph();

    // Find the node
    const node = graph.nodes.find(n => n.name === nodeName && n.nodeType === nodeType);
    if (!node) {
        throw new Error(`${nodeType} "${nodeName}" not found`);
    }

    // Delete the node and its associated edges
    await knowledgeGraphManager.deleteNodes([nodeName]);

    return {result: `${nodeType} "${nodeName}" deleted successfully`};
}