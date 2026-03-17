/**
 * Seed script — creates test accounts in the database.
 *
 * Usage:  node src/seeds/seed.js
 *
 * Accounts created:
 *   admin@botifytrade.com      / admin123       (admin)
 *   analyst1@botifytrade.com   / analyst123     (analyst)
 *   analyst2@botifytrade.com   / analyst123     (analyst)
 *   trader1@botifytrade.com    / trader123      (user)
 *   trader2@botifytrade.com    / trader123      (user)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectDB = require('../config/db');
const { User, Analyst, Subscription } = require('../models');
const { encrypt } = require('../lib/crypto/encryption');

const SALT_ROUNDS = 12;

const accounts = [
  {
    email: 'superadmin@botifytrade.com',
    password: 'superadmin123',
    role: 'superadmin',
  },
  {
    email: 'admin@botifytrade.com',
    password: 'admin123',
    role: 'admin',
  },
  {
    email: 'analyst1@botifytrade.com',
    password: 'analyst123',
    role: 'analyst',
    bio: 'Equity swing trader — 8 years experience in US markets.',
    winRate: 68.5,
  },
  {
    email: 'analyst2@botifytrade.com',
    password: 'analyst123',
    role: 'analyst',
    bio: 'Options & momentum trader focused on tech sector.',
    winRate: 72.1,
  },
  {
    email: 'trader1@botifytrade.com',
    password: 'trader123',
    role: 'user',
  },
  {
    email: 'trader2@botifytrade.com',
    password: 'trader123',
    role: 'user',
  },
];

async function seed() {
  await connectDB();

  for (const account of accounts) {
    // Skip if already exists
    const existing = await User.findOne({ email: account.email });
    if (existing) {
      console.log(`  ✓ ${account.email} already exists — skipped`);
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, SALT_ROUNDS);

    const userFields = {
      email: account.email,
      passwordHash,
      role: account.role,
      isActive: true,
    };

    // Give traders mock IBKR credentials so copy trades execute immediately
    if (account.role === 'user' && process.env.ENCRYPTION_KEY) {
      userFields.ibkrApiKeyEncrypted = encrypt('mock-api-key', process.env.ENCRYPTION_KEY);
      userFields.ibkrAccountId = 'mock-account-id';
    }

    const user = await User.create(userFields);

    // Create Analyst profile for analyst accounts
    if (account.role === 'analyst') {
      await Analyst.create({
        userId: user._id,
        bio: account.bio || '',
        isActive: true,
        winRate: account.winRate || 0,
      });
    }

    console.log(`  ✓ Created ${account.role.padEnd(7)} → ${account.email}`);
  }

  // Ensure all traders have mock IBKR credentials (patch existing ones too)
  if (process.env.ENCRYPTION_KEY) {
    const tradersToFix = await User.find({ role: 'user', ibkrAccountId: null });
    for (const t of tradersToFix) {
      await User.findByIdAndUpdate(t._id, {
        ibkrApiKeyEncrypted: encrypt('mock-api-key', process.env.ENCRYPTION_KEY),
        ibkrAccountId: 'mock-account-id',
      });
      console.log(`  ✓ Added mock IBKR credentials → ${t.email}`);
    }
  }

  // Auto-subscribe traders to all analysts
  const traders = await User.find({ role: 'user' });
  const analysts = await Analyst.find({ isActive: true });

  for (const trader of traders) {
    for (const analyst of analysts) {
      const exists = await Subscription.findOne({ userId: trader._id, analystId: analyst._id });
      if (!exists) {
        await Subscription.create({ userId: trader._id, analystId: analyst._id, isActive: true });
        console.log(`  ✓ Subscribed ${trader.email} → analyst ${analyst._id}`);
      }
    }
  }

  console.log('\nSeed complete.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
