import 'server-only';
import * as admin from 'firebase-admin';

const ADMIN_APP_NAME = 'server';

const initializeFirebaseAdmin = () => {
  if (admin.apps.find((a) => a && a.name === ADMIN_APP_NAME)) {
    return;
  }

  try {
    // Try Application Default Credentials first (works in Cloud Run, GCE, local gcloud auth)
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      }, ADMIN_APP_NAME);
      return;
    } catch (_adcError) {
      // ADC not available, fall back to env-based service account
    }

    // Fall back to service account from environment variable
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
                 process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!saRaw) {
      throw new Error(
        'No Firebase credentials found. Set GOOGLE_APPLICATION_CREDENTIALS, ' +
        'FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVICE_ACCOUNT_BASE64.'
      );
    }

    const serviceAccount = saRaw.trim().startsWith('{')
      ? JSON.parse(saRaw)
      : JSON.parse(Buffer.from(saRaw, 'base64').toString('utf8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    }, ADMIN_APP_NAME);
  } catch (error: any) {
    console.error('[AdminInit] Firebase Admin initialization error:', {
      message: error.message,
      code: error.code,
    });
    throw new Error('Failed to initialize Firebase Admin SDK');
  }
};

initializeFirebaseAdmin();

export const getAdminAuth = () => {
  if (!admin.apps.find((a) => a && a.name === ADMIN_APP_NAME)) {
    initializeFirebaseAdmin();
  }
  return admin.app(ADMIN_APP_NAME).auth();
};

export const getAdminDb = () => {
  if (!admin.apps.find((a) => a && a.name === ADMIN_APP_NAME)) {
    initializeFirebaseAdmin();
  }
  return admin.app(ADMIN_APP_NAME).firestore();
};
