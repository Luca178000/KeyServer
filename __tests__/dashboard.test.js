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

  test('createActionButton setzt optionalen Titel', async () => {
    const { app } = await createServer();
    const res = await app.inject('/');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(res.payload, { runScripts: 'dangerously' });
    const btn = dom.window.createActionButton('x', 'icon-test', () => {}, 'Titel');
    expect(btn.getAttribute('title')).toBe('Titel');
    expect(btn.getAttribute('aria-label')).toBe('Titel');
  });

  test('updateStats aktualisiert die Z\u00e4hler', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    // Fiktive Antwort f\u00fcr den Fetch-Aufruf vorbereiten
    dom.window.fetch = jest.fn().mockResolvedValue({
      json: async () => [
        { inUse: false, invalid: false },
        { inUse: true, invalid: false },
        { inUse: false, invalid: true }
      ]
    });

    await dom.window.updateStats();

    expect(dom.window.document.getElementById('freeCount').textContent).toBe(2);
    expect(dom.window.document.getElementById('usedCount').textContent).toBe(1);
    expect(dom.window.document.getElementById('invalidCount').textContent).toBe(1);
  });

  test('loadFreeList und loadActiveList belegen das DOM', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    const freeData = [{ id: 1, key: 'FREE-KEY-0001' }];
    const activeData = [{ id: 2, key: 'USED-KEY-0002' }];

    // Mock f\u00fcr fetch, liefert unterschiedliche Daten je nach URL
    dom.window.fetch = jest.fn((url) => {
      return Promise.resolve({
        json: async () => {
          return url.includes('free') ? freeData : activeData;
        }
      });
    });

    await dom.window.loadFreeList();
    await dom.window.loadActiveList();

    const freeList = dom.window.document.getElementById('listFree');
    const activeList = dom.window.document.getElementById('listActive');

    expect(freeList.children).toHaveLength(1);
    expect(activeList.children).toHaveLength(1);
    expect(freeList.children[0].children[0].textContent).toBe('1: FREE-KEY-0001');
    expect(activeList.children[0].children[0].textContent).toBe('2: USED-KEY-0002');
  });


});
