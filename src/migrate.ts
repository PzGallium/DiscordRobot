import 'dotenv/config';
import { getDb } from './db/index.js';

getDb();
console.log('Database migrated successfully.');
