import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { env } from './config.js';
const { Pool } = pg;
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 12, idleTimeoutMillis: 30000 });
export async function q<T=any>(text:string, values:any[]=[]):Promise<pg.QueryResult<T>> { return pool.query(text, values); }
export async function tx<T>(fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{ const c=await pool.connect(); try{ await c.query('begin'); const out=await fn(c); await c.query('commit'); return out; } catch(e){await c.query('rollback'); throw e;} finally{c.release();}}
export async function initDb(){ const schema=await fs.readFile(path.resolve('./db/schema.sql'),'utf8'); await pool.query(schema); }
