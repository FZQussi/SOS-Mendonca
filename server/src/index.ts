import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { deviceRoutes } from './routes/device.js';
import { caregiverRoutes } from './routes/caregiver.js';
import { attachWebSocket } from './ws.js';
import { startWatchdog } from './watchdog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Constrói o Express sem o pôr a escutar — usado pelo arranque real e pelos testes. */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // O healthcheck do Compose bate aqui. Toca na base de dados de propósito: um
  // processo vivo com o ficheiro SQLite inacessível está avariado, não saudável.
  app.get('/api/v1/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'base de dados indisponível' });
    }
  });

  app.use('/api/v1/device', deviceRoutes);
  app.use('/api/v1', caregiverRoutes);

  // O painel compilado (dashboard/npm run build) vive aqui. Serve-se do mesmo
  // processo e da mesma origem — sem CORS, sem segundo túnel (Context.md §2).
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Rede: o servidor fica exposto à internet via Cloudflare Tunnel. Sem isto,
  // uma exceção não apanhada devolve a página de erro por omissão do Express,
  // que em desenvolvimento inclui stack trace.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'erro interno' });
  };
  app.use(onError);

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, () => console.log(`SOS Mendonça a escutar em :${port}`));
  attachWebSocket(server);
  startWatchdog();
}
