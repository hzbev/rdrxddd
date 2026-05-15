# CS2 Radar WebRTC

Minimal Next.js radar display using static map assets, a local recorder ingest endpoint, and optional WebRTC data channels for peer-to-peer browser testing.

## Run

```bash
npm install
npm run dev
```

Open two browser windows. In the first, choose **Host / Sender** and create an offer. Paste that offer into the second window as **Viewer / Receiver**, create an answer, then paste the answer back into the host.

For the native recorder in the repository root, start this app and open `http://127.0.0.1:3000`. The recorder posts live state to `http://127.0.0.1:3000/api/radar-state` automatically. Set `RADAR_WEB_URL` before launching the recorder if the Next app is hosted somewhere else, for example `http://192.168.1.20:3000/api/radar-state`.

```powershell
$env:RADAR_WEB_URL="http://127.0.0.1:3000/api/radar-state"
```

## WebRTC Notes

The browser page still includes manual WebRTC tools for browser-to-browser data channel testing.

The app uses manual SDP copy/paste signaling. This keeps server requirements minimal, but it is not convenient for public multi-user deployments. A production deployment would usually add a small WebSocket/API signaling service only for exchanging offers, answers, and ICE candidates; radar state itself should continue over the WebRTC data channel.

The native C++ recorder does not include a native WebRTC stack. Its zero-setup path uses the local Next.js API route as a tiny HTTP ingest bridge so opening the app URL is enough to see live recorder data.

## Data Shape

Send JSON messages over the WebRTC data channel using this shape:

```json
{
  "type": "radar-state",
  "state": {
    "mapName": "de_mirage",
    "tick": 12345,
    "bomb": { "status": "carried", "carrierId": "t1" },
    "players": [
      {
        "id": "ct1",
        "name": "Blue",
        "team": "CT",
        "health": 100,
        "money": 4200,
        "weapons": ["M4A1-S", "USP-S"],
        "position": { "x": -1100, "y": -400, "z": 0 },
        "yaw": 80,
        "alive": true
      }
    ]
  }
}
```

For compatibility with simpler feeds, player coordinates can also be sent as top-level `x`, `y`, `z`, and angle as `angles`.
