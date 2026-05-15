const SERVER_WS_URL = "ws://159.223.228.189:3000/ws";

const mapMeta = {
  de_ancient: { image: "/maps/de_ancient_radar.png", origin: { x: -2953, y: 2164 }, scale: 5 },
  de_anubis: { image: "/maps/de_anubis_radar.png", origin: { x: -2796, y: 3328 }, scale: 5.22 },
  de_dust2: { image: "/maps/de_dust2_radar.png", origin: { x: -2476, y: 3239 }, scale: 4.4 },
  de_inferno: { image: "/maps/de_inferno_radar.png", origin: { x: -2087, y: 3870 }, scale: 4.9 },
  de_mirage: { image: "/maps/de_mirage_radar.png", origin: { x: -3230, y: 1713 }, scale: 5 },
  de_nuke: {
    image: "/maps/de_nuke_radar.png",
    lowerImage: "/maps/de_nuke_lower_radar.png",
    lowerZ: -480,
    origin: { x: -3453, y: 2887 },
    scale: 7
  },
  de_overpass: { image: "/maps/de_overpass_radar.png", origin: { x: -4831, y: 1781 }, scale: 5.2 },
  de_train: { image: "/maps/de_train_radar.png", origin: { x: -2477, y: 2392 }, scale: 4.7 },
  de_vertigo: {
    image: "/maps/de_vertigo_radar.png",
    lowerImage: "/maps/de_vertigo_lower_radar.png",
    lowerZ: 11720,
    origin: { x: -3168, y: 1762 },
    scale: 4
  }
};

const sampleState = {
  mapName: "de_mirage",
  tick: 0,
  bomb: { status: "unknown" },
  players: []
};

let radarState = sampleState;
let socket = null;
const hiddenTeams = loadFilterSet("radarHiddenTeams");
const hiddenPlayers = loadFilterSet("radarHiddenPlayers");

const elements = {
  mapName: document.querySelector("#map-name"),
  tick: document.querySelector("#tick"),
  readerStatus: document.querySelector("#reader-status"),
  socketStatus: document.querySelector("#socket-status"),
  lastUpdate: document.querySelector("#last-update"),
  radar: document.querySelector("#radar"),
  ctList: document.querySelector("#ct-list"),
  tList: document.querySelector("#t-list"),
  bombStatus: document.querySelector("#bomb-status"),
  showCt: document.querySelector("#show-ct"),
  showT: document.querySelector("#show-t"),
  playerFilterList: document.querySelector("#player-filter-list"),
  resetFilters: document.querySelector("#reset-filters")
};

function loadFilterSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function saveFilters() {
  localStorage.setItem("radarHiddenTeams", JSON.stringify([...hiddenTeams]));
  localStorage.setItem("radarHiddenPlayers", JSON.stringify([...hiddenPlayers]));
}

function normalizeIncomingState(message) {
  const state = message?.type === "radar-state" ? message.state : message;

  if (!state || !Array.isArray(state.players)) {
    throw new Error("Incoming message does not contain a players array.");
  }

  return {
    mapName: state.mapName || "de_mirage",
    tick: Number.isFinite(state.tick) ? state.tick : 0,
    bomb: state.bomb || { status: "unknown" },
    players: state.players.map((player, index) => ({
      id: player.id || `${player.team || "player"}-${index}`,
      name: player.name || `Player ${index + 1}`,
      team: player.team || (player.enemy ? "T" : "CT"),
      health: Number.isFinite(player.health) ? player.health : 100,
      money: player.money,
      armor: Number.isFinite(player.armor) ? player.armor : 0,
      helmet: Boolean(player.helmet),
      defuser: Boolean(player.defuser),
      weapons: player.weapons || [],
      position: player.position || { x: player.x || 0, y: player.y || 0, z: player.z || 0 },
      yaw: player.yaw ?? player.angles ?? 0,
      alive: player.alive !== false,
      self: Boolean(player.self)
    }))
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  })[char]);
}

function getRadarPoint(player, meta) {
  const pos = player.position || { x: player.x || 0, y: player.y || 0 };
  const x = ((pos.x - meta.origin.x) / (meta.scale * 1024)) * 100;
  const y = ((meta.origin.y - pos.y) / (meta.scale * 1024)) * 100;

  return {
    left: Math.max(0, Math.min(100, x)),
    top: Math.max(0, Math.min(100, y))
  };
}

function renderPlayerList(container, players) {
  if (!players.length) {
    container.innerHTML = '<p class="empty">No players</p>';
    return;
  }

  container.innerHTML = players.map((player) => {
    const weapons = player.weapons?.length ? player.weapons.join(" / ") : "Weapons unavailable";
    const equipment = `Armor ${player.armor ?? 0}${player.helmet ? " + helmet" : ""}${player.defuser ? " + kit" : ""}`;

    return `
      <article class="player-card ${player.alive ? "" : "dead"}">
        <div class="player-head">
          <strong>${escapeHtml(player.name)}${player.self ? " (you)" : ""}</strong>
          <span>${player.health} HP</span>
        </div>
        <div class="bar"><span style="width: ${Math.max(0, Math.min(100, player.health))}%"></span></div>
        <p>$${player.money ?? "----"}</p>
        <p>${escapeHtml(equipment)}</p>
        <p>${escapeHtml(weapons)}</p>
        ${radarState.bomb?.carrierId === player.id ? "<small>Bomb carrier</small>" : ""}
      </article>
    `;
  }).join("");
}

