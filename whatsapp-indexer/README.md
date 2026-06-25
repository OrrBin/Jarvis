# WhatsApp Indexer

A WhatsApp message indexer with semantic search and full read/write actions, exposed to AI agents through a Model Context Protocol (MCP) server.

The system uses a **single long-running listener** that owns the only WhatsApp Web connection. The listener indexes messages and exposes an HTTP API. A separate, lightweight **MCP server** reads the index directly and delegates all live WhatsApp actions (send, list chats, mark read, backfill) to the listener over HTTP. This keeps exactly one WhatsApp session alive while letting agents connect and disconnect freely.

## Architecture

```
                       WhatsApp Web (single session, clientId "whatsapp-indexer")
                                  |
                                  v
   +--------------------------------------------------------------+
   |  whatsapp-listener.js  (long-running service)               |
   |  - Only process that connects to WhatsApp Web (Puppeteer)    |
   |  - Indexes messages -> SQLite + FAISS vector store           |
   |  - Express HTTP API on port 3001:                            |
   |      GET  /status        POST /send-message                  |
   |      GET  /chats         POST /mark-as-read                   |
   |      POST /backfill                                           |
   +--------------------------------------------------------------+
        ^ reads DB/vectors directly        ^ HTTP (localhost:3001)
        |                                   |
   +-------------------------------+   +--------------------------+
   | mcp-server-actions-v2.js      |   | backfill.sh / curl       |
   | (MCP server "whatsapp-actions"| -->| POST /backfill           |
   |  v2.0.0, stdio transport)     |   +--------------------------+
   | - search/status: read DB      |
   | - send/list/mark/latest:      |
   |   call listener HTTP API      |
   +-------------------------------+
        ^ stdio (spawned by your MCP client)
```

### 1. WhatsApp Listener (`src/whatsapp-listener.js`)
- The **only** component that connects to WhatsApp Web (via `whatsapp-web.js` + Puppeteer/Chromium).
- Receives incoming/outgoing messages and indexes them into SQLite + a local FAISS vector store.
- Exposes an Express HTTP API (default port `3001`, override with `WHATSAPP_API_PORT`):
  - `GET /status` - readiness and auth state
  - `POST /send-message` - send a text message (optionally a reply)
  - `GET /chats` - list chats
  - `POST /mark-as-read` - mark a chat read
  - `POST /backfill` - index historical messages, reusing the live client
- Runs continuously as a background service with auto-restart.

### 2. MCP Server (`src/mcp-server-actions-v2.js`)
- MCP server name `whatsapp-actions`, version `2.0.0`, stdio transport - spawned on demand by your MCP client.
- **Does not open its own WhatsApp connection.** It:
  - Reads SQLite + vector store directly for `search_messages` and parts of `whatsapp_status`.
  - Delegates all live actions to the listener's HTTP API (`WHATSAPP_API_URL`, default `http://localhost:3001`).
- This is the **current** entry point. The older `mcp-server-standalone.js` / `mcp-server-enhanced.js` files are legacy and no longer used.

## Requirements

- **Node.js 20.x.**
- **`faiss-node` needs a recent `libstdc++`.** Some Node version managers bundle an older `libstdc++` that lacks `GLIBCXX_3.4.29`, which `faiss-node` requires. If you hit a `GLIBCXX` load error, preload the system library:
  ```bash
  export LD_PRELOAD=/usr/lib64/libstdc++.so.6   # adjust path for your distro
  ```
  Every shell script and the service definition set this.
- **A Chromium binary for Puppeteer.** On platforms where Puppeteer does not ship a prebuilt browser (e.g. arm64 Linux), point it at an existing Chromium via `PUPPETEER_EXECUTABLE_PATH` (for example a Playwright-installed Chromium).

## Installation

```bash
npm install
```

Optional: copy `.env.example` to `.env` to override defaults (defaults work out of the box).

## Running the Listener (the always-on service)

The listener is intended to run as a managed background service (e.g. a `systemd` user service) so it restarts automatically and survives logout.

