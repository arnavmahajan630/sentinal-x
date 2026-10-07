// Seeds the sandbox's own Mongo with known users (A, B, admin) and two orders (one per
// non-admin user), at the exact Mongo ids already committed in seed-users.json — so the
// engine (running outside the sandbox container) and this script agree on ids without any
// runtime write-back. Run once per sandbox boot (docker-compose's `sandbox-seed` one-shot
// service); idempotent — clears before inserting.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as mongoose from 'mongoose';

const SEED_PATH = path.resolve(__dirname, 'seed-users.json');

interface SeedUser {
  id: string;
  username: string;
  password: string;
  role: string;
  mongoId: string;
}
interface SeedFile {
  users: SeedUser[];
  orders: Record<string, string>;
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is required');

  const raw = await fs.readFile(SEED_PATH, 'utf8');
  const seed: SeedFile = JSON.parse(raw);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db!;
  const users = db.collection('users');
  const orders = db.collection('orders');

  await users.deleteMany({});
  await orders.deleteMany({});

  for (const u of seed.users) {
    await users.insertOne({
      _id: new mongoose.Types.ObjectId(u.mongoId),
      username: u.username,
      password: u.password,
      email: `${u.username}@example.test`,
      role: u.role,
    });
  }

  const byId = new Map(seed.users.map((u) => [u.id, u]));
  for (const [ownerKey, orderId] of Object.entries(seed.orders)) {
    const owner = byId.get(ownerKey);
    if (!owner) continue;
    await orders.insertOne({
      _id: new mongoose.Types.ObjectId(orderId),
      user: new mongoose.Types.ObjectId(owner.mongoId),
      items: [{ sku: 'SKU-1', qty: 1 }],
      total: 42,
      paymentDetails: { cardNumber: '4111111111111111', cvv: '123' },
      customerId: `cust-${ownerKey.toLowerCase()}`,
    });
  }

  console.log(`seeded ${seed.users.length} users, orders: ${JSON.stringify(seed.orders)}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
