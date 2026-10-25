
const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

app.get("/", (req, res) => {
  res.json({
    game: "Mind Breaker 2.0",
    status: "online",
    multiplayer: "WebSocket",
    rooms: rooms.size
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function createCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = Array.from(
      { length: 6 },
      () => chars[crypto.randomInt(chars.length)]
    ).join("");
  } while (rooms.has(code));

  return code;
}

function leaveRoom(ws) {
  if (!ws.roomCode) return;

  const room = rooms.get(ws.roomCode);
  ws.roomCode = null;

  if (!room) return;

  room.delete(ws);

  for (const player of room) {
    send(player, {
      type: "player_left",
      players: room.size
    });
  }

  if (room.size === 0) {
    rooms.delete([...rooms.entries()].find(
      ([, value]) => value === room
    )?.[0]);
  }
}

wss.on("connection", (ws) => {
  ws.id = crypto.randomUUID();
  ws.roomCode = null;

  send(ws, {
    type: "connected",
    message: "Conectado ao Mind Breaker 2.0",
    playerId: ws.id
  });

  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return send(ws, {
        type: "error",
        message: "Mensagem inválida."
      });
    }

    if (data.type === "create_room") {
      leaveRoom(ws);

      const code = createCode();
      const room = new Set([ws]);

      rooms.set(code, room);
      ws.roomCode = code;

      return send(ws, {
        type: "room_created",
        code,
        players: room.size
      });
    }

    if (data.type === "join_room") {
      const code = String(data.code || "")
        .trim()
        .toUpperCase();

      const room = rooms.get(code);

      if (!room) {
        return send(ws, {
          type: "error",
          message: "Sala não encontrada."
        });
      }

      if (room.size >= 8 && !room.has(ws)) {
        return send(ws, {
          type: "error",
          message: "Sala cheia."
        });
      }

      leaveRoom(ws);

      room.add(ws);
      ws.roomCode = code;

      for (const player of room) {
        send(player, {
          type: "player_joined",
          code,
          players: room.size
        });
      }

      return;
    }

    if (data.type === "room_message") {
      const room = rooms.get(ws.roomCode);

      if (!room) {
        return send(ws, {
          type: "error",
          message: "Entre em uma sala primeiro."
        });
      }

      const message = String(data.message || "").slice(0, 300);

      for (const player of room) {
        send(player, {
          type: "room_message",
          playerId: ws.id,
          message
        });
      }

      return;
    }

    if (data.type === "leave_room") {
      leaveRoom(ws);
      return send(ws, { type: "left_room" });
    }

    send(ws, {
      type: "error",
      message: "Comando desconhecido."
    });
  });

  ws.on("close", () => leaveRoom(ws));
  ws.on("error", (error) => console.error(error.message));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mind Breaker 2.0 na porta ${PORT}`);
});
