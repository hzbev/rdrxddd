# CS2 Radar WebSocket

Minimal one-page Express app using WebSockets for the native radar reader and all browser viewers.

## Run

```bash
npm install
npm run dev
```

Open `http://159.223.228.189:3000` in one or more browsers. Start the native reader from the repository root. It connects to `ws://159.223.228.189:3000/ws`, sends a `reader-start` message, then streams `radar-state` messages. The server broadcasts each message to every connected browser.

The reader WebSocket URL is currently hardcoded in `src/radar_client.cpp` as localhost for development.

Hidden feed control page: `http://159.223.228.189:3000/weskujihfuiewbhdi.html`. Use it to enable or disable receiving reader data and rebroadcasting updates.

## WebSocket Messages

The reader first sends:

```json
{ "type": "reader-start" }
```

Then it sends radar state using this shape:

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
