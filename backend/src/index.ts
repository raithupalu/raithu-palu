import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const server = http.createServer(app);

  server.listen(env.PORT, env.HOST, () => {
    console.info(
      `[Server] Raithu Palu backend (${env.NODE_ENV}) listening on http://${env.HOST}:${env.PORT}`
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void bootstrap();