A `systemd` user unit should:
- Set `LD_PRELOAD` (if needed) and `PUPPETEER_EXECUTABLE_PATH`.
- Run `cleanup-chrome.sh` as `ExecStartPre` to kill orphaned Chromium processes and remove the stale `SingletonLock` before each start.
- Restart on failure (e.g. `Restart=on-failure`, `RestartSec=15`). Enable `linger` so it survives logout.

Typical service management:
```bash
systemctl --user status whatsapp-listener.service
journalctl --user -u whatsapp-listener.service -f

systemctl --user start whatsapp-listener.service
systemctl --user restart whatsapp-listener.service
systemctl --user stop whatsapp-listener.service
```

**First-run authentication:** watch the logs and scan the QR code with your WhatsApp mobile app. The session persists in `.wwebjs_auth/` for future restarts.

### Manually (for debugging)
```bash
./start-listener.sh
```
This sets the same env vars and runs `node src/whatsapp-listener.js` in the foreground. Stop the background service first - only one WhatsApp connection is allowed at a time.

## Running the MCP Server

The MCP server is **spawned by your MCP client**, not run by hand. It talks to the client over stdio and to the listener over HTTP.

### MCP client config

Register the server in your MCP client config. Invoke it **directly with node and explicit env vars** (no shell wrapper):

```json
{
  "whatsapp-actions": {
    "command": "node",
    "args": [
      "/path/to/whatsapp-indexer/src/mcp-server-actions-v2.js"
    ],
    "env": {
      "NODE_PATH": "/path/to/whatsapp-indexer/node_modules",
      "DATABASE_PATH": "/path/to/whatsapp-indexer/data/messages.db",
      "VECTOR_STORE_PATH": "/path/to/whatsapp-indexer/data/vector_store",
      "LD_PRELOAD": "/usr/lib64/libstdc++.so.6"
    },
    "autoApprove": [
      "whatsapp_status",
      "get_latest_messages",
      "search_messages",
      "list_chats",
      "get_chat_info"
    ]
  }
}
```

Notes:
- Use the absolute path to your Node 20 binary if `node` on `PATH` is not v20.
- `DATABASE_PATH` / `VECTOR_STORE_PATH` must point at the same data dir the listener writes to.
- `WHATSAPP_API_URL` defaults to `http://localhost:3001`; set it only if you changed the listener port.
- The five read-only tools are auto-approved; `send_message` and `mark_as_read` are intentionally left to require approval.

### Manually (for debugging)
```bash
./start-mcp-actions.sh   # runs: node src/mcp-server-actions-v2.js
```
The listener must already be running for live actions to work.

## MCP Tools

| Tool | Backed by | Description |
|------|-----------|-------------|
| `whatsapp_status` | listener API + local | Client/indexer readiness and stats |
| `get_latest_messages` | listener API | Latest messages from all chats or one chat (`chat_name`, `limit`, `include_sent`) |
| `search_messages` | local vector store | Natural-language search, Hebrew + English (`query`, `limit`, `chat_name`) |
| `list_chats` | listener API | List chats (`limit`, `groups_only`, `individual_only`) |
| `get_chat_info` | listener API | Details about a specific chat (`chat_name`) |
| `send_message` | listener API | Send a message to a contact/group (`recipient`, `message`, `reply_to_message_id`) |
| `mark_as_read` | listener API | Mark a chat as read (`chat_name`) |

## Historical Backfill

Backfill runs **through the live listener** - no separate Chromium/session is started. The listener must be running.

```bash
# Last 7 days (default)
./backfill.sh

# Specific window
./backfill.sh --days 30

# Specific chats (repeatable) / exclusions (repeatable)
./backfill.sh --chat "Family Group" --chat "Work Team" --days 14
./backfill.sh --exclude "Noisy Group" --days 30

# Dry run (don't save) / force re-process existing chats
./backfill.sh --dry-run --days 7
./backfill.sh --force --days 7
```

Under the hood `backfill.sh` POSTs to `http://localhost:3001/backfill` (override port with `WHATSAPP_API_PORT`). The endpoint:
- Returns immediately (`{"status":"started"}`) and runs in the background - watch the listener logs for progress.
- Only processes chats with activity inside the requested window.
- Skips chats that already have indexed messages in the window unless `--force` is given.
- Rejects concurrent runs (`409`) and requires the client to be ready (`503` otherwise).

