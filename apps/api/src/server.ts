import { buildApp } from './app.js';
import { env } from './env.js';
import { migrate } from './migrate.js';

await migrate();
const app = await buildApp({ logger: true });
// Solo local: escucha únicamente en 127.0.0.1.
await app.listen({ host: '127.0.0.1', port: env.port });
