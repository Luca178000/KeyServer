// Verwenden von global.fetch erst zur Laufzeit,
// damit Tests den Aufruf leichter abfangen können

/**
 * Sendet eine Nachricht über die Telegram Bot API.
 * @param {string} token  Bot-Token aus BotFather
 * @param {string|number} chatId  ID des Chats oder Nutzers
 * @param {string} text  Zu sendender Nachrichtentext
 * @returns {Promise<any>} Antwort der Telegram API
 */
async function sendTelegramMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  // Zugriff direkt auf global.fetch, um Mocking in Tests zu ermöglichen
  const res = await global.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.json();
}

module.exports = { sendTelegramMessage };

