const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const telegram = require('../telegram');
const { sendTelegramMessage } = telegram;
const buildServer = require('../server');

async function createServerWithKeys(count) {
  const dbPath = path.join(os.tmpdir(), `db-${Date.now()}-${Math.random()}.json`);
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({
      id: i + 1,
      key: `AAAAA-BBBBB-CCCCC-DDDDD-${String(i).padStart(5, '0')}`,
      inUse: false,
      assignedTo: null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      history: [],
      invalid: false
    });
  }
  await fs.writeFile(dbPath, JSON.stringify({ lastWarned: null, keys }));
  const app = await buildServer({ logger: false, dbFile: dbPath });
  return { app, dbPath };
}

describe('Telegram Integration', () => {
  beforeEach(() => {
    // Setzt zuvor verwendete Spies und Mocks zurück
    jest.restoreAllMocks();
  });

  test('sendTelegramMessage ruft Telegram API auf', async () => {
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    await sendTelegramMessage('TOKEN', '1', 'Hallo');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botTOKEN/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: '1', text: 'Hallo' })
      })
    );
  });

  test('Server benachrichtigt nur einmal unter zwanzig Keys', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    process.env.SEND_TELEGRAM_DURING_TESTS = 'true';
    // Wir überwachen sendTelegramMessage, um den Aufruf zu zählen
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app } = await createServerWithKeys(19);
    await app.inject({ method: 'PUT', url: '/keys/AAAAA-BBBBB-CCCCC-DDDDD-00000/inuse', payload: {} });
    // Meldung erfolgt nur beim ersten Unterschreiten der Schwelle
    expect(spy).toHaveBeenCalledTimes(1);
    await app.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SEND_TELEGRAM_DURING_TESTS;
  });

  test('Server meldet erneut bei weniger als zehn Keys', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    process.env.SEND_TELEGRAM_DURING_TESTS = 'true';
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app } = await createServerWithKeys(11);
    await app.inject({ method: 'PUT', url: '/keys/AAAAA-BBBBB-CCCCC-DDDDD-00000/inuse', payload: {} });
    await app.inject({ method: 'PUT', url: '/keys/AAAAA-BBBBB-CCCCC-DDDDD-00001/inuse', payload: {} });
    // Erst beim Fallen unter zehn folgt eine zweite Warnung
    expect(spy).toHaveBeenCalledTimes(2);
    await app.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SEND_TELEGRAM_DURING_TESTS;
  });

  test('Warnung bereits beim Start bei zu wenigen Keys', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    process.env.SEND_TELEGRAM_DURING_TESTS = 'true';
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app } = await createServerWithKeys(18);
    // Kurze Pause, damit der asynchrone Aufruf verarbeitet wird
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalledTimes(1);
    await app.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SEND_TELEGRAM_DURING_TESTS;
  });

  test('Warnstatus bleibt nach Neustart erhalten', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    process.env.SEND_TELEGRAM_DURING_TESTS = 'true';
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app, dbPath } = await createServerWithKeys(18);
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalledTimes(1);
    await app.close();

    const app2 = await buildServer({ logger: false, dbFile: dbPath });
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalledTimes(1);
    await app2.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SEND_TELEGRAM_DURING_TESTS;
  });


  test('Telegram-Nachricht enthält nur die Zahl freier Keys', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    process.env.SEND_TELEGRAM_DURING_TESTS = 'true';
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app } = await createServerWithKeys(18);
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalledWith(
      'T',
      'C',
      'Warnung: Nur noch 18 freie Keys. Zum Dashboard: http://localhost:3000/'
    );
    await app.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SEND_TELEGRAM_DURING_TESTS;
  });

  test('verschickt im Testmodus keine Nachricht ohne Freigabe', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app } = await createServerWithKeys(19);
    await app.inject({ method: 'PUT', url: '/keys/AAAAA-BBBBB-CCCCC-DDDDD-00000/inuse', payload: {} });
    expect(spy).not.toHaveBeenCalled();
    await app.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  test('GET /telegram/settings liefert Standardwerte', async () => {
    const { app } = await createServerWithKeys(0);
    const res = await app.inject('/telegram/settings');
    expect(res.statusCode).toBe(200);
    const cfg = JSON.parse(res.payload);
    expect(cfg.thresholds).toEqual([20, 10]);
    expect(typeof cfg.messageTemplate).toBe('string');
    await app.close();
  });

  test('PUT /telegram/settings speichert neue Konfiguration', async () => {
    const { app, dbPath } = await createServerWithKeys(0);
    const payload = { thresholds: [15, 5], messageTemplate: 'Noch {free} frei' };
    const res = await app.inject({
      method: 'PUT',
      url: '/telegram/settings',
      payload,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const cfg = JSON.parse(res.payload);
    expect(cfg.thresholds).toEqual([15, 5]);
    expect(cfg.messageTemplate).toBe('Noch {free} frei');
    const stored = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    expect(stored.telegramConfig.thresholds).toEqual([15, 5]);
    expect(stored.telegramConfig.messageTemplate).toBe('Noch {free} frei');
    await app.close();
  });

});
