import { resetDatabase } from '../lib/seed';
import { getSql } from '../lib/db';
resetDatabase().then(async (c) => { console.log('seeded', c); await getSql().end(); }).catch(async (e) => { console.error(e); process.exit(1); });
