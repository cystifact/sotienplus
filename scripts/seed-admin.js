/**
 * Seed script: Create initial admin user for SoTienPlus
 *
 * Usage: node scripts/seed-admin.js [email]
 *
 * Examples:
 *   node scripts/seed-admin.js admin@gmail.com
 *   node scripts/seed-admin.js                    (uses default email)
 *
 * Requires: sotienplus-service-account-key.json in project root
 */

const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'sotienplus-service-account-key.json');

// Default admin credentials
const ADMIN_EMAIL = process.argv[2] || 'thienanh1991@gmail.com';
const ADMIN_PASSWORD = 'thientong1@';
const ADMIN_DISPLAY_NAME = 'Thiện Anh';

async function seedAdmin() {
  try {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    const auth = admin.auth();
    const db = admin.firestore();

    const isRealEmail = !ADMIN_EMAIL.endsWith('@sotienplus.local');
    const username = isRealEmail ? ADMIN_EMAIL.split('@')[0] : ADMIN_EMAIL.split('@')[0];

    console.log(`Creating admin user: ${ADMIN_EMAIL}`);
    console.log(`Login with: ${isRealEmail ? 'email (' + ADMIN_EMAIL + ')' : 'username (' + username + ')'}`);

    // Check if user already exists
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log(`User already exists: ${userRecord.uid}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        userRecord = await auth.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          displayName: ADMIN_DISPLAY_NAME,
        });
        console.log(`Created Firebase Auth user: ${userRecord.uid}`);
      } else {
        throw error;
      }
    }

    // Create/update Firestore user doc
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('users').doc(userRecord.uid).set({
      email: ADMIN_EMAIL,
      username,
      displayName: ADMIN_DISPLAY_NAME,
      role: 'admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    console.log(`Firestore user doc created/updated for: ${userRecord.uid}`);
    console.log('');
    console.log('=== Admin user ready ===');
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    if (isRealEmail) {
      console.log(`Login: use email (${ADMIN_EMAIL})`);
    } else {
      console.log(`Login: use username (${username})`);
    }
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
