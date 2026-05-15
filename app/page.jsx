"use client";

import { useEffect, useRef, useState } from "react";

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
  tick: 128452,
  bomb: { status: "carried", carrierId: "t1" },
  players: [
    { id: "ct1", name: "Blue", team: "CT", health: 100, money: 4300, weapons: ["M4A1-S", "USP-S"], position: { x: -1710, y: -505, z: 0 }, yaw: 88, alive: true },
    { id: "ct2", name: "Green", team: "CT", health: 74, money: 1600, weapons: ["FAMAS"], position: { x: -2230, y: -140, z: 0 }, yaw: 210, alive: true },
    { id: "ct3", name: "Yellow", team: "CT", health: 0, money: 300, weapons: ["USP-S"], position: { x: -1870, y: -960, z: 0 }, yaw: 20, alive: false },
    { id: "t1", name: "Orange", team: "T", health: 91, money: 5200, weapons: ["AK-47", "Glock-18"], position: { x: -910, y: -1010, z: 0 }, yaw: 308, alive: true },
    { id: "t2", name: "Purple", team: "T", health: 48, money: 2200, weapons: ["Galil AR"], position: { x: -1220, y: -520, z: 0 }, yaw: 140, alive: true }
  ]
};

function waitForIceGathering(peer) {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handleStateChange = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", handleStateChange);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", handleStateChange);
  });
}

function encodeDescription(description) {
  return btoa(JSON.stringify(description));
}

function decodeDescription(value) {
  return JSON.parse(atob(value.trim()));
}

function normalizeIncomingState(message) {
  const state = message?.type === "radar-state" ? message.state : message;
  if (!state || !Array.isArray(state.players)) {
    throw new Error("Incoming message does not contain a players array.");
  }

  return {
    mapName: state.mapName || "de_mirage",
    tick: state.tick || 0,
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
      alive: player.alive !== false
    }))
  };
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

