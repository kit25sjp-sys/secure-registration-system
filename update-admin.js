const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'database', 'registration.db');

async function updateAdminCredentials() {
  try {
    console.log('🔄 Updating admin credentials...\n');

    // Initialize sql.js
    const SQL = await initSqlJs();
    
    // Load database
    if (!fs.existsSync(DB_PATH)) {
      console.error('❌ Database file not found at:', DB_PATH);
      process.exit(1);
    }

    const db = new SQL.Database(fs.readFileSync(DB_PATH));

    // New credentials
    const newEmail = 'secureshieldcyber123@gmail.com';
    const newPassword = '963852!!!Sss';
    const passwordHash = bcrypt.hashSync(newPassword, 12);

    // Update admin user
    db.run(
      'UPDATE users SET email = ?, password_hash = ? WHERE username = ?',
      [newEmail, passwordHash, 'admin']
    );

    // Save database
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    
    console.log('✅ Admin credentials updated successfully!\n');
    console.log('📧 New Email: ' + newEmail);
    console.log('🔐 New Password: ' + newPassword);
    console.log('\n📍 Access admin panel at: http://localhost:3000/admin');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin:', error.message);
    process.exit(1);
  }
}

updateAdminCredentials();
