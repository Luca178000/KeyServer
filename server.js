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
        if (!Object.prototype.hasOwnProperty.call(k, 'invalid')) k.invalid = false;
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

  app.get('/keys', async (request) => {
    let result = keys;
    const { inUse, assignedTo } = request.query || {};

    if (typeof inUse !== 'undefined') {
      const bool = String(inUse).toLowerCase() === 'true';
      result = result.filter((k) => k.inUse === bool);
    }

    if (typeof assignedTo !== 'undefined') {
      result = result.filter((k) => k.assignedTo === assignedTo);
    }

    return result;
  });

  app.post('/keys', async (request, reply) => {
    const { key, keys: keyList } = request.body || {};

    // Sowohl ein einzelner Key als auch ein Array von Keys werden akzeptiert
    // In diesem Array sammeln wir alle vom Client gesendeten Einträge
    const incoming = [];
    if (Array.isArray(keyList)) incoming.push(...keyList);
    else if (typeof key === 'string') incoming.push(key);

    if (incoming.length === 0) {
      reply.code(400);
      return { error: 'Key fehlt im Request-Body' };
    }

    // Regex, das auf das Muster XXXXX-XXXXX-XXXXX-XXXXX-XXXXX prüft
    const pattern = /^[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}$/;

    const created = [];
    // Alle übergebenen Keys einzeln validieren und anlegen
    for (const entry of incoming) {
      // Ungültige Keys überspringen
      if (!pattern.test(entry)) continue;

      const now = new Date().toISOString();
      const newKey = {
        id: nextId++,
        key: entry,
        inUse: false,
        assignedTo: null,
        createdAt: now,
        lastUsedAt: null,
        history: [],
        invalid: false,
      };
      keys.push(newKey);
      created.push(newKey);
    }

    // Wurden keine gültigen Keys übergeben, antworten wir mit einem Fehler
    if (created.length === 0) {
      reply.code(400);
      return { error: 'Kein gültiger Key übergeben' };
    }

    await saveData();
    reply.code(201);
    return created;
  });

  app.get('/keys/free', async (request, reply) => {
    // Suche nach dem ersten freien und zugleich nicht als ungültig markierten Key
    const freeKey = keys.find((k) => !k.inUse && !k.invalid);
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

  // Gibt eine Liste aller aktuell freien Keys zurück
  // Diese Route wird im Dashboard verwendet, um sofort alle verfügbaren
  // Keys anzeigen zu können.
  app.get('/keys/free/list', async () => {
    // Filtert alle Keys, deren inUse-Flag nicht gesetzt ist
    const available = keys.filter((k) => !k.inUse);
    return available;
  });

  // Liefert alle Keys, die momentan in Benutzung sind
  // So lässt sich schnell sehen, welche Keys vergeben wurden.
  app.get('/keys/active/list', async () => {
    // Filtert alle Keys mit gesetztem inUse-Flag
    const active = keys.filter((k) => k.inUse);
    return active;
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

  // Setzt einen Key wieder auf "frei" und entfernt die Zuweisung
  app.put('/keys/:id/release', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const keyEntry = keys.find((k) => k.id === id);

    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }

    // Flag zur Nutzung entfernen und Zuweisung zurücksetzen
    keyEntry.inUse = false;
    keyEntry.assignedTo = null;
    if (!keyEntry.history) keyEntry.history = [];
    const now = new Date().toISOString();
    keyEntry.history.push({ action: 'release', timestamp: now, assignedTo: null });
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

  app.put('/keys/:id/invalidate', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const keyEntry = keys.find((k) => k.id === id);
    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }
    keyEntry.invalid = true;
    await saveData();
    return keyEntry;
  });

  app.delete('/keys/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const index = keys.findIndex((k) => k.id === id);
    if (index === -1) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }
    keys.splice(index, 1);
    await saveData();
    return { success: true };
  });

  return app;
}

module.exports = buildServer;
