const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const buildServer = require('../server');

// Hilfsfunktion zum Starten eines Servers mit temporärer Datenbank
async function createServer() {
  const dbPath = path.join(os.tmpdir(), `db-${Date.now()}-${Math.random()}.json`);
  await fs.writeFile(dbPath, '[]');
  const app = await buildServer({ logger: false, dbFile: dbPath });
  return { app, dbPath };
}

// Testet, ob das Dashboard das neue Stylesheet einbindet
describe('Dashboard', () => {
  test('liefert Link auf style.css', async () => {
    const { app } = await createServer();
    const res = await app.inject('/');
    expect(res.statusCode).toBe(200);
    // Im HTML-Code muss der Verweis auf die CSS-Datei vorhanden sein
    expect(res.payload).toContain('<link rel="stylesheet" href="style.css">');
  });
  test("enthaelt Tab-Navigation", async () => {
    const { app } = await createServer();
    const res = await app.inject("/");
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('data-tab="overview"');
    expect(res.payload).toContain('class="key-list"');
    expect(res.payload).toContain('Aktivierte Keys');
    expect(res.payload).toContain('invalidCount');
  });

  test('enthält Darkmode-Button', async () => {
    const { app } = await createServer();
    const res = await app.inject('/');
    expect(res.payload).toContain('id="themeToggle"');
  });

  test('verwendet Ergebnisboxen', async () => {
    const { app } = await createServer();
    const res = await app.inject('/');
    expect(res.payload).toContain('class="result-box"');
  });


  test('nutzt Icon-Buttons', async () => {
    const { app } = await createServer();
    const res = await app.inject('/');
    expect(res.payload).toContain('icon-button');
  });


});
