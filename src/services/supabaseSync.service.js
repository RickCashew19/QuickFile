const { getSupabase } = require('../config/supabase');
const { getDatabase } = require('../config/db');

class SupabaseSyncService {
  /**
   * Push a single record to Supabase table (asynchronous, non-blocking)
   * @param {string} table
   * @param {object} record
   */
  static async pushRecord(table, record) {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const cleanRecord = Object.assign({}, record);
      const { data, error } = await supabase
        .from(table)
        .upsert(cleanRecord, { onConflict: cleanRecord.id ? 'id' : undefined });

      if (error) {
        // Silently log schema cache errors if tables haven't been created yet in Supabase SQL editor
        if (error.code !== 'PGRST205') {
          console.warn(`[Supabase Sync] Warning on table ${table}:`, error.message);
        }
      }
      return data;
    } catch (err) {
      return null;
    }
  }

  /**
   * Delete a record from Supabase table
   * @param {string} table
   * @param {string} column
   * @param {*} value
   */
  static async deleteRecord(table, column, value) {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq(column, value);

      return data;
    } catch (err) {
      return null;
    }
  }

  /**
   * Export all local database records to Supabase Cloud tables
   */
  static async syncAllToSupabase() {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        success: false,
        message: 'Supabase client is not configured.'
      };
    }

    const db = getDatabase();
    const tablesToSync = [
      { name: 'app_settings', conflict: 'key' },
      { name: 'document_types', conflict: 'id' },
      { name: 'users', conflict: 'id' },
      { name: 'citizen_profiles', conflict: 'user_id' },
      { name: 'staff_details', conflict: 'user_id' },
      { name: 'staff_permissions', conflict: 'user_id' },
      { name: 'document_requests', conflict: 'id' },
      { name: 'issued_documents', conflict: 'id' },
      { name: 'notifications', conflict: 'id' }
    ];

    const results = {};
    let totalSynced = 0;
    let errors = [];

    for (const t of tablesToSync) {
      try {
        const rows = db.prepare(`SELECT * FROM ${t.name}`).all();
        if (rows.length === 0) {
          results[t.name] = { synced: 0, status: 'empty' };
          continue;
        }

        const { data, error } = await supabase
          .from(t.name)
          .upsert(rows, { onConflict: t.conflict });

        if (error) {
          results[t.name] = { synced: 0, error: error.message };
          errors.push(`${t.name}: ${error.message}`);
        } else {
          results[t.name] = { synced: rows.length, status: 'success' };
          totalSynced += rows.length;
        }
      } catch (err) {
        results[t.name] = { synced: 0, error: err.message };
        errors.push(`${t.name}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      totalSynced,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length === 0
        ? `Successfully synced ${totalSynced} record(s) across all tables to Supabase!`
        : `Synced with warnings. Note: Ensure src/database/supabase_schema.sql has been executed in your Supabase SQL editor.`
    };
  }
}

module.exports = SupabaseSyncService;

