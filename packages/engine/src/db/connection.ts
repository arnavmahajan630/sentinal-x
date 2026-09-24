import mongoose from 'mongoose';

let connecting: Promise<typeof mongoose> | null = null;

/** Mongoose connection singleton. Safe to call repeatedly. */
export async function connectDb(url: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  connecting ??= mongoose.connect(url, { serverSelectionTimeoutMS: 5000 }).catch((err) => {
    connecting = null;
    throw err;
  });
  return connecting;
}

export async function disconnectDb(): Promise<void> {
  connecting = null;
  await mongoose.disconnect();
}

/** true when connected AND the server answers a ping. Never throws. */
export async function pingDb(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
