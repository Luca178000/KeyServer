const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Prüft, welche Commits auf origin/main noch nicht im lokalen Repository sind.
 * Gibt eine Liste mit den Kurzinfos der neuen Commits zurück.
 */
async function getAvailableUpdates() {
  try {
    await execAsync('git fetch');
    const { stdout } = await execAsync('git log HEAD..origin/main --oneline');
    return stdout.trim().split('\n').filter(Boolean);
  } catch (err) {
    // Im Fehlerfall wird eine leere Liste geliefert
    return [];
  }
}

/**
 * Führt ein git pull aus und startet anschließend "npm test".
 * Die Ausgaben beider Befehle werden zurückgegeben.
 */
async function applyUpdates() {
  const result = {};
  try {
    const { stdout } = await execAsync('git pull');
    result.pull = stdout.trim();
  } catch (err) {
    result.pull = (err.stderr || err.message || '').trim();
  }
  try {
    const { stdout } = await execAsync('npm test --silent');
    result.test = stdout.trim();
  } catch (err) {
    result.test = (err.stdout || err.message || '').trim();
  }
  return result;
}

module.exports = { getAvailableUpdates, applyUpdates };
