import 'dotenv/config';
import app from './src/app.js';
import { connectDatabase } from './src/config/database.js';
import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
const port = Number(process.env.PORT) || 3000;

try {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`Task Manager API listening on port ${port}`);
  });
} catch (error) {
  console.error(`Unable to start Task Manager API: ${error.message}`);
  process.exit(1);
}