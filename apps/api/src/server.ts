import { buildApp } from './app.js';
import { env } from './env.js';
import { migrate } from './migrate.js';

await migrate();
const app = await buildApp({ logger: true });
await app.listen({ host: env.host, port: env.port });
