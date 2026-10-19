/** SQL only. */
import type { SQLExecutor } from '@core/database';

export const systemRepository = {
  async ping(db: SQLExecutor): Promise<boolean> {
    const rows = await db.query<{ ok: number }>('SELECT 1 AS ok');
    return rows.length === 1;
  },
};
