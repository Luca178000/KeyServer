const fastify = require('fastify');
const fs = require('fs/promises');
const path = require('path');
// Pino wird verwendet, um wahlweise in eine Logdatei zu schreiben
const pino = require('pino');
// Modul zum Versenden von Telegram-Nachrichten
// Die Funktion wird nicht sofort entpackt, damit Tests sie leichter ersetzen
const telegram = require('./telegram');

async function buildServer(options = {}) {
  const {
    logger = false,
    dbFile = path.join(__dirname, 'db.json'),
    logFile,
  } = options;

  // Wird ein Dateipfad angegeben, schreibt der Logger dahin
  const destination = logFile ? pino.destination(logFile) : undefined;
  const app = fastify({ logger: destination ? { stream: destination } : logger });

  // Token und Chat-ID für Telegram aus Umgebungsvariablen auslesen
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  // Zwei Schwellenwerte für Benachrichtigungen
  const THRESHOLDS = [20, 10];
  // Merkt sich, unter welchem Grenzwert zuletzt gewarnt wurde
  // Dieser Wert wird in der Datenbank mitgespeichert, damit bei einem Neustart
  // nicht erneut gewarnt wird, wenn sich die Anzahl freier Keys nicht geändert hat
  let lastWarned = Infinity;

  // Prüft die Zahl freier Keys und verschickt nur einmal pro unterschrittener
  // Schwelle eine Warnung. Steigt die Zahl wieder über 20, wird zurückgesetzt.
  // Diese Funktion kann asynchron sein, da der Warnstatus bei Änderungen
  // sofort in der Datenbank gespeichert wird.
  async function notifyIfLow() {
    const free = keys.filter((k) => !k.inUse && !k.invalid).length;

    // Bei ausreichend vielen Keys wird der Warnzustand aufgehoben
    if (free >= THRESHOLDS[0]) {
      if (lastWarned !== Infinity) {
        lastWarned = Infinity;
        await saveData();
      }
      return;
    }

    if (!telegramToken || !telegramChatId) return;

    for (const limit of THRESHOLDS) {
      if (free < limit && limit < lastWarned) {
        // ***
        // Bevor wir eine Telegram-Nachricht verschicken, prüfen wir, ob wir
        // uns gerade im Testbetrieb befinden. Standardmäßig sollen während der
        // Jest-Tests keine Nachrichten versendet werden, um unnötige Aufrufe
        // und Abhängigkeiten zu vermeiden. Nur wenn explizit die Variable
        // SEND_TELEGRAM_DURING_TESTS auf "true" gesetzt ist, wird der Versand
        // zugelassen. Andernfalls kehren wir einfach zurück und überspringen
        // den Aufruf von sendTelegramMessage.
        // ***
        if (
          process.env.NODE_ENV === 'test' &&
          process.env.SEND_TELEGRAM_DURING_TESTS !== 'true'
        ) {
          return;
        }

        // Fehler beim Senden dürfen den Server nicht stoppen
        telegram
          .sendTelegramMessage(
            telegramToken,
            telegramChatId,

            // Die Nachricht nennt nur noch die verbleibenden freien Keys
            `Warnung: Nur noch ${free} freie Keys. ` +


              'Zum Dashboard: http://localhost:3000/'
          )
          .catch(() => {});
        lastWarned = limit;
        await saveData();
        break;
      }
    }
  }

  app.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  let keys = [];
  let nextId = 1;

  async function loadData() {
    try {
      const data = await fs.readFile(dbFile, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        keys = parsed;
        lastWarned = Infinity;
      } else {
        keys = parsed.keys || [];
        lastWarned =
          typeof parsed.lastWarned === 'number' ? parsed.lastWarned : Infinity;
      }
      const maxId = keys.reduce((max, k) => Math.max(max, k.id), 0);
      nextId = maxId + 1;
      // Stellt sicher, dass neu eingef\u00fchrte Felder auch bei bereits
      // gespeicherten Keys vorhanden sind
      keys.forEach((k) => {
        if (!k.history) k.history = [];
        if (!k.createdAt) k.createdAt = new Date().toISOString();
        if (!Object.prototype.hasOwnProperty.call(k, 'lastUsedAt')) k.lastUsedAt = null;
        if (!Object.prototype.hasOwnProperty.call(k, 'invalid')) k.invalid = false;
      });
    } catch (err) {
      keys = [];
      nextId = 1;
    }
  }

  async function saveData() {
    const data = {
      lastWarned: isFinite(lastWarned) ? lastWarned : null,
      keys,
    };
    await fs.writeFile(dbFile, JSON.stringify(data, null, 2));
  }

  await loadData();
  // Direkt nach dem Laden der bestehenden Daten prüfen wir, ob bereits
  // weniger als THRESHOLD freie Keys vorhanden sind. Ist dies der Fall,
  // wird sofort eine Telegram-Warnung verschickt.
  await notifyIfLow();

  app.get('/keys', async (request) => {
    let result = keys;
    const { inUse, assignedTo } = request.query || {};

    if (typeof inUse !== 'undefined') {
      const bool = String(inUse).toLowerCase() === 'true';
      result = result.filter((k) => k.inUse === bool);
    }

    if (typeof assignedTo !== 'undefined') {
      result = result.filter((k) => k.assignedTo === assignedTo);
    }

    return result;
  });

  app.post('/keys', async (request, reply) => {
    const { key, keys: keyList } = request.body || {};

    // Sowohl ein einzelner Key als auch ein Array von Keys werden akzeptiert
    // In diesem Array sammeln wir alle vom Client gesendeten Einträge
    const incoming = [];
    if (Array.isArray(keyList)) incoming.push(...keyList);
    else if (typeof key === 'string') incoming.push(key);

    if (incoming.length === 0) {
      reply.code(400);
      return { error: 'Key fehlt im Request-Body' };
    }

    // Regex, das auf das Muster XXXXX-XXXXX-XXXXX-XXXXX-XXXXX prüft
    const pattern = /^[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}$/;

    const created = [];
    // Alle übergebenen Keys einzeln validieren und anlegen
    for (const entry of incoming) {
      // Ungültige Keys überspringen
      if (!pattern.test(entry)) continue;
      // Bereits vorhandene Keys nicht erneut anlegen
      if (keys.some((k) => k.key === entry)) continue;

      const now = new Date().toISOString();
      const newKey = {
        id: nextId++,
        key: entry,
        inUse: false,
        assignedTo: null,
        createdAt: now,
        lastUsedAt: null,
        history: [],
        invalid: false,
      };
      keys.push(newKey);
      created.push(newKey);
    }

    // Wurden keine gültigen Keys übergeben, antworten wir mit einem Fehler
    if (created.length === 0) {
      reply.code(400);
      return { error: 'Kein gültiger Key übergeben' };
    }


    await saveData();
    await notifyIfLow();
    reply.code(201);
    return created;
  });

  app.get('/keys/free', async (request, reply) => {
    // Suche nach dem ersten freien und nicht ungültigen Key
    const freeKey = keys.find((k) => !k.inUse && !k.invalid);
    if (!freeKey) {
      reply.code(404);
      return { error: 'Kein verfügbarer Key gefunden' };
    }

    // Abruf in der Historie festhalten
    if (!freeKey.history) freeKey.history = [];
    const logEntry = {
      action: 'free',
      timestamp: new Date().toISOString(),
      assignedTo: null,
    };
    freeKey.history.push(logEntry);
    await saveData();

    // Protokolliert den Abruf eines freien Keys
    app.log.info({ id: freeKey.id }, 'Freier Key ausgegeben');

    // Nur den Key-String zurückgeben
    reply.type('text/plain');
    return freeKey.key;
  });

  // Gibt eine Liste aller aktuell freien Keys zurück
  // Diese Route wird im Dashboard verwendet, um sofort alle verfügbaren
  // Keys anzeigen zu können.
  app.get('/keys/free/list', async () => {
    // Filtert alle Keys, deren inUse-Flag nicht gesetzt ist
    const available = keys.filter((k) => !k.inUse);
    return available;
  });

  // Liefert alle Keys, die momentan in Benutzung sind
  // So lässt sich schnell sehen, welche Keys vergeben wurden.
  app.get('/keys/active/list', async () => {
    // Filtert alle Keys mit gesetztem inUse-Flag
    const active = keys.filter((k) => k.inUse);
    return active;
  });

  // Setzt einen Key anhand seines Textwerts auf "in Benutzung"
  // Der Key selbst wird direkt in der URL angegeben
  app.put('/keys/:key/inuse', async (request, reply) => {
    const keyValue = request.params.key;
    const { assignedTo } = request.body || {};
    const keyEntry = keys.find((k) => k.key === keyValue);

    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }

    keyEntry.inUse = true;
    keyEntry.assignedTo = assignedTo || null;
    keyEntry.lastUsedAt = new Date().toISOString();
    if (!keyEntry.history) keyEntry.history = [];
    keyEntry.history.push({
      action: 'inuse',
      timestamp: keyEntry.lastUsedAt,
      assignedTo: keyEntry.assignedTo,
    });
    await saveData();
    await notifyIfLow();

    // Meldet im Log, dass der Key nun benutzt wird
    // Im Log wird der verwendete Key ausgegeben
    app.log.info({ key: keyValue, assignedTo: keyEntry.assignedTo }, 'Key als benutzt markiert');
    return keyEntry;
  });

  // Setzt einen Key wieder auf "frei" und entfernt die Zuweisung
  // Auch hier wird der Key direkt als Parameter verwendet
  app.put('/keys/:key/release', async (request, reply) => {
    const keyValue = request.params.key;
    const keyEntry = keys.find((k) => k.key === keyValue);

    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }

    // Flag zur Nutzung entfernen und Zuweisung zurücksetzen
    keyEntry.inUse = false;
    keyEntry.assignedTo = null;
    if (!keyEntry.history) keyEntry.history = [];
    const now = new Date().toISOString();
    keyEntry.history.push({ action: 'release', timestamp: now, assignedTo: null });
    await saveData();

    // Protokolliert die Freigabe eines Keys
    // Im Log den Key ausgeben
    app.log.info({ key: keyValue }, 'Key wieder freigegeben');
    return keyEntry;
  });

  // Liefert die Historie eines bestimmten Keys
  app.get('/keys/:key/history', async (request, reply) => {
    const keyValue = request.params.key;
    const keyEntry = keys.find((k) => k.key === keyValue);
    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }
    return keyEntry.history || [];
  });

  // Liefert eine zusammengefasste Historie aller Keys
  // Jeder Eintrag enthaelt den Bezug zum urspruenglichen Key
  // und wird nach Zeitstempel sortiert zurueckgegeben
  app.get('/history', async () => {
    const list = [];
    for (const k of keys) {
      if (!Array.isArray(k.history)) continue;
      for (const h of k.history) {
        list.push({ key: k.key, id: k.id, ...h });
      }
    }
    list.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return list;
  });

  // Markiert einen Key dauerhaft als ungültig
  // Im Dashboard wird dieser Endpunkt über den Button "Key ungültig" aufgerufen
  app.put('/keys/:key/invalidate', async (request, reply) => {
    const keyValue = request.params.key;
    const keyEntry = keys.find((k) => k.key === keyValue);
    if (!keyEntry) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }
    // Flag setzen, damit dieser Key künftig nicht mehr verwendet wird
    keyEntry.invalid = true;
    await saveData();
    await notifyIfLow();
    return keyEntry;
  });

  // Entfernt einen Key anhand seines Textwerts dauerhaft
  app.delete('/keys/:key', async (request, reply) => {
    const keyValue = request.params.key;
    const index = keys.findIndex((k) => k.key === keyValue);
    if (index === -1) {
      reply.code(404);
      return { error: 'Key nicht gefunden' };
    }
    keys.splice(index, 1);
    await saveData();
    await notifyIfLow();

    // Loggt das Löschen eines Keys
    // Löschvorgang im Log festhalten
    app.log.info({ key: keyValue }, 'Key gelöscht');
    return { success: true };
  });

  return app;
}

module.exports = buildServer;
