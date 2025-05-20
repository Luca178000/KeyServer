const buildServer = require('./server');

// Startet den Fastify-Server, wartet auf Verbindungen und
// beendet den Prozess bei unerwarteten Fehlern.
const start = async () => {
  try {
    const app = await buildServer({ logger: true });
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server läuft auf Port 3000');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
