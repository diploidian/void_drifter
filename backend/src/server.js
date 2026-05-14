import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

await migrate(pool);

const app = createApp({ config, pool });
app.listen(config.port, () => {
  console.log(`Void Drifter backend listening on ${config.port}`);
});
