const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const buildServer = require('../server');

// Hilfsfunktion zum Starten eines Servers mit temporärer Datenbank
async function createServer() {
  const dbPath = path.join(os.tmpdir(), `db-${Date.now()}-${Math.random()}.json`);
  await fs.writeFile(dbPath, JSON.stringify({ lastWarned: null, keys: [] }));
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
    expect(res.payload).toContain('href="style.css"');
  });
  test("enthaelt Tab-Navigation", async () => {
    const { app } = await createServer();
    const res = await app.inject("/");
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('data-tab="overview"');
    expect(res.payload).toContain('class="key-list"');
    expect(res.payload).toContain('Aktivierte Keys');
    expect(res.payload).toContain('invalidCount');
    expect(res.payload).toContain('data-tab="stats"');
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

  test('ordnet die Listen nebeneinander an', async () => {
    const { app } = await createServer();
    const res = await app.inject('/');
    expect(res.payload).toContain('class="key-lists"');
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
    // Kurze Pause, damit die asynchronen Aufrufe abgeschlossen sind
    await new Promise(r => setImmediate(r));

    const freeList = dom.window.document.getElementById('listFree');
    const activeList = dom.window.document.getElementById('listActive');

    expect(freeList.children).toHaveLength(1);
    expect(activeList.children).toHaveLength(1);
    expect(freeList.children[0].innerHTML).toContain('1: FREE-KEY-0001');
    expect(activeList.children[0].innerHTML).toContain('2: USED-KEY-0002');
  });

  test('sidebarToggle blendet die Sidebar ein und aus', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    const sidebar = dom.window.document.getElementById('sidebar');
    const toggle = dom.window.document.getElementById('sidebarToggle');

    sidebar.classList.add('hidden');
    toggle.listeners.click();
    expect(sidebar.classList.contains('hidden')).toBe(false);
    toggle.listeners.click();
    expect(sidebar.classList.contains('hidden')).toBe(true);
  });

  test('applyTheme schaltet auf dunkles Design um', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    dom.window.applyTheme('dark');

    expect(dom.window.document.body.classList.contains('dark')).toBe(true);
    expect(dom.window.document.getElementById('themeToggle').textContent).toContain('☀️');
  });

  test('applyTheme setzt die Hintergrundvariable im Darkmode', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    dom.window.applyTheme('dark');

    expect(dom.window.document.body.style.getPropertyValue('--bg'))
      .toBe('hsl(222 28% 10%)');
  });

  test('showFreeKey erzeugt einen Kopieren-Button', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    dom.window.showFreeKey('TEST');

    const box = dom.window.document.getElementById('freeKey');
    expect(box.children).toHaveLength(2);
    expect(box.children[1].textContent).toBe('📋');
  });

  test('copyKey nutzt clipboard.writeText mit korrektem Text', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    const spy = jest.fn().mockResolvedValue();
    dom.window.navigator.clipboard.writeText = spy;
    await dom.window.copyKey('TESTKEY');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('TESTKEY');
  });

  test('loadStats ruft /stats auf und füllt die Tabelle', async () => {
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    const statsData = { perDay: { '2024-01-01': 1 }, perWeek: { '2024-W01': 1 } };
    dom.window.fetch = jest.fn().mockResolvedValue({ json: async () => statsData });
    await dom.window.loadStats();

    const box = dom.window.document.getElementById('statsBox');
    expect(dom.window.fetch).toHaveBeenCalledWith('/stats');
    expect(box.children.length).toBeGreaterThan(0);
  });

  test('interaktive Funktionen arbeiten zusammen', async () => {
    // HTML und Skript laden
    const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
    const { JSDOM } = require('../test-utils/fake-dom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });

    // ── Theme-Umschaltung ────────────────────────────────────────────────────
    const applySpy = jest.fn();
    dom.window.applyTheme = applySpy;
    const setItemSpy = jest.spyOn(dom.window.localStorage, 'setItem');
    // Klick auslösen
    dom.window.document.getElementById('themeToggle').listeners.click();
    // Nach dem ersten Klick sollte dark aktiviert werden
    expect(applySpy).toHaveBeenCalledWith('dark');
    expect(setItemSpy).toHaveBeenCalledWith('theme', 'dark');

    // ── Fallback beim Kopieren ──────────────────────────────────────────────
    dom.window.navigator.clipboard.writeText = jest.fn().mockRejectedValue(new Error('x'));
    dom.window.document.execCommand = jest.fn();
    // textarea-Elemente brauchen im Test eine select-Methode
    const origCreate = dom.window.document.createElement.bind(dom.window.document);
    dom.window.document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'textarea') el.select = jest.fn();
      return el;
    };
    dom.window.document.body.removeChild = jest.fn();
    await dom.window.copyKey('AA');
    expect(dom.window.document.execCommand).toHaveBeenCalledWith('copy');

    // ── Laden der Telegram-Einstellungen ─────────────────────────────────────
    dom.window.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ thresholds: [5, 1], messageTemplate: 'Msg' })
    });
    await dom.window.loadTelegram();
    expect(dom.window.document.getElementById('thresholdInput').value).toBe('5,1');
    expect(dom.window.document.getElementById('messageTemplate').value).toBe('Msg');

    // ── Sortierung der Listen ───────────────────────────────────────────────
    const unsorted = [{ id: 5, key: 'A' }, { id: 3, key: 'B' }];
    dom.window.fetch = jest.fn().mockResolvedValue({ json: async () => unsorted });
    await dom.window.renderList('listFree', '/dummy');
    const box = dom.window.document.getElementById('listFree');
    expect(box.children[0].innerHTML).toContain('3: B');
    expect(box.children[1].innerHTML).toContain('5: A');
  });


});