> The older `start-backfill.sh` (which spun up its own WhatsApp client) is legacy. Prefer `backfill.sh` so you don't fight the listener for the single allowed session.

## Chat Discovery

```bash
./list-chats.sh                 # all chats, most recent first
./list-chats.sh --groups-only
./list-chats.sh --individual-only
./list-chats.sh --limit 20
```
Or use the `list_chats` MCP tool. Note: `list-chats.sh` connects to WhatsApp directly, so stop the listener first (only one session allowed) or just use the `list_chats` MCP tool which goes through the running listener.

## Data Storage

- **SQLite database**: `./data/messages.db` (`DATABASE_PATH`)
- **Vector store**: `./data/vector_store/` - FAISS index + metadata (`VECTOR_STORE_PATH`)
- **WhatsApp session**: `./.wwebjs_auth/session-whatsapp-indexer/`

## Configuration

Defaults live in `src/config.js` and can be overridden via env vars (or `.env`):

| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_PATH` | `./data/messages.db` | listener + MCP server |
| `VECTOR_STORE_PATH` | `./data/vector_store` | listener + MCP server |
| `MODEL_NAME` | `Xenova/all-MiniLM-L6-v2` | vector store |
| `WHATSAPP_API_PORT` | `3001` | listener HTTP API |
| `WHATSAPP_API_URL` | `http://localhost:3001` | MCP server -> listener |
| `LD_PRELOAD` | system `libstdc++` path (if needed) | faiss-node native module |
| `PUPPETEER_EXECUTABLE_PATH` | path to a Chromium binary | listener (Puppeteer) |

## Troubleshooting

### `GLIBCXX_3.4.29 not found` / faiss-node fails to load
Your active `libstdc++` is too old. Ensure `LD_PRELOAD` points at a recent system `libstdc++.so.6`. All shell scripts and the service unit set this; if you run node directly, set it yourself.

### Listener won't start / "Failed to launch the browser process"
Puppeteer can't find a usable Chromium. Set `PUPPETEER_EXECUTABLE_PATH` to a Chromium binary. If a previous run crashed, stale Chromium processes or a `SingletonLock` may block startup - `cleanup-chrome.sh` handles this on service start, or run it manually:
```bash
./cleanup-chrome.sh
```

### Live tools fail but search works
The MCP server can read the index but can't reach the listener. Check the listener is up and the API responds:
```bash
systemctl --user status whatsapp-listener.service
curl -s http://localhost:3001/status
```

### Multiple connection / session conflicts
Only one process may hold the WhatsApp session. Don't run `start-listener.sh`, `start-backfill.sh`, or `list-chats.sh` while the background listener is active. Use the MCP tools / `backfill.sh` (which go through the running listener) instead.

### Phone numbers instead of contact names
WhatsApp Web sometimes lacks contact names. New messages prefer contact names; for existing rows, stop the listener and run `./fix-contact-names.sh`, then restart.

## Project Structure (current)

```
src/
├── whatsapp-listener.js        # Always-on listener: WhatsApp connection + indexing + HTTP API
├── mcp-server-actions-v2.js    # Current MCP server (whatsapp-actions v2.0.0)
├── database.js                 # SQLite operations
├── local-vector-store.js       # FAISS vector store
├── message-processor.js        # Message processing
├── hebrew-processor.js         # Hebrew text handling
├── config.js                   # Config / env defaults
└── backfill-script.js          # Legacy standalone backfill (prefer backfill.sh -> listener API)

scripts (repo root)
├── start-listener.sh           # Run listener in foreground (debug)
├── start-mcp-actions.sh        # Run MCP server in foreground (debug)
├── backfill.sh                 # Backfill via listener HTTP API (preferred)
├── cleanup-chrome.sh           # Kill orphaned Chromium + remove SingletonLock (service ExecStartPre)
├── list-chats.sh               # List chats (connects directly; stop listener first)
└── fix-contact-names.sh        # Backfill contact names for existing rows

Legacy / unused: mcp-server-standalone.js, mcp-server-enhanced.js, enhanced-*.js, start-mcp-standalone.sh
```

## License

MIT License
