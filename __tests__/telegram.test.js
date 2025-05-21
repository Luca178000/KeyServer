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
    // Wir überwachen sendTelegramMessage, um den Aufruf zu zählen
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app } = await createServerWithKeys(19);
    await app.inject({ method: 'PUT', url: '/keys/1/inuse', payload: {} });
    // Meldung erfolgt nur beim ersten Unterschreiten der Schwelle
    expect(spy).toHaveBeenCalledTimes(1);
    await app.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  test('Server meldet erneut bei weniger als zehn Keys', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    const spy = jest
      .spyOn(telegram, 'sendTelegramMessage')
      .mockResolvedValue({ ok: true });

    const { app } = await createServerWithKeys(11);
    await app.inject({ method: 'PUT', url: '/keys/1/inuse', payload: {} });
    await app.inject({ method: 'PUT', url: '/keys/2/inuse', payload: {} });
    // Erst beim Fallen unter zehn folgt eine zweite Warnung
    expect(spy).toHaveBeenCalledTimes(2);
    await app.close();
    spy.mockRestore();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  test('Warnung bereits beim Start bei zu wenigen Keys', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
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
  });

  test('Warnstatus bleibt nach Neustart erhalten', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
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
  });
});
