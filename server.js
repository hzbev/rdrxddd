const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const PORT = Number(process.env.PORT) || 3000;

let latestState = null;
let latestUpdatedAt = 0;
let readerStartedAt = 0;
let feedEnabled = true;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, clients: wss.clients.size, readerLive: Boolean(readerStartedAt), feedEnabled });
});

app.get("/control/status", (_req, res) => {
  res.json({ ok: true, feedEnabled, clients: wss.clients.size, readerStartedAt, latestUpdatedAt });
});

app.post("/control/enabled", (req, res) => {
  feedEnabled = Boolean(req.body?.enabled);
  broadcast({ type: "feed-control", enabled: feedEnabled });
  res.json({ ok: true, feedEnabled });
});

function normalizeState(payload) {
  const state = payload?.type === "radar-state" ? payload.state : payload;

  if (!state || !Array.isArray(state.players)) {
    throw new Error("Expected radar state with a players array.");
  }

  return {
    mapName: state.mapName || "<empty>",
    tick: Number.isFinite(state.tick) ? state.tick : 0,
    bomb: state.bomb || { status: "unknown" },
    players: state.players
  };
}

function broadcast(message, exceptSocket = null) {
  const data = JSON.stringify(message);

  for (const client of wss.clients) {
    if (client !== exceptSocket && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "server-ready", clients: wss.clients.size, readerStartedAt, feedEnabled }));

  if (feedEnabled && latestState) {
    socket.send(JSON.stringify({ type: "radar-state", state: latestState, updatedAt: latestUpdatedAt }));
  }

  socket.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "Invalid JSON message." }));
      return;
    }

    try {
      if (message.type === "reader-start") {
        readerStartedAt = Date.now();
        broadcast({ type: "reader-start", startedAt: readerStartedAt }, socket);
        return;
      }

      if (!feedEnabled) {
        return;
      }

      latestState = normalizeState(message);
      latestUpdatedAt = Date.now();
      broadcast({ type: "radar-state", state: latestState, updatedAt: latestUpdatedAt }, socket);
    } catch (error) {
      socket.send(JSON.stringify({ type: "error", error: error.message }));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Radar server listening on http://localhost:${PORT}`);
  console.log(`Default WebSocket endpoint ws://159.223.228.189:${PORT}/ws`);
});
