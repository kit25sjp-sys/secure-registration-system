#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const { initDatabase, getDb } = require('./database/db');

async function createAdminUser() {
  await initDatabase();
  const db = getDb();

  const email = 'admin123@example.com';
  const password = '123456';
  const username = 'admin123';

  try {
    // Check if admin user already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      console.log('✅  Admin user already exists:', email);
      process.exit(0);
    }

    // Hash the password
    const passwordHash = bcrypt.hashSync(password, 12);

    // Insert admin user
    db.prepare(`
      INSERT INTO users (username, email, password_hash, is_verified, is_active, role)
      VALUES (?, ?, ?, 1, 1, 'admin')
    `).run(username, email, passwordHash);

    console.log('✅  Admin user created successfully!');
    console.log('');
    console.log('Email:    ' + email);
    console.log('Password: ' + password);
    console.log('Role:     admin');
    console.log('');
    console.log('You can now login at http://localhost:3000/login');
    process.exit(0);
  } catch (err) {
    console.error('❌  Error creating admin user:', err.message);
    process.exit(1);
  }
}

createAdminUser();
