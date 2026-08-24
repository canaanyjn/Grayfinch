import { DatabaseSync, StatementSync } from "node:sqlite";

type SqlValue = string | number | bigint | Uint8Array | null;

type D1Result<T> = {
  results: T[];
  success: true;
};

/**
 * A deliberately small D1-shaped adapter backed by Node's built-in SQLite.
 * Keeping this surface compatible lets the Worker and the domestic container
 * execute exactly the same application and rollout code.
 */
export class SqliteD1Database {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA journal_mode = WAL");
  }

  prepare(query: string) {
    return new SqlitePreparedStatement(this.database.prepare(query), query);
  }

  batch<T>(statements: SqlitePreparedStatement[]) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute<T>());
      this.database.exec("COMMIT");
      return Promise.resolve(results);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  exec(query: string) {
    this.database.exec(query);
  }

  close() {
    this.database.close();
  }
}

class SqlitePreparedStatement {
  private values: SqlValue[] = [];
  private readonly statement: StatementSync;
  private readonly query: string;

  constructor(statement: StatementSync, query: string) {
    this.statement = statement;
    this.query = query;
  }

  bind(...values: SqlValue[]) {
    this.values = values;
    return this;
  }

  first<T>() {
    const row = this.statement.get(...this.values) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  all<T>() {
    const results = this.statement.all(...this.values) as T[];
    return Promise.resolve({ results, success: true } satisfies D1Result<T>);
  }

  execute<T>(): D1Result<T> {
    if (returnsRows(this.query)) {
      return {
        results: this.statement.all(...this.values) as T[],
        success: true,
      };
    }
    this.statement.run(...this.values);
    return { results: [], success: true };
  }
}

function returnsRows(query: string) {
  return (
    /^\s*(?:SELECT|WITH|EXPLAIN)\b/i.test(query) ||
    /\bRETURNING\b/i.test(query)
  );
}
