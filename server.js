const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const BOTS_DIR = path.join(__dirname, 'bots');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

[BOTS_DIR, UPLOADS_DIR].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory bot processes store
const botProcesses = {};
const botLogs = {};

// ─── Multer (file upload) ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const botId = req.params.botId;
    const dir = path.join(BOTS_DIR, botId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// ─── Bot data helpers ────────────────────────────────────────────────────────
function getBotsData() {
  const file = path.join(__dirname, 'bots.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function saveBotsData(data) {
  fs.writeFileSync(path.join(__dirname, 'bots.json'), JSON.stringify(data, null, 2));
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// List bots
app.get('/api/bots', (req, res) => {
  const data = getBotsData();
  const bots = Object.entries(data).map(([id, bot]) => ({
    ...bot,
    id,
    running: !!botProcesses[id],
  }));
  res.json(bots);
});

// Create bot
app.post('/api/bots', (req, res) => {
  const { name, token } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'bot_' + Date.now();
  const data = getBotsData();
  data[id] = { name, token: token || '', createdAt: new Date().toISOString() };
  saveBotsData(data);
  fs.mkdirSync(path.join(BOTS_DIR, id), { recursive: true });
  // Write starter index.js
  const starter = `const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => console.log(\`✅ Logged in as \${client.user.tag}\`));

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content === '!ping') await message.reply('Pong! 🏓');
});

client.login(process.env.DISCORD_TOKEN || '${token || 'YOUR_TOKEN_HERE'}');
`;
  fs.writeFileSync(path.join(BOTS_DIR, id, 'index.js'), starter);
  res.json({ id, ...data[id] });
});

// Delete bot
app.delete('/api/bots/:botId', (req, res) => {
  const { botId } = req.params;
  stopBot(botId);
  const data = getBotsData();
  delete data[botId];
  saveBotsData(data);
  fs.rmSync(path.join(BOTS_DIR, botId), { recursive: true, force: true });
  res.json({ ok: true });
});

// Start bot
app.post('/api/bots/:botId/start', (req, res) => {
  const { botId } = req.params;
  if (botProcesses[botId]) return res.json({ ok: true, msg: 'already running' });
  const botDir = path.join(BOTS_DIR, botId);
  const indexFile = path.join(botDir, 'index.js');
  if (!fs.existsSync(indexFile)) return res.status(404).json({ error: 'index.js not found' });

  // Install deps if package.json exists
  if (fs.existsSync(path.join(botDir, 'package.json'))) {
    const install = spawn('npm', ['install', '--prefix', botDir], { cwd: botDir });
    install.on('close', () => startProcess(botId, botDir, res));
  } else {
    startProcess(botId, botDir, res);
  }
});

function startProcess(botId, botDir, res) {
  const data = getBotsData();
  const botToken = data[botId]?.token;
  const env = { ...process.env, DISCORD_TOKEN: botToken || '' };

  const proc = spawn('node', ['index.js'], { cwd: botDir, env });
  botProcesses[botId] = proc;
  botLogs[botId] = botLogs[botId] || [];

  const addLog = (type, text) => {
    const entry = { time: new Date().toLocaleTimeString('en-GB'), type, text };
    botLogs[botId].push(entry);
    if (botLogs[botId].length > 500) botLogs[botId].shift();
    io.emit(`log:${botId}`, entry);
  };

  proc.stdout.on('data', d => addLog('info', d.toString().trim()));
  proc.stderr.on('data', d => addLog('error', d.toString().trim()));
  proc.on('close', code => {
    delete botProcesses[botId];
    addLog('warn', `Process exited with code ${code}`);
    io.emit(`status:${botId}`, { running: false });
  });

  io.emit(`status:${botId}`, { running: true });
  addLog('ok', `Bot started ✅`);
  res.json({ ok: true });
}

// Stop bot
app.post('/api/bots/:botId/stop', (req, res) => {
  stopBot(req.params.botId);
  res.json({ ok: true });
});

function stopBot(botId) {
  if (botProcesses[botId]) {
    botProcesses[botId].kill();
    delete botProcesses[botId];
    io.emit(`status:${botId}`, { running: false });
  }
}

// Get bot logs
app.get('/api/bots/:botId/logs', (req, res) => {
  res.json(botLogs[req.params.botId] || []);
});

// Get bot status
app.get('/api/bots/:botId/status', (req, res) => {
  res.json({ running: !!botProcesses[req.params.botId] });
});

// List files
app.get('/api/bots/:botId/files', (req, res) => {
  const dir = path.join(BOTS_DIR, req.params.botId);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).map(name => {
    const stat = fs.statSync(path.join(dir, name));
    return { name, size: stat.size, mtime: stat.mtime };
  });
  res.json(files);
});

// Read file
app.get('/api/bots/:botId/files/:filename', (req, res) => {
  const filePath = path.join(BOTS_DIR, req.params.botId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
  res.json({ content: fs.readFileSync(filePath, 'utf8') });
});

// Save file
app.put('/api/bots/:botId/files/:filename', (req, res) => {
  const filePath = path.join(BOTS_DIR, req.params.botId, req.params.filename);
  fs.writeFileSync(filePath, req.body.content || '');
  res.json({ ok: true });
});

// Delete file
app.delete('/api/bots/:botId/files/:filename', (req, res) => {
  const filePath = path.join(BOTS_DIR, req.params.botId, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// Upload files
app.post('/api/bots/:botId/upload', upload.array('files'), (req, res) => {
  const files = req.files.map(f => ({ name: f.originalname, size: f.size }));
  res.json({ ok: true, files });
});

// Update bot token
app.patch('/api/bots/:botId', (req, res) => {
  const data = getBotsData();
  if (!data[req.params.botId]) return res.status(404).json({ error: 'not found' });
  if (req.body.token !== undefined) data[req.params.botId].token = req.body.token;
  if (req.body.name !== undefined) data[req.params.botId].name = req.body.name;
  saveBotsData(data);
  res.json({ ok: true });
});

server.listen(PORT, () => console.log(`🚀 BotHost running on http://localhost:${PORT}`));
