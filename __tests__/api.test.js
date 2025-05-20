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
      payload: { key: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' },
    });
    expect(res.statusCode).toBe(201);
    const arr = JSON.parse(res.payload);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(1);
    const created = arr[0];
    expect(created).toMatchObject({ key: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE', inUse: false });
    expect(created.createdAt).toBeDefined();
    expect(created.lastUsedAt).toBeNull();
    expect(created.history).toEqual([]);

    const file = await fs.readFile(dbPath, 'utf8');
    const content = JSON.parse(file);
    expect(content).toHaveLength(1);
    expect(content[0].key).toBe('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE');
    expect(content[0].history).toEqual([]);
  });

  test('POST /keys mit mehreren neuen Keys liefert alle Einträge', async () => {
    const { app, dbPath } = await createServer();
    const keys = [
      'AAAAA-BBBBB-CCCCC-DDDDD-11111',
      'AAAAA-BBBBB-CCCCC-DDDDD-22222',
      'AAAAA-BBBBB-CCCCC-DDDDD-33333',
    ];
    const res = await app.inject({ method: 'POST', url: '/keys', payload: { keys } });
    expect(res.statusCode).toBe(201);
    const arr = JSON.parse(res.payload);
    expect(arr).toHaveLength(3);
    expect(arr.map((k) => k.key).sort()).toEqual(keys.sort());

    const stored = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    expect(stored).toHaveLength(3);
  });

  test('POST /keys akzeptiert mehrere Keys in einem Request', async () => {
    const { app, dbPath } = await createServer();
    const res = await app.inject({
      method: 'POST',
      url: '/keys',
      payload: { keys: ['11111-22222-33333-44444-55555', 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA'] },
    });
    expect(res.statusCode).toBe(201);
    const arr = JSON.parse(res.payload);
    expect(arr).toHaveLength(2);

    const stored = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    expect(stored).toHaveLength(2);
  });

  test('GET /keys/free and PUT /keys/:id/inuse', async () => {
    const { app, dbPath } = await createServer();
    const k1 = 'AAAAA-AAAAA-AAAAA-AAAAA-00001';
    const k2 = 'AAAAA-AAAAA-AAAAA-AAAAA-00002';
    await app.inject({ method: 'POST', url: '/keys', payload: { key: k1 } });
    await app.inject({ method: 'POST', url: '/keys', payload: { key: k2 } });

    const freeRes = await app.inject('/keys/free');
    expect(freeRes.statusCode).toBe(200);
    const freeKey = JSON.parse(freeRes.payload);
    expect(freeKey.key).toBe(k1);
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
    expect(next.key).toBe(k2);

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

  test('POST /keys mit ung\xC3\xBCltigem Key liefert 400', async () => {
    const { app } = await createServer();
    // Hier wird ein falsch aufgebauter Key verwendet
    const res = await app.inject({
      method: 'POST',
      url: '/keys',
      payload: { key: 'AAAAA-BBBBB-CCCCC-DDDD' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('DELETE /keys/:id removes a key', async () => {
    const { app, dbPath } = await createServer();
    const k1 = 'BBBBB-BBBBB-BBBBB-BBBBB-BBBBB';
    const k2 = 'CCCCC-CCCCC-CCCCC-CCCCC-CCCCC';
    const one = await app.inject({ method: 'POST', url: '/keys', payload: { key: k1 } });
    const two = await app.inject({ method: 'POST', url: '/keys', payload: { key: k2 } });
    const first = JSON.parse(one.payload)[0];

    const del = await app.inject({ method: 'DELETE', url: `/keys/${first.id}` });
    expect(del.statusCode).toBe(200);

    const list = await app.inject('/keys');
    const all = JSON.parse(list.payload);
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe(k2);

    const persisted = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    expect(persisted).toHaveLength(1);
    expect(persisted[0].key).toBe(k2);
  });

  test('PUT /keys/:id/invalidate marks key as invalid', async () => {
    const { app, dbPath } = await createServer();
    const invalidKey = 'DDDDD-DDDDD-DDDDD-DDDDD-DDDDD';
    const res = await app.inject({ method: 'POST', url: '/keys', payload: { key: invalidKey } });
    const created = JSON.parse(res.payload)[0];

    const inv = await app.inject({ method: 'PUT', url: `/keys/${created.id}/invalidate` });
    expect(inv.statusCode).toBe(200);
    const updated = JSON.parse(inv.payload);
    expect(updated.invalid).toBe(true);

    const file = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    expect(file[0].invalid).toBe(true);
  });

  test('GET /keys/free ignores invalid keys', async () => {
    const { app } = await createServer();

    // Zwei Keys anlegen, von denen einer ungültig markiert wird
    const k1 = 'EEEEE-EEEEE-EEEEE-EEEEE-00001';
    const k2 = 'FFFFF-FFFFF-FFFFF-FFFFF-00002';
    const one = await app.inject({ method: 'POST', url: '/keys', payload: { key: k1 } });
    const two = await app.inject({ method: 'POST', url: '/keys', payload: { key: k2 } });
    const first = JSON.parse(one.payload)[0];

    // Ersten Key ungültig setzen
    await app.inject({ method: 'PUT', url: `/keys/${first.id}/invalidate` });

    const free = await app.inject('/keys/free');
    expect(free.statusCode).toBe(200);
    const data = JSON.parse(free.payload);
    // Erwartet wird der zweite Key, da der erste ungültig ist
    expect(data.key).toBe(k2);

    // Zweiten Key in Benutzung setzen, danach sollte keiner mehr frei sein
    await app.inject({ method: 'PUT', url: `/keys/${data.id}/inuse`, payload: {} });
    const none = await app.inject('/keys/free');
    expect(none.statusCode).toBe(404);
  });

  test('GET /keys filters by query parameters', async () => {
    const { app } = await createServer();

    const ka = 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA';
    const kb = 'BBBBB-BBBBB-BBBBB-BBBBB-BBBBB';
    const kc = 'CCCCC-CCCCC-CCCCC-CCCCC-CCCCC';
    const one = await app.inject({ method: 'POST', url: '/keys', payload: { key: ka } });
    const two = await app.inject({ method: 'POST', url: '/keys', payload: { key: kb } });
    const three = await app.inject({ method: 'POST', url: '/keys', payload: { key: kc } });

    const k1 = JSON.parse(one.payload)[0];
    const k3 = JSON.parse(three.payload)[0];

    await app.inject({ method: 'PUT', url: `/keys/${k1.id}/inuse`, payload: { assignedTo: 'Alice' } });
    await app.inject({ method: 'PUT', url: `/keys/${k3.id}/inuse`, payload: { assignedTo: 'Bob' } });

    const all = JSON.parse((await app.inject('/keys')).payload);
    expect(all).toHaveLength(3);

    const inUse = JSON.parse((await app.inject('/keys?inUse=true')).payload);
    expect(inUse).toHaveLength(2);
    expect(inUse.map((k) => k.key).sort()).toEqual([ka, kc].sort());

    const assigned = JSON.parse((await app.inject('/keys?assignedTo=Alice')).payload);
    expect(assigned).toHaveLength(1);
    expect(assigned[0].key).toBe(ka);

    const combo = JSON.parse((await app.inject('/keys?inUse=true&assignedTo=Bob')).payload);
    expect(combo).toHaveLength(1);
    expect(combo[0].key).toBe(kc);

    const notInUse = JSON.parse((await app.inject('/keys?inUse=false')).payload);
    expect(notInUse).toHaveLength(1);
    expect(notInUse[0].key).toBe(kb);
  });

  test('GET /keys/free/list returns only free keys', async () => {
    const { app } = await createServer();
    const k1 = 'AAAAA-AAAAA-AAAAA-AAAAA-11111';
    const k2 = 'BBBBB-BBBBB-BBBBB-BBBBB-22222';
    await app.inject({ method: 'POST', url: '/keys', payload: { key: k1 } });
    await app.inject({ method: 'POST', url: '/keys', payload: { key: k2 } });
    const first = JSON.parse((await app.inject('/keys/free')).payload);
    await app.inject({ method: 'PUT', url: `/keys/${first.id}/inuse`, payload: {} });

    const list = await app.inject('/keys/free/list');
    expect(list.statusCode).toBe(200);
    const arr = JSON.parse(list.payload);
    expect(arr.every((k) => k.inUse === false)).toBe(true);
    expect(arr).toHaveLength(1);
    expect(arr[0].key).toBe(k2);
  });

  test('GET /keys/active/list returns only used keys', async () => {
    const { app } = await createServer();
    const k1 = 'CCCCC-CCCCC-CCCCC-CCCCC-33333';
    const k2 = 'DDDDD-DDDDD-DDDDD-DDDDD-44444';
    await app.inject({ method: 'POST', url: '/keys', payload: { key: k1 } });
    const b = await app.inject({ method: 'POST', url: '/keys', payload: { key: k2 } });
    const bObj = JSON.parse(b.payload)[0];
    await app.inject({ method: 'PUT', url: `/keys/${bObj.id}/inuse`, payload: { assignedTo: 'Test' } });

    const list = await app.inject('/keys/active/list');
    expect(list.statusCode).toBe(200);
    const arr = JSON.parse(list.payload);
    expect(arr.every((k) => k.inUse === true)).toBe(true);
    expect(arr).toHaveLength(1);
    expect(arr[0].assignedTo).toBe('Test');
  });

  test('PUT /keys/:id/release marks key as free again', async () => {
    const { app, dbPath } = await createServer();
    const relKey = 'RELEA-SEEEE-SEEEE-SEEEE-00000';
    const res = await app.inject({ method: 'POST', url: '/keys', payload: { key: relKey } });
    const created = JSON.parse(res.payload)[0];

    await app.inject({ method: 'PUT', url: `/keys/${created.id}/inuse`, payload: { assignedTo: 'User' } });
    const rel = await app.inject({ method: 'PUT', url: `/keys/${created.id}/release` });
    expect(rel.statusCode).toBe(200);
    const updated = JSON.parse(rel.payload);
    expect(updated.inUse).toBe(false);
    expect(updated.assignedTo).toBeNull();
    expect(updated.history[updated.history.length - 1].action).toBe('release');

    // Überprüfung der gespeicherten Daten
    const stored = JSON.parse(await fs.readFile(dbPath, 'utf8'))[0];
    expect(stored.inUse).toBe(false);
    expect(stored.assignedTo).toBeNull();
    expect(stored.history[stored.history.length - 1].action).toBe('release');
  });

  test('Dashboard releaseKey flow via fetch', async () => {
    const { app } = await createServer();

    // Server auf zufälligem Port starten, um echte HTTP-Aufrufe zu simulieren
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;

    // Neuen Key anlegen und anschließend in Benutzung setzen
    const create = await fetch(`http://127.0.0.1:${port}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'FFFFF-FFFFF-FFFFF-FFFFF-00001' })
    });
    const created = (await create.json())[0];
    await fetch(`http://127.0.0.1:${port}/keys/${created.id}/inuse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: 'Tester' })
    });

    // Ablauf wie im Dashboard: Key wieder freigeben
    const rel = await fetch(`http://127.0.0.1:${port}/keys/${created.id}/release`, { method: 'PUT' });
    const data = await rel.json();

    expect(data.inUse).toBe(false);
    expect(data.assignedTo).toBeNull();

    await app.close();
  });

  test('Dashboard deleteKey flow via fetch', async () => {
    const { app } = await createServer();

    // Server auf zuf\xC3\xA4lligem Port starten, um echte HTTP-Aufrufe zu simulieren
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;

    // Key anlegen, der anschlie\xC3\x9Fend gel\xC3\xB6scht werden soll
    const create = await fetch(`http://127.0.0.1:${port}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-00001' })
    });
    const created = (await create.json())[0];

    // L\xC3\xB6schen wie im Dashboard
    const del = await fetch(`http://127.0.0.1:${port}/keys/${created.id}`, { method: 'DELETE' });
    const data = await del.json();

    expect(data.success).toBe(true);

    // Sicherstellen, dass der Key wirklich entfernt wurde
    const list = await fetch(`http://127.0.0.1:${port}/keys`);
    const arr = await list.json();
    expect(arr).toHaveLength(0);

    await app.close();
  });

  test('Dashboard filter list via query parameters', async () => {
    const { app } = await createServer();

    // Server starten, um HTTP-Aufrufe wie im Dashboard zu ermöglichen
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;

    // Zwei Keys anlegen und einen davon als benutzt markieren
    const aRes = await fetch(`http://127.0.0.1:${port}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'AAAAA-AAAAA-AAAAA-AAAAA-00001' })
    });
    const a = (await aRes.json())[0];
    const bRes = await fetch(`http://127.0.0.1:${port}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'BBBBB-BBBBB-BBBBB-BBBBB-00002' })
    });
    const b = (await bRes.json())[0];

    await fetch(`http://127.0.0.1:${port}/keys/${a.id}/inuse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: 'Tester' })
    });

    // Filter nach benutzten Keys
    const usedRes = await fetch(`http://127.0.0.1:${port}/keys?inUse=true`);
    const used = await usedRes.json();
    expect(used).toHaveLength(1);
    expect(used[0].id).toBe(a.id);

    // Filter nach Name
    const nameRes = await fetch(`http://127.0.0.1:${port}/keys?assignedTo=Tester`);
    const byName = await nameRes.json();
    expect(byName).toHaveLength(1);
    expect(byName[0].id).toBe(a.id);

    // Beide Parameter kombiniert
    const comboRes = await fetch(`http://127.0.0.1:${port}/keys?inUse=true&assignedTo=Tester`);
    const combo = await comboRes.json();
    expect(combo).toHaveLength(1);
    expect(combo[0].id).toBe(a.id);

    await app.close();
  });

  test('Dashboard invalidateKey flow via fetch', async () => {
    const { app } = await createServer();

    // Server starten, um HTTP-Aufrufe wie im Dashboard zu ermöglichen
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;

    // Einen neuen Key anlegen
    const create = await fetch(`http://127.0.0.1:${port}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'VVVVV-VVVVV-VVVVV-VVVVV-00001' })
    });
    const created = (await create.json())[0];

    // Im Dashboard wird der Key per Button als ungültig markiert
    const inv = await fetch(`http://127.0.0.1:${port}/keys/${created.id}/invalidate`, { method: 'PUT' });
    const data = await inv.json();

    expect(data.invalid).toBe(true);

    // Danach darf kein freier Key mehr vorhanden sein
    const free = await fetch(`http://127.0.0.1:${port}/keys/free`);
    expect(free.status).toBe(404);

    await app.close();
  });
});
