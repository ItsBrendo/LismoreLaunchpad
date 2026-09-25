import Dexie from 'dexie';

export const db = new Dexie('HarveyNormanDB');

db.version(1).stores({
  users: '++id, username, role, createdAt',
  imports: '++id, sourceType, sourceName, importedAt, status',
  storeSnapshots:
    '++id, sourceName, date, storeName, location, region, salesPerson, category, sales, inventory, fulfillmentRate, status, createdAt',
});

export async function ensureBaseData() {
  const userCount = await db.users.count();
  if (userCount > 0) {
    return;
  }

  const seedUsers = [
    {
      username: 'manager',
      passwordHash: 'demo',
      role: 'Manager',
      fullName: 'System Manager',
      createdAt: new Date().toISOString(),
    },
    {
      username: 'sales',
      passwordHash: 'demo',
      role: 'Salesperson',
      fullName: 'Alicia Smith',
      createdAt: new Date().toISOString(),
    },
    {
      username: 'warehouse',
      passwordHash: 'demo',
      role: 'Warehouse',
      fullName: 'Daniel Jones',
      createdAt: new Date().toISOString(),
    },
  ];

  await db.users.bulkAdd(seedUsers);
}
