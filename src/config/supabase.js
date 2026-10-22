const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = config.supabase?.url;
  const key = config.supabase?.key;

  if (!url || !key) {
    return null;
  }

  try {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    return supabaseClient;
  } catch (err) {
    console.error('[Supabase Client Error]', err.message);
    return null;
  }
}

async function testConnection() {
  const client = getSupabase();
  if (!client) {
    return {
      connected: false,
      message: 'Supabase URL or Key is missing in environment variables.'
    };
  }

  try {
    const url = config.supabase.url;
    const key = config.supabase.key;

    // Direct REST API check against PostgREST schema definitions
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (!res.ok) {
      return {
        connected: false,
        status: res.status,
        message: `Supabase responded with status ${res.status}: ${res.statusText}`
      };
    }

    const data = await res.json();
    const tables = Object.keys(data.definitions || {});

    return {
      connected: true,
      url,
      tables,
      tablesCount: tables.length,
      hasSchemaReady: tables.includes('users') && tables.includes('document_requests'),
      message: tables.length > 0 
        ? `Successfully connected to Supabase! Found ${tables.length} table(s).`
        : 'Successfully connected to Supabase! (Database tables not yet created in Supabase SQL editor).'
    };
  } catch (err) {
    return {
      connected: false,
      message: `Failed to connect to Supabase: ${err.message}`
    };
  }
}

module.exports = {
  getSupabase,
  testConnection
};

