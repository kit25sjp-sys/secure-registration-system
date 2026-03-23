#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const { initDatabase, getDb } = require('./database/db');

async function createAdminUser() {
  await initDatabase();
  const db = getDb();

  const email = 'admin@securereg.com';
  const password = '123456';
  const username = 'Admin12';

  try {
    // Check if admin user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      console.log('✅  Admin user already exists:', username);
      console.log('Email:    ' + email);
      console.log('Password: ' + password);
      return;
    }

    // Hash the password
    const passwordHash = bcrypt.hashSync(password, 12);

    // Insert master admin user (already verified, no OTP needed)
    db.prepare(`
      INSERT INTO users (username, email, password_hash, is_verified, is_active, role)
      VALUES (?, ?, ?, 1, 1, 'admin')
    `).run(username, email, passwordHash);

    console.log('✅  Master Admin user created successfully!');
    console.log('');
    console.log('Username: ' + username);
    console.log('Email:    ' + email);
    console.log('Password: ' + password);
    console.log('Role:     Master Admin');
    console.log('OTP:      Required at login (email OTP challenge)');
    console.log('');
    console.log('You can now login at http://localhost:3000/login');
    console.log('Complete OTP verification to finish sign-in.');
    return;
  } catch (err) {
    console.error('❌  Error creating admin user:', err.message);
    process.exitCode = 1;
  }
}

createAdminUser();
