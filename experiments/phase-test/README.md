# Phase test (experiment)

A throwaway test, not part of MemoryMesh. It checks whether an MCP client handles
tools that **change during a conversation**, before building that idea into MemoryMesh.

The server has two phases:

| Phase | Tools |
|---|---|
| town | `look_around`, `start_fight` |
| combat | `attack`, `flee` |

`get_phase` is always available and reports what the server sees.

When the phase changes, the server sends `notifications/tools/list_changed`,
which tells the client to fetch the tool list again.

## Set up (Claude Desktop)

Add a second entry next to `memorymesh` in `claude_desktop_config.json`
(use your own path; on Windows, double every backslash):

```json
"phase-test": {
  "command": "node",
  "args": ["/ABSOLUTE/PATH/TO/MemoryMesh/experiments/phase-test/server.mjs"]
}
```

Fully quit and reopen Claude Desktop.

## Test (in a new chat)

1. **"Call get_phase."** It should report the town phase.
2. **"Start a fight, then attack the goblin until it's defeated."**
   This is the key test: can Claude use `attack` in the same reply that unlocked it?
3. If step 2 stopped after starting the fight, send a new message: **"Attack the goblin."**
   This checks whether the new tools show up by the next message.
4. **"Call get_phase and tell me the diagnosis."**
5. Open the tools menu and check which phase-test tools are listed.

## What the results mean

| What happens | Meaning |
|---|---|
| Step 2 works fully | Claude Desktop refreshes tools immediately. Best case. |
| Step 2 stops, step 3 works | Tools refresh between messages. Still usable. |
| Claude says it has no `attack` tool, or tries `look_around` during combat | The client ignores tool changes. The idea would need a different design. |

The server log shows exactly when Claude Desktop fetched the tool list:

- **Mac:** `~/Library/Logs/Claude/mcp-server-phase-test.log`
- **Windows:** the `logs` folder inside `%APPDATA%\Claude`

Look for lines like `client fetched tool list (#2) in phase "combat"`.
