const fastify = require('fastify')({ logger: true });
const fs = require('fs/promises');
const path = require('path');

// Static file serving
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

const DB_FILE = './db.json';

// In-Memory-Liste aller Keys
let keys = [];
let nextId = 1; // Laufende ID zur eindeutigen Identifikation

async function loadData() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    keys = JSON.parse(data);
    const maxId = keys.reduce((max, k) => Math.max(max, k.id), 0);
    nextId = maxId + 1;
  } catch (err) {
    keys = [];
    nextId = 1;
  }
}

async function saveData() {
  await fs.writeFile(DB_FILE, JSON.stringify(keys, null, 2));
}

/**
 * GET /keys - Gibt alle gespeicherten Keys zurück
 */
fastify.get('/keys', async (request, reply) => {
  return keys;
});

/**
 * POST /keys - Fügt einen neuen Key hinzu
 * Erwartet im Body ein Objekt { key: "..." }
 */
fastify.post('/keys', async (request, reply) => {
  const { key } = request.body || {};
  if (!key) {
    reply.code(400);
    return { error: 'Key fehlt im Request-Body' };
  }

  const newKey = {
    id: nextId++,
    key,
    inUse: false,
    assignedTo: null,
  };

  keys.push(newKey);
  await saveData();
  reply.code(201);
  return newKey;
});

/**
 * GET /keys/free - Gibt den ersten verfügbaren Key (inUse=false) zurück
 */
fastify.get('/keys/free', async (request, reply) => {
  const freeKey = keys.find(k => !k.inUse);
  if (!freeKey) {
    reply.code(404);
    return { error: 'Kein verfügbarer Key gefunden' };
  }
  return freeKey;
});

/**
 * PUT /keys/:id/inuse - Markiert den Key als in Benutzung
 * Erwartet im Body ein Objekt { assignedTo: "..." }
 */
fastify.put('/keys/:id/inuse', async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { assignedTo } = request.body || {};
  const keyEntry = keys.find(k => k.id === id);

  if (!keyEntry) {
    reply.code(404);
    return { error: 'Key nicht gefunden' };
  }

  keyEntry.inUse = true;
  keyEntry.assignedTo = assignedTo || null;
  await saveData();
  return keyEntry;
});

// Server auf Port 3000 starten
const start = async () => {
  try {
    await loadData();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server läuft auf Port 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
