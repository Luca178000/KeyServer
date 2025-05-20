const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const buildServer = require('../server');

async function createServer() {
  const dbPath = path.join(os.tmpdir(), `db-${Date.now()}-${Math.random()}.json`);
  await fs.writeFile(dbPath, '[]');
  const app = await buildServer({ logger: false, dbFile: dbPath });
  return { app, dbPath };
}

describe('Key Server API', () => {
  test('POST /keys creates a new key and persists it', async () => {
    const { app, dbPath } = await createServer();

    const res = await app.inject({
      method: 'POST',
      url: '/keys',
      payload: { key: 'AAAAA-BBBBB-CCCCC-DDDDD' },
    });
    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.payload);
    expect(created).toMatchObject({ key: 'AAAAA-BBBBB-CCCCC-DDDDD', inUse: false });
    expect(created.createdAt).toBeDefined();
    expect(created.lastUsedAt).toBeNull();
    expect(created.history).toEqual([]);

    const file = await fs.readFile(dbPath, 'utf8');
    const content = JSON.parse(file);
    expect(content).toHaveLength(1);
    expect(content[0].key).toBe('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(content[0].history).toEqual([]);
  });

  test('GET /keys/free and PUT /keys/:id/inuse', async () => {
    const { app, dbPath } = await createServer();
    await app.inject({ method: 'POST', url: '/keys', payload: { key: 'KEY-ONE' } });
    await app.inject({ method: 'POST', url: '/keys', payload: { key: 'KEY-TWO' } });

    const freeRes = await app.inject('/keys/free');
    expect(freeRes.statusCode).toBe(200);
    const freeKey = JSON.parse(freeRes.payload);
    expect(freeKey.key).toBe('KEY-ONE');
    expect(freeKey.history).toHaveLength(1);
    expect(freeKey.history[0].action).toBe('free');

    const mark = await app.inject({
      method: 'PUT',
      url: `/keys/${freeKey.id}/inuse`,
      payload: { assignedTo: 'Max' },
    });
    expect(mark.statusCode).toBe(200);
    const updated = JSON.parse(mark.payload);
    expect(updated.inUse).toBe(true);
    expect(updated.assignedTo).toBe('Max');
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1]).toMatchObject({ action: 'inuse', assignedTo: 'Max' });

    const histRes = await app.inject(`/keys/${freeKey.id}/history`);
    const hist = JSON.parse(histRes.payload);
    expect(hist).toHaveLength(2);

    const nextFree = await app.inject('/keys/free');
    const next = JSON.parse(nextFree.payload);
    expect(next.key).toBe('KEY-TWO');

    await app.inject({ method: 'PUT', url: `/keys/${next.id}/inuse`, payload: {} });
    const none = await app.inject('/keys/free');
    expect(none.statusCode).toBe(404);

    const persisted = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    const stored = persisted.find((k) => k.id === freeKey.id);
    expect(stored.history).toHaveLength(2);
  });

  test('POST /keys without key returns 400', async () => {
    const { app } = await createServer();
    const res = await app.inject({ method: 'POST', url: '/keys', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
