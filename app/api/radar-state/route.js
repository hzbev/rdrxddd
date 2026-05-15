export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const store = globalThis.__radarStateStore ?? { state: null, updatedAt: 0 };
globalThis.__radarStateStore = store;

function normalizePayload(payload) {
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

export async function GET() {
  return Response.json({ ok: true, state: store.state, updatedAt: store.updatedAt });
}

export async function POST(request) {
  try {
    store.state = normalizePayload(await request.json());
    store.updatedAt = Date.now();
    return Response.json({ ok: true, updatedAt: store.updatedAt });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
