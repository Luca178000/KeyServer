const path = require('path');
const os = require('os');
const fs = require('fs/promises');

jest.mock('../update', () => ({
  getAvailableUpdates: jest.fn(async () => ['fix bug', 'add feature']),
  applyUpdates: jest.fn(async () => ({ pull: 'ok', test: 'passed' }))
}));

const buildServer = require('../server');
const update = require('../update');

async function createServer() {
  const dbPath = path.join(os.tmpdir(), `db-${Date.now()}-${Math.random()}.json`);
  await fs.writeFile(dbPath, JSON.stringify({ lastWarned: null, keys: [] }));
  const app = await buildServer({ logger: false, dbFile: dbPath });
  return { app, dbPath };
}

describe('Update Endpunkte', () => {
  test('GET /updates liefert Liste neuer Commits', async () => {
    const { app } = await createServer();
    const res = await app.inject('/updates');
    expect(res.statusCode).toBe(200);
    const obj = JSON.parse(res.payload);
    expect(Array.isArray(obj.updates)).toBe(true);
    expect(obj.updates.length).toBe(2);
    expect(update.getAvailableUpdates).toHaveBeenCalled();
    await app.close();
  });

  test('POST /updates/apply ruft applyUpdates auf', async () => {
    const { app } = await createServer();
    const res = await app.inject({ method: 'POST', url: '/updates/apply' });
    expect(res.statusCode).toBe(200);
    const obj = JSON.parse(res.payload);
    expect(obj.pull).toBe('ok');
    expect(obj.test).toBe('passed');
    expect(update.applyUpdates).toHaveBeenCalled();
    await app.close();
  });
});
