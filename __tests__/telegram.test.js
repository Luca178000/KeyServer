const fs = require('fs/promises');
const path = require('path');
const os = require('os');

jest.mock('../telegram', () => ({
  sendTelegramMessage: jest.fn()
}));

const { sendTelegramMessage } = require('../telegram');
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
  await fs.writeFile(dbPath, JSON.stringify(keys));
  const app = await buildServer({ logger: false, dbFile: dbPath });
  return { app, dbPath };
}

describe('Telegram Integration', () => {
  beforeEach(() => {
    sendTelegramMessage.mockClear();
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

  test('Server benachrichtigt bei wenig freien Keys', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    const { app } = await createServerWithKeys(19);
    await app.inject({ method: 'PUT', url: '/keys/1/inuse', payload: {} });
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    await app.close();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
});
