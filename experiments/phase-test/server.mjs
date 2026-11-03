#!/usr/bin/env node
/**
 * Phase test: a tiny MCP server whose tools change depending on the current phase.
 *
 * It answers one question: when a server says "my tool list changed"
 * (notifications/tools/list_changed), does the client fetch the new list,
 * and can the AI use the new tools right away?
 *
 *   town phase:   look_around, start_fight
 *   combat phase: attack, flee
 *   always:       get_phase  (reports what the server sees, for diagnosis)
 *
 * Everything the client does is logged to stderr, which Claude Desktop saves
 * in its log file for this server.
 */

import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';

const noArgs = {type: 'object', properties: {}};
const TOOLS = {
    get_phase: {
        description: 'Always available. Shows the current phase, which tools exist right now, and diagnostics.',
        inputSchema: noArgs,
    },
    look_around: {
        description: 'Town phase only. Look around the town square.',
        inputSchema: noArgs,
    },
    start_fight: {
        description: 'Town phase only. Start a fight with a goblin. This switches to the combat phase, which replaces the town tools with combat tools.',
        inputSchema: noArgs,
    },
    attack: {
        description: 'Combat phase only. Attack the goblin.',
        inputSchema: noArgs,
    },
    flee: {
        description: 'Combat phase only. Run away, returning to the town phase.',
        inputSchema: noArgs,
    },
};
const PHASE_TOOLS = {
    town: ['get_phase', 'look_around', 'start_fight'],
    combat: ['get_phase', 'attack', 'flee'],
};

const state = {
    phase: 'town',
    goblinHp: 0,
    listRequests: 0,         // how many times the client fetched the tool list
    lastListedPhase: null,   // which phase the client's latest fetch saw
    staleCalls: 0,           // calls to tools that don't exist in the current phase
};

const log = message => console.error(`[phase-test ${new Date().toISOString()}] ${message}`);
const text = (message, isError = false) => ({content: [{type: 'text', text: message}], ...(isError && {isError})});
const available = () => PHASE_TOOLS[state.phase];

const server = new Server(
    {name: 'phase-test', version: '0.1.0'},
    {capabilities: {tools: {listChanged: true}}}
);

async function switchPhase(phase) {
    state.phase = phase;
    log(`phase -> ${phase}; sending tools/list_changed`);
    await server.sendToolListChanged();
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    state.listRequests++;
    state.lastListedPhase = state.phase;
    log(`client fetched tool list (#${state.listRequests}) in phase "${state.phase}": ${available().join(', ')}`);
    return {tools: available().map(name => ({name, ...TOOLS[name]}))};
});

server.setRequestHandler(CallToolRequestSchema, async request => {
    const name = request.params.name;
    log(`call ${name} (phase "${state.phase}")`);

    if (!available().includes(name)) {
        state.staleCalls++;
        log(`STALE CALL: ${name} is not available in phase "${state.phase}"`);
        return text(
            `"${name}" is not available in the ${state.phase} phase. ` +
            `Tools available now: ${available().join(', ')}. ` +
            `(Test note: the client called a tool from an outdated tool list.)`,
            true
        );
    }

    switch (name) {
        case 'get_phase':
            return text([
                `Phase: ${state.phase}`,
                `Tools available now: ${available().join(', ')}`,
                `Client has fetched the tool list ${state.listRequests} time(s); the latest fetch saw phase "${state.lastListedPhase}".`,
                `Calls to unavailable tools so far: ${state.staleCalls}`,
                state.lastListedPhase === state.phase
                    ? 'Diagnosis: the client\'s tool list is up to date.'
                    : 'Diagnosis: the client has NOT fetched the tool list since the phase changed.',
            ].join('\n'));

        case 'look_around':
            return text('A quiet town square. A goblin is lurking near the well.');

        case 'start_fight':
            state.goblinHp = 2;
            await switchPhase('combat');
            return text('The goblin attacks! The phase is now combat. The town tools are gone; attack and flee are now available.');

        case 'attack':
            state.goblinHp--;
            if (state.goblinHp > 0) return text(`You hit the goblin. It has ${state.goblinHp} HP left.`);
            await switchPhase('town');
            return text('You defeat the goblin! The phase is back to town; look_around and start_fight are available again.');

        case 'flee':
            await switchPhase('town');
            return text('You run back to the town square. The phase is back to town.');
    }
});

await server.connect(new StdioServerTransport());
log('running on stdio, phase "town"');
