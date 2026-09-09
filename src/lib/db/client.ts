export function getDb(env: Env) {
  return {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const stmt = env.DB.prepare(sql).bind(...params);
      const { results } = await stmt.all<T>();
      return results || [];
    },
    async first<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const stmt = env.DB.prepare(sql).bind(...params);
      const result = await stmt.first<T>();
      return result || null;
    },
    async run(sql: string, params: any[] = []): Promise<D1Result> {
      const stmt = env.DB.prepare(sql).bind(...params);
      return await stmt.run();
    },
    get raw() {
      return env.DB;
    }
  };
}