function renderPlayerFilters(players) {
  elements.showCt.checked = !hiddenTeams.has("CT");
  elements.showT.checked = !hiddenTeams.has("T");

  if (!players.length) {
    elements.playerFilterList.innerHTML = '<p class="empty">No player filters yet</p>';
    return;
  }

  elements.playerFilterList.innerHTML = players.map((player) => `
    <label class="player-filter ${player.team.toLowerCase()}">
      <input type="checkbox" data-player-id="${escapeHtml(player.id)}" ${hiddenPlayers.has(player.id) ? "" : "checked"}>
      <span>${escapeHtml(player.name)}</span>
      <small>${escapeHtml(player.team)}</small>
    </label>
  `).join("");
}

function render() {
  const meta = mapMeta[radarState.mapName] || mapMeta.de_mirage;
  const localPlayer = radarState.players.find((player) => player.self) || radarState.players[0];
  const mapImage = meta.lowerImage && localPlayer?.position?.z < meta.lowerZ ? meta.lowerImage : meta.image;
  const players = radarState.players;

  elements.mapName.textContent = radarState.mapName;
  elements.tick.textContent = `Tick ${radarState.tick}`;
  elements.radar.style.backgroundImage = `url(${mapImage})`;
  elements.radar.querySelectorAll(".marker").forEach((marker) => marker.remove());

  const visiblePlayers = players.filter((player) => !hiddenTeams.has(player.team) && !hiddenPlayers.has(player.id));

  for (const player of visiblePlayers) {
    const point = getRadarPoint(player, meta);
    const marker = document.createElement("div");
    marker.className = `marker ${player.team.toLowerCase()} ${player.alive ? "" : "dead"}`;
    marker.title = `${player.name} ${player.health} HP`;
    marker.style.left = `${point.left}%`;
    marker.style.top = `${point.top}%`;
    marker.style.setProperty("--marker-rotation", `${90 - player.yaw}deg`);
    marker.style.setProperty("--marker-counter-rotation", `${player.yaw - 90}deg`);
    marker.innerHTML = `<span class="cone"></span><strong>${escapeHtml(player.name.slice(0, 1))}</strong>${radarState.bomb?.carrierId === player.id ? "<em>B</em>" : ""}`;
    elements.radar.appendChild(marker);
  }

  renderPlayerList(elements.ctList, players.filter((player) => player.team === "CT"));
  renderPlayerList(elements.tList, players.filter((player) => player.team === "T"));
  renderPlayerFilters(players);

  const carrier = players.find((player) => player.id === radarState.bomb?.carrierId);
  elements.bombStatus.innerHTML = `
    <strong>Bomb</strong>
    <span>${escapeHtml(radarState.bomb?.status || "unknown")}</span>
    ${carrier ? `<span>Carrier: ${escapeHtml(carrier.name)}</span>` : ""}
  `;
}

elements.showCt.addEventListener("change", () => {
  elements.showCt.checked ? hiddenTeams.delete("CT") : hiddenTeams.add("CT");
  saveFilters();
  render();
});

elements.showT.addEventListener("change", () => {
  elements.showT.checked ? hiddenTeams.delete("T") : hiddenTeams.add("T");
  saveFilters();
  render();
});

elements.playerFilterList.addEventListener("change", (event) => {
  const playerId = event.target?.dataset?.playerId;
  if (!playerId) {
    return;
  }

  event.target.checked ? hiddenPlayers.delete(playerId) : hiddenPlayers.add(playerId);
  saveFilters();
  render();
});

elements.resetFilters.addEventListener("click", () => {
  hiddenTeams.clear();
  hiddenPlayers.clear();
  saveFilters();
  render();
});

function connectSocket() {
  elements.socketStatus.textContent = "Connecting";
  socket = new WebSocket(SERVER_WS_URL);

  socket.addEventListener("open", () => {
    elements.socketStatus.textContent = "Connected";
  });

  socket.addEventListener("close", () => {
    elements.socketStatus.textContent = "Disconnected, retrying";
    setTimeout(connectSocket, 1000);
  });

  socket.addEventListener("error", () => {
    elements.socketStatus.textContent = "Socket error";
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "reader-start") {
      elements.readerStatus.textContent = "Reader live";
      return;
    }

    if (message.type === "server-ready") {
      elements.readerStatus.textContent = message.feedEnabled === false
        ? "Feed paused"
        : (message.readerStartedAt ? "Reader live" : "Waiting for reader");
      return;
    }

    if (message.type === "feed-control") {
      elements.readerStatus.textContent = message.enabled ? "Reader live" : "Feed paused";
      return;
    }

    if (message.type === "radar-state") {
      radarState = normalizeIncomingState(message);
      elements.readerStatus.textContent = "Reader live";
      elements.lastUpdate.textContent = `Updated ${new Date(message.updatedAt || Date.now()).toLocaleTimeString()}`;
      render();
    }
  });
}

render();
connectSocket();
