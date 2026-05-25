const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const config = require("./config");
const rooms = require("./rooms");
const { initFCM, sendPushNotification } = require("./fcm");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

initFCM();

const userTokens = new Map();
const pendingAudio = new Map();
const wsClients = new Map();

app.post("/api/register-token", (req, res) => {
  const { userId, fcmToken } = req.body;
  if (userId && fcmToken) {
    userTokens.set(userId, fcmToken);
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: "userId and fcmToken required" });
  }
});

app.post("/api/pending-messages", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const messages = pendingAudio.get(userId) || [];
  res.json({ messages });
});

app.post("/api/clear-pending", (req, res) => {
  const { userId } = req.body;
  if (userId) pendingAudio.delete(userId);
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

function sendJSON(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function getChannelClients(channel) {
  const users = rooms.getRoomUsers(channel);
  const clients = [];
  for (const user of users) {
    const ws = wsClients.get(user.socketId);
    if (ws && ws.readyState === 1) {
      clients.push(ws);
    }
  }
  return clients;
}

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  wsClients.set(clientId, ws);
  console.log(`Client connected: ${clientId}`);

  let currentUser = null;
  let currentChannel = null;

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type } = data;

      if (type === "join") {
        currentChannel = data.channel;
        currentUser = {
          userId: clientId,
          username: data.username || "Anonymous",
          fcmToken: data.fcmToken || null,
          socketId: clientId,
        };

        wsClients.set(clientId, ws);
        rooms.joinRoom(clientId, currentChannel, currentUser);

        const users = rooms.getRoomUsers(currentChannel);
        const channelClients = getChannelClients(currentChannel);
        for (const c of channelClients) {
          sendJSON(c, { type: "users_update", channel: currentChannel, users });
        }

        console.log(`${currentUser.username} joined channel: ${currentChannel}`);
        sendJSON(ws, { type: "connected", userId: clientId });
      }

      else if (type === "audio_start") {
        const channel = currentChannel;
        if (!channel) return;
        const channelClients = getChannelClients(channel);
        for (const c of channelClients) {
          if (c !== ws) {
            sendJSON(c, { type: "audio_start", userId: clientId, username: currentUser?.username });
          }
        }
      }

      else if (type === "audio_data") {
        const channel = currentChannel;
        if (!channel) return;
        const channelClients = getChannelClients(channel);
        for (const c of channelClients) {
          if (c !== ws) {
            sendJSON(c, { type: "audio_data", userId: clientId, audio: data.audio, seq: data.seq });
          }
        }
      }

      else if (type === "audio_end") {
        const channel = currentChannel;
        if (!channel) return;

        const channelClients = getChannelClients(channel);
        for (const c of channelClients) {
          if (c !== ws) {
            sendJSON(c, { type: "audio_end", userId: clientId });
          }
        }

        if (currentUser?.fcmToken) {
          const users = rooms.getRoomUsers(channel);
          for (const user of users) {
            if (user.userId !== clientId && user.fcmToken) {
              const userWs = wsClients.get(user.userId);
              if (!userWs || userWs.readyState !== 1) {
                sendPushNotification(
                  user.fcmToken,
                  "Lamprea Talkies",
                  `${currentUser?.username || "Someone"} sent a voice message`,
                  { channel, senderId: clientId, senderName: currentUser?.username || "Someone" }
                );
              }
            }
          }
        }
      }

      else if (type === "leave_channel") {
        const channel = data.channel || currentChannel;
        if (!channel) return;
        rooms.leaveRoom(clientId, channel);
        wsClients.delete(clientId);
        currentChannel = null;

        const users = rooms.getRoomUsers(channel);
        const channelClients = getChannelClients(channel);
        for (const c of channelClients) {
          sendJSON(c, { type: "users_update", channel, users });
        }
      }

    } catch (err) {
      console.error("Message error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${clientId}`);
    if (currentChannel) {
      const channel = currentChannel;
      rooms.leaveRoom(clientId, channel);
      wsClients.delete(clientId);
      const users = rooms.getRoomUsers(channel);
      const channelClients = getChannelClients(channel);
      for (const c of channelClients) {
        sendJSON(c, { type: "users_update", channel, users });
      }
    } else {
      wsClients.delete(clientId);
    }
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error: ${err.message}`);
  });
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Lamprea Talkies server running on port ${config.port}`);
});
Add index.js
