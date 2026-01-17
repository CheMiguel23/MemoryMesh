import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaBuilder } from '../../../src/core/schema/SchemaBuilder.js';
import type { SchemaConfig } from '../../../src/core/schema/SchemaBuilder.js';

describe('SchemaBuilder', () => {
    let builder: SchemaBuilder;

    beforeEach(() => {
        builder = new SchemaBuilder('add_npc', 'Add a new NPC to the knowledge graph');
    });

    describe('constructor', () => {
        it('should initialize with name and description', () => {
            const schema = builder.build();

            expect(schema.name).toBe('add_npc');
            expect(schema.description).toBe('Add a new NPC to the knowledge graph');
        });

        it('should create inputSchema with object type', () => {
            const schema = builder.build();

            expect(schema.inputSchema.type).toBe('object');
        });

        it('should create nested property structure using schema name', () => {
            const schema = builder.build();

            expect(schema.inputSchema.properties).toHaveProperty('npc');
            expect(schema.inputSchema.required).toContain('npc');
        });
    });

    describe('addStringProperty', () => {
        it('should add a required string property', () => {
            builder.addStringProperty('name', 'The name of the NPC', true);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.properties.name).toBeDefined();
            expect(npcProps.properties.name.type).toBe('string');
            expect(npcProps.properties.name.description).toBe('The name of the NPC');
            expect(npcProps.required).toContain('name');
        });

        it('should add an optional string property', () => {
            builder.addStringProperty('nickname', 'Optional nickname', false);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.properties.nickname).toBeDefined();
            expect(npcProps.required).not.toContain('nickname');
        });

        it('should add string property with enum values', () => {
            builder.addStringProperty('status', 'NPC status', true, ['active', 'inactive', 'dead']);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.properties.status.enum).toEqual(['active', 'inactive', 'dead']);
        });

        it('should support method chaining', () => {
            const result = builder
                .addStringProperty('name', 'Name', true)
                .addStringProperty('title', 'Title', false);

            expect(result).toBe(builder);
        });
    });

    describe('addArrayProperty', () => {
        it('should add a required array property', () => {
            builder.addArrayProperty('skills', 'List of skills', true);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.properties.skills.type).toBe('array');
            expect(npcProps.properties.skills.items?.type).toBe('string');
            expect(npcProps.required).toContain('skills');
        });

        it('should add an optional array property', () => {
            builder.addArrayProperty('inventory', 'Inventory items', false);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.properties.inventory).toBeDefined();
            expect(npcProps.required).not.toContain('inventory');
        });

        it('should add array property with enum values', () => {
            builder.addArrayProperty('traits', 'Character traits', true, ['brave', 'cunning', 'wise']);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.properties.traits.items?.enum).toEqual(['brave', 'cunning', 'wise']);
        });
    });

    describe('addRelationship', () => {
        it('should add a relationship as array property', () => {
            builder.addRelationship('allies', 'allied_with', 'Allied NPCs');
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.properties.allies).toBeDefined();
            expect(npcProps.properties.allies.type).toBe('array');
        });

        it('should store relationship configuration', () => {
            builder.addRelationship('allies', 'allied_with', 'Allied NPCs', 'npc');
            const schema = builder.build();

            expect(schema.relationships.allies).toBeDefined();
            expect(schema.relationships.allies.edgeType).toBe('allied_with');
            expect(schema.relationships.allies.nodeType).toBe('npc');
        });

        it('should exclude relationship fields from metadata', () => {
            builder.addRelationship('enemies', 'enemy_of', 'Enemy NPCs');
            const schema = builder.build();

            expect(schema.metadataConfig.excludeFields).toContain('enemies');
        });
    });

    describe('allowAdditionalProperties', () => {
        it('should enable additional properties', () => {
            builder.allowAdditionalProperties(true);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.additionalProperties).toEqual({
                type: 'string',
                description: 'Additional property value'
            });
        });

        it('should disable additional properties', () => {
            builder.allowAdditionalProperties(false);
            const schema = builder.build();

            const npcProps = schema.inputSchema.properties.npc;
            expect(npcProps.additionalProperties).toBe(false);
        });
    });

    describe('createUpdateSchema', () => {
        it('should create update schema with correct naming', () => {
            builder.addStringProperty('name', 'Name', true);
            const updateSchema = builder.createUpdateSchema();

            expect(updateSchema.name).toBe('update_npc');
            expect(updateSchema.description).toContain('Update');
        });

        it('should make all properties optional in update schema', () => {
            builder.addStringProperty('name', 'Name', true);
            builder.addStringProperty('title', 'Title', true);
            const updateSchema = builder.createUpdateSchema();

            const updateProps = updateSchema.inputSchema.properties.update_npc;
            // In update schema, required fields should be empty or only contain non-property fields
            expect(updateProps.required.includes('name')).toBe(false);
        });

        it('should exclude specified fields', () => {
            builder.addStringProperty('name', 'Name', true);
            builder.addStringProperty('secret', 'Secret', true);
            const updateSchema = builder.createUpdateSchema(new Set(['secret']));

            const updateProps = updateSchema.inputSchema.properties.update_npc;
            expect(updateProps.properties.secret).toBeUndefined();
            expect(updateProps.properties.name).toBeDefined();
        });

        it('should add metadata array property', () => {
            builder.addStringProperty('name', 'Name', true);
            const updateSchema = builder.createUpdateSchema();

            const updateProps = updateSchema.inputSchema.properties.update_npc;
            expect(updateProps.properties.metadata).toBeDefined();
            expect(updateProps.properties.metadata.type).toBe('array');
        });

        it('should copy relationships to update schema', () => {
            builder.addStringProperty('name', 'Name', true);
            builder.addRelationship('allies', 'allied_with', 'Allies', 'npc');
            const updateSchema = builder.createUpdateSchema();

            expect(updateSchema.relationships.allies).toBeDefined();
        });
    });

    describe('metadataConfig', () => {
        it('should track required fields', () => {
            builder.addStringProperty('name', 'Name', true);
            builder.addStringProperty('type', 'Type', true);
            const schema = builder.build();

            expect(schema.metadataConfig.requiredFields).toContain('name');
            expect(schema.metadataConfig.requiredFields).toContain('type');
        });

        it('should track optional fields', () => {
            builder.addStringProperty('nickname', 'Nickname', false);
            const schema = builder.build();

            expect(schema.metadataConfig.optionalFields).toContain('nickname');
        });

        it('should track excluded fields from relationships', () => {
            builder.addRelationship('friends', 'friend_of', 'Friends');
            const schema = builder.build();

            expect(schema.metadataConfig.excludeFields).toContain('friends');
        });
    });

    describe('build', () => {
        it('should return complete schema config', () => {
            builder
                .addStringProperty('name', 'Name', true)
                .addArrayProperty('traits', 'Traits', false)
                .addRelationship('allies', 'allied_with', 'Allies');

            const schema = builder.build();

            expect(schema).toHaveProperty('name');
            expect(schema).toHaveProperty('description');
            expect(schema).toHaveProperty('inputSchema');
            expect(schema).toHaveProperty('relationships');
            expect(schema).toHaveProperty('metadataConfig');
        });

        it('should be idempotent', () => {
            builder.addStringProperty('name', 'Name', true);

            const schema1 = builder.build();
            const schema2 = builder.build();

            expect(schema1).toEqual(schema2);
        });
    });
});
