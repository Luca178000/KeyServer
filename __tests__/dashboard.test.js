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
});
