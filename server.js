const fastify = require('fastify');
const fs = require('fs/promises');
const path = require('path');

async function buildServer(options = {}) {
  const {
    logger = false,
    dbFile = path.join(__dirname, 'db.json'),
  } = options;

  const app = fastify({ logger });

  app.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  let keys = [];
  let nextId = 1;

  async function loadData() {
    try {
      const data = await fs.readFile(dbFile, 'utf8');
      keys = JSON.parse(data);
      const maxId = keys.reduce((max, k) => Math.max(max, k.id), 0);
      nextId = maxId + 1;
      // ensure new fields exist for already persisted keys
      keys.forEach((k) => {
        if (!k.history) k.history = [];
        if (!k.createdAt) k.createdAt = new Date().toISOString();
        if (!Object.prototype.hasOwnProperty.call(k, 'lastUsedAt')) k.lastUsedAt = null;
      });
    } catch (err) {
      keys = [];
      nextId = 1;
    }
  }

  async function saveData() {
    await fs.writeFile(dbFile, JSON.stringify(keys, null, 2));
  }

  await loadData();

  app.get('/keys', async () => keys);

  app.post('/keys', async (request, reply) => {
    const { key } = request.body || {};
    if (!key) {
      reply.code(400);
      return { error: 'Key fehlt im Request-Body' };
    }

    const now = new Date().toISOString();
    const newKey = {
      id: nextId++,
      key,
      inUse: false,
      assignedTo: null,
      createdAt: now,
      lastUsedAt: null,
      history: [],
    };

    keys.push(newKey);
    await saveData();
    reply.code(201);
    return newKey;
  });

  app.get('/keys/free', async (request, reply) => {
    const freeKey = keys.find((k) => !k.inUse);
    if (!freeKey) {
      reply.code(404);
      return { error: 'Kein verfügbarer Key gefunden' };
    }
    if (!freeKey.history) freeKey.history = [];
    const logEntry = {
      action: 'free',
      timestamp: new Date().toISOString(),
      assignedTo: null,
    };
    freeKey.history.push(logEntry);
    await saveData();
    return freeKey;
  });

  app.put('/keys/:id/inuse', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const { assignedTo } = request.body || {};
    const keyEntry = keys.find((k) => k.id === id);

    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }

    keyEntry.inUse = true;
    keyEntry.assignedTo = assignedTo || null;
    keyEntry.lastUsedAt = new Date().toISOString();
    if (!keyEntry.history) keyEntry.history = [];
    keyEntry.history.push({
      action: 'inuse',
      timestamp: keyEntry.lastUsedAt,
      assignedTo: keyEntry.assignedTo,
    });
    await saveData();
    return keyEntry;
  });

  app.get('/keys/:id/history', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const keyEntry = keys.find((k) => k.id === id);
    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }
    return keyEntry.history || [];
  });

  return app;
}

module.exports = buildServer;
