const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const buildServer = require('../server');

// Dieser Test prüft, ob Logeinträge tatsächlich in einer angegebenen Datei landen

describe('Logging in Datei', () => {
  test('schreibt Einträge in angegebene Logdatei', async () => {
    const dbPath = path.join(os.tmpdir(), `db-${Date.now()}-${Math.random()}.json`);
    const logPath = path.join(os.tmpdir(), `log-${Date.now()}-${Math.random()}.log`);
    await fs.writeFile(dbPath, JSON.stringify({ lastWarned: null, keys: [] }));

    const app = await buildServer({ logger: true, dbFile: dbPath, logFile: logPath });

    // Ein Key wird angelegt und anschließend abgefragt, um Logeinträge zu erzeugen
    await app.inject({ method: 'POST', url: '/keys', payload: { key: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' } });
    await app.inject('/keys/free');

    // Kurze Wartezeit, damit Pino die Daten schreibt
    await new Promise((r) => setTimeout(r, 10));

    const content = await fs.readFile(logPath, 'utf8');
    expect(content).toMatch(/Freier Key ausgegeben/);
  });
});
