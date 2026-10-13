// DuckDB-Wasm, initialised once. AsyncDuckDB runs the database in its own web
// worker, so queries never block the render loop. SQL comes from the agent;
// this module only binds its params through prepared statements.
import * as duckdb from '@duckdb/duckdb-wasm';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { arrowToColumns } from './arrow.ts';
import type { Columns } from './arrow.ts';

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

export type Param = string | number | boolean;

/** Run a query; returns plain typed-array columns. */
export type RunQuery = (sql: string, params?: Param[]) => Promise<Columns>;

export class Db {
  private readonly db: duckdb.AsyncDuckDB;
  private readonly conn: duckdb.AsyncDuckDBConnection;

  private constructor(db: duckdb.AsyncDuckDB, conn: duckdb.AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  static async open(): Promise<Db> {
    const bundle = await duckdb.selectBundle(BUNDLES);
    if (!bundle.mainWorker) throw new Error('no DuckDB worker bundle');
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(bundle.mainWorker));
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return new Db(db, await db.connect());
  }

  /** Loads web/public/data/<dataset>.parquet into an in-memory table named after it. */
  async addDataset(ds: string): Promise<void> {
    if (!/^[a-z_][a-z0-9_]*$/.test(ds)) throw new Error(`bad dataset name: ${ds}`);
    const url = new URL(`data/${ds}.parquet`, document.baseURI).href;
    await this.db.registerFileURL(`${ds}.parquet`, url, duckdb.DuckDBDataProtocol.HTTP, false);
    await this.conn.query(`CREATE TABLE ${ds} AS SELECT * FROM '${ds}.parquet'`);
  }

  readonly run: RunQuery = async (sql, params = []) => {
    const stmt = await this.conn.prepare(sql);
    try {
      return arrowToColumns(await stmt.query(...params));
    } finally {
      await stmt.close();
    }
  };

  async close(): Promise<void> {
    await this.conn.close();
    await this.db.terminate();
  }
}
