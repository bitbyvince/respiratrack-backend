import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const { MONGODB_URI } = process.env;

await mongoose.connect(MONGODB_URI);

const hash = await bcrypt.hash('admin123', 10);

await mongoose.connection.collection('users').updateOne(
  { user_id: 'USR-0001' },
  { $set: { password_hash: hash } }
);

console.log('✅ Password updated for USR-0001');
await mongoose.connection.close();