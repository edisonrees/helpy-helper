const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.HELPY_API_KEY || "";
const ONLINE_MS = Number(process.env.ONLINE_THRESHOLD_MS || 45000);
const MAX_COMMANDS = 500;
const CLAIM_TIMEOUT_MS = Number(process.env.CLAIM_TIMEOUT_MS || 180000);

/** @type {Map<string, { id: string, hostname: string, user: string, os: string, version: string, firstSeen: number, lastSeen: number }>} */
const devices = new Map();

/** @type {Array<{ id: string, target: string, action: string, payload: object, createdAt: number, acks: Map<string, { result: string, at: number }>, claims: Map<string, number> }>} */
const commands = [];

function isOnline(device) {
  return Date.now() - device.lastSeen <= ONLINE_MS;
}

function requireAdmin(req, res, next) {
  if (!API_KEY) return next();
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.query.key || "";
  if (token !== API_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized — set Authorization: Bearer <HELPY_API_KEY>" });
  }
  next();
}

function pruneCommands() {
  while (commands.length > MAX_COMMANDS) commands.shift();
}

function releaseStaleClaims(cmd, now = Date.now()) {
  if (!cmd.claims) return;
  for (const [deviceId, claimedAt] of cmd.claims.entries()) {
    if (now - claimedAt > CLAIM_TIMEOUT_MS) cmd.claims.delete(deviceId);
  }
}

function isPendingForDevice(cmd, deviceId) {
  if (cmd.acks.has(deviceId)) return false;
  releaseStaleClaims(cmd);
  if (cmd.claims?.has(deviceId)) return false;
  return cmd.target === "all" || cmd.target === deviceId;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "helpy-helper", devices: devices.size });
});

app.post("/api/devices/register", (req, res) => {
  const { deviceId, hostname, user, os, version } = req.body || {};
  if (!deviceId) return res.status(400).json({ ok: false, error: "deviceId required" });

  const now = Date.now();
  const existing = devices.get(deviceId);
  const record = {
    id: deviceId,
    hostname: hostname || "unknown",
    user: user || "unknown",
    os: os || "unknown",
    version: version || "unknown",
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
  };
  devices.set(deviceId, record);
  res.json({ ok: true, device: { ...record, online: true }, hubUrl: process.env.PUBLIC_URL || null });
});

app.post("/api/devices/heartbeat", (req, res) => {
  const { deviceId } = req.body || {};
  if (!deviceId || !devices.has(deviceId)) {
    return res.status(404).json({ ok: false, error: "Device not registered" });
  }
  const device = devices.get(deviceId);
  device.lastSeen = Date.now();
  res.json({ ok: true, online: true });
});

app.get("/api/devices", requireAdmin, (_req, res) => {
  const list = [...devices.values()]
    .map((d) => ({ ...d, online: isOnline(d), lastSeenAgo: Date.now() - d.lastSeen }))
    .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);
  res.json({ ok: true, onlineThresholdMs: ONLINE_MS, devices: list });
});

app.post("/api/commands", requireAdmin, (req, res) => {
  const { target, action, payload } = req.body || {};
  if (!action) return res.status(400).json({ ok: false, error: "action required" });
  if (!target) return res.status(400).json({ ok: false, error: "target required (device id or 'all')" });

  if (target !== "all" && !devices.has(target)) {
    return res.status(404).json({ ok: false, error: "Unknown device id" });
  }

  const cmd = {
    id: randomUUID(),
    target,
    action,
    payload: payload || {},
    createdAt: Date.now(),
    acks: new Map(),
    claims: new Map(),
  };
  commands.push(cmd);
  pruneCommands();
  res.json({ ok: true, command: serializeCommand(cmd) });
});

app.get("/api/commands", requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const list = commands
    .slice(-limit)
    .reverse()
    .map(serializeCommand);
  res.json({ ok: true, commands: list });
});

app.get("/api/commands/poll", (req, res) => {
  const deviceId = req.query.deviceId;
  if (!deviceId || !devices.has(deviceId)) {
    return res.status(404).json({ ok: false, error: "Device not registered" });
  }

  const device = devices.get(deviceId);
  device.lastSeen = Date.now();

  const now = Date.now();
  const pending = commands.filter((c) => isPendingForDevice(c, deviceId));

  // Claim immediately so the next poll cannot re-deliver the same command.
  for (const c of pending) {
    if (!c.claims) c.claims = new Map();
    c.claims.set(deviceId, now);
  }

  res.json({
    ok: true,
    commands: pending.map((c) => ({
      id: c.id,
      action: c.action,
      payload: c.payload,
      createdAt: c.createdAt,
    })),
  });
});

app.post("/api/commands/:id/ack", (req, res) => {
  const { deviceId, result } = req.body || {};
  const cmd = commands.find((c) => c.id === req.params.id);
  if (!cmd) return res.status(404).json({ ok: false, error: "Command not found" });
  if (!deviceId) return res.status(400).json({ ok: false, error: "deviceId required" });

  cmd.acks.set(deviceId, { result: result || "ok", at: Date.now() });
  cmd.claims?.delete(deviceId);
  if (devices.has(deviceId)) devices.get(deviceId).lastSeen = Date.now();
  res.json({ ok: true });
});

function serializeCommand(c) {
  return {
    id: c.id,
    target: c.target,
    action: c.action,
    payload: c.payload,
    createdAt: c.createdAt,
    acks: Object.fromEntries(c.acks),
    claims: c.claims ? Object.fromEntries(c.claims) : {},
  };
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`helpy-helper listening on :${PORT}`);
  console.log(`Admin auth: ${API_KEY ? "HELPY_API_KEY set" : "OPEN (set HELPY_API_KEY in production)"}`);
});