export default function Home() {
  const [state, setState] = useState(sampleState);
  const [status, setStatus] = useState("Not connected");
  const [role, setRole] = useState("host");
  const [localSignal, setLocalSignal] = useState("");
  const [remoteSignal, setRemoteSignal] = useState("");
  const [error, setError] = useState("");
  const [feedStatus, setFeedStatus] = useState("Waiting for recorder");
  const [lastFeedAt, setLastFeedAt] = useState("");
  const peerRef = useRef(null);
  const channelRef = useRef(null);

  const meta = mapMeta[state.mapName] || mapMeta.de_mirage;
  const localPlayer = state.players.find((player) => player.alive && player.position?.z !== undefined);
  const mapImage = meta.lowerImage && localPlayer?.position?.z < meta.lowerZ ? meta.lowerImage : meta.image;
  const teams = ["CT", "T"];

  useEffect(() => {
    return () => peerRef.current?.close();
  }, []);

  useEffect(() => {
    let stopped = false;
    let lastUpdatedAt = 0;

    async function pollRecorderFeed() {
      try {
        const response = await fetch("/api/radar-state", { cache: "no-store" });
        const payload = await response.json();

        if (payload.state && payload.updatedAt && payload.updatedAt !== lastUpdatedAt) {
          lastUpdatedAt = payload.updatedAt;
          const nextState = normalizeIncomingState(payload.state);
          setState(nextState);
          if (channelRef.current?.readyState === "open") {
            channelRef.current.send(JSON.stringify({ type: "radar-state", state: nextState }));
          }
          setLastFeedAt(new Date(payload.updatedAt).toLocaleTimeString());
          setFeedStatus("Recorder feed live");
        } else if (!payload.state) {
          setFeedStatus("Waiting for recorder");
        }
      } catch {
        setFeedStatus("Recorder feed unavailable");
      }

      if (!stopped) {
        setTimeout(pollRecorderFeed, 50);
      }
    }

    pollRecorderFeed();
    return () => {
      stopped = true;
    };
  }, []);

  function resetPeer(nextRole = role) {
    peerRef.current?.close();
    channelRef.current = null;

    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerRef.current = peer;
    setError("");
    setStatus("Peer created");

    peer.onconnectionstatechange = () => setStatus(peer.connectionState);
    peer.ondatachannel = (event) => attachChannel(event.channel);

    if (nextRole === "host") {
      attachChannel(peer.createDataChannel("radar-state"));
    }

    return peer;
  }

  function attachChannel(channel) {
    channelRef.current = channel;
    channel.onopen = () => setStatus("Data channel open");
    channel.onclose = () => setStatus("Data channel closed");
    channel.onerror = () => setError("Data channel error");
    channel.onmessage = (event) => {
      try {
        setState(normalizeIncomingState(JSON.parse(event.data)));
      } catch (err) {
        setError(err.message);
      }
    };
  }

  async function createOffer() {
    const peer = resetPeer("host");
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);
    setLocalSignal(encodeDescription(peer.localDescription));
  }

  async function acceptOffer() {
    const peer = resetPeer("viewer");
    await peer.setRemoteDescription(decodeDescription(remoteSignal));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await waitForIceGathering(peer);
    setLocalSignal(encodeDescription(peer.localDescription));
  }

  async function acceptAnswer() {
    if (!peerRef.current) {
      throw new Error("Create an offer before accepting an answer.");
    }
    await peerRef.current.setRemoteDescription(decodeDescription(remoteSignal));
    setStatus("Answer accepted");
  }

  function run(action) {
    action().catch((err) => setError(err.message));
  }

  function sendSample() {
    if (channelRef.current?.readyState !== "open") {
      setError("Open a WebRTC data channel before sending sample state.");
      return;
    }

    const nextState = {
      ...state,
      tick: state.tick + 1,
      players: state.players.map((player, index) => ({
        ...player,
        position: {
          ...player.position,
          x: player.position.x + (index % 2 === 0 ? 45 : -32),
          y: player.position.y + (index % 2 === 0 ? -20 : 26)
        },
        yaw: (player.yaw + 18) % 360
      }))
    };
    setState(nextState);
    channelRef.current.send(JSON.stringify({ type: "radar-state", state: nextState }));
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">CS2 WebRTC Radar</p>
          <h1>{state.mapName}</h1>
        </div>
        <div className="match-meta">
          <span>Tick {state.tick}</span>
          <span>{feedStatus}</span>
          <span>{status}</span>
        </div>
      </section>

      <section className="layout">
        <TeamPanel title="Counter-Terrorists" players={state.players.filter((player) => player.team === teams[0])} bomb={state.bomb} />

        <section className="radar-card">
          <div className="radar" style={{ backgroundImage: `url(${mapImage})` }}>
            <div className="radar-vignette" />
            {state.players.map((player) => {
              const point = getRadarPoint(player, meta);
              const hasBomb = state.bomb?.carrierId === player.id;
              return (
                <div
                  className={`marker ${player.team.toLowerCase()} ${player.alive ? "" : "dead"}`}
                  key={player.id}
                  style={{
                    left: `${point.left}%`,
                    top: `${point.top}%`,
                    "--marker-rotation": `${90 - player.yaw}deg`,
                    "--marker-counter-rotation": `${player.yaw - 90}deg`
                  }}
                  title={`${player.name} ${player.health} HP`}
                >
                  <span className="cone" />
                  <strong>{player.name.slice(0, 1)}</strong>
                  {hasBomb ? <em>B</em> : null}
                </div>
              );
            })}
          </div>
          <BombStatus bomb={state.bomb} players={state.players} />
        </section>

        <TeamPanel title="Terrorists" players={state.players.filter((player) => player.team === teams[1])} bomb={state.bomb} />
      </section>

      <section className="webrtc-card">
        <div className="feed-row">
          <div>
            <h2>Live Recorder Feed</h2>
            <p>Start this Next app, start the native recorder, then open this URL. The recorder posts radar state to the local Next endpoint automatically.</p>
          </div>
          <strong>{lastFeedAt ? `Updated ${lastFeedAt}` : feedStatus}</strong>
        </div>
      </section>

      <details className="webrtc-card">
        <summary>Manual Browser WebRTC Tools</summary>
        <p className="helper-text">Optional browser-to-browser data channel testing. The native recorder feed above does not need this manual signaling flow.</p>
        <div className="role-row">
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="host">Host / Sender</option>
              <option value="viewer">Viewer / Receiver</option>
            </select>
          </label>
          <button onClick={() => run(createOffer)} disabled={role !== "host"}>Create offer</button>
          <button onClick={() => run(acceptOffer)} disabled={role !== "viewer"}>Accept offer / create answer</button>
          <button onClick={() => run(acceptAnswer)} disabled={role !== "host"}>Accept answer</button>
          <button onClick={sendSample}>Send sample update</button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="signal-grid">
          <label>
            Local signal
            <textarea readOnly value={localSignal} placeholder="Generated offer or answer appears here" />
          </label>
          <label>
            Remote signal
            <textarea value={remoteSignal} onChange={(event) => setRemoteSignal(event.target.value)} placeholder="Paste the other peer signal here" />
          </label>
        </div>
      </details>
    </main>
  );
}

function TeamPanel({ title, players, bomb }) {
  return (
    <aside className="team-panel">
      <h2>{title}</h2>
      {players.map((player) => (
        <article className={`player-card ${player.alive ? "" : "dead"}`} key={player.id}>
          <div className="player-head">
            <strong>{player.name}</strong>
            <span>{player.health} HP</span>
          </div>
          <div className="bar"><span style={{ width: `${Math.max(0, Math.min(100, player.health))}%` }} /></div>
          <p>${player.money ?? "----"}</p>
          <p>Armor {player.armor ?? 0}{player.helmet ? " + helmet" : ""}{player.defuser ? " + kit" : ""}</p>
          <p>{player.weapons?.length ? player.weapons.join(" / ") : "Weapons unavailable"}</p>
          {bomb?.carrierId === player.id ? <small>Bomb carrier</small> : null}
        </article>
      ))}
    </aside>
  );
}

function BombStatus({ bomb, players }) {
  const carrier = players.find((player) => player.id === bomb?.carrierId);
  return (
    <div className="bomb-status">
      <strong>Bomb</strong>
      <span>{bomb?.status || "unknown"}</span>
      {carrier ? <span>Carrier: {carrier.name}</span> : null}
    </div>
  );
}
