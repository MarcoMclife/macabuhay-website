'use strict';

// Members live in one Azure Table. RowKey = lowercase email, because the
// Static Web Apps userId changes if a user is removed and signs in again.

const PARTITION = 'member';
const TABLE = process.env.MEMBERS_TABLE || 'members';

function toMember(entity) {
  return {
    email: entity.rowKey,
    name: entity.name || '',
    role: entity.role || 'pending',
    provider: entity.provider || '',
    createdAt: entity.createdAt || null,
    lastLoginAt: entity.lastLoginAt || null,
    preRegistered: Boolean(entity.preRegistered),
  };
}

function fromMember(m) {
  const entity = { partitionKey: PARTITION, rowKey: m.email, role: m.role };
  for (const key of ['name', 'provider', 'createdAt', 'lastLoginAt']) {
    if (m[key] !== undefined && m[key] !== null) entity[key] = m[key];
  }
  if (m.preRegistered !== undefined) entity.preRegistered = Boolean(m.preRegistered);
  return entity;
}

/** Azure Table Storage implementation. */
function tableStore(connectionString = process.env.STORAGE_CONNECTION_STRING) {
  const { TableClient } = require('@azure/data-tables');
  if (!connectionString) throw new Error('STORAGE_CONNECTION_STRING is not set');
  const client = TableClient.fromConnectionString(connectionString, TABLE);
  let ensured = false;
  const ready = async () => {
    if (!ensured) {
      await client.createTable().catch((e) => { if (e.statusCode !== 409) throw e; });
      ensured = true;
    }
  };
  return {
    async get(email) {
      await ready();
      try {
        return toMember(await client.getEntity(PARTITION, email));
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    },
    async upsert(member) {
      await ready();
      await client.upsertEntity(fromMember(member), 'Merge');
      return this.get(member.email);
    },
    async list() {
      await ready();
      const out = [];
      const iter = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${PARTITION}'` } });
      for await (const e of iter) out.push(toMember(e));
      return out;
    },
  };
}

/** In-memory implementation for tests and local runs without Azurite. */
function memoryStore(seed = []) {
  const rows = new Map(seed.map((m) => [m.email, { ...m }]));
  return {
    async get(email) { return rows.has(email) ? { ...rows.get(email) } : null; },
    async upsert(m) {
      const merged = { ...(rows.get(m.email) || {}), ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined)) };
      rows.set(m.email, merged);
      return { ...merged };
    },
    async list() { return [...rows.values()].map((m) => ({ ...m })); },
  };
}

let shared;
function defaultStore() {
  // MEMBERS_STORE=memory is for the local dev server only (tools/dev-server.mjs)
  if (!shared) shared = process.env.MEMBERS_STORE === 'memory' ? memoryStore() : tableStore();
  return shared;
}

module.exports = { tableStore, memoryStore, defaultStore };
