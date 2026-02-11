import 'server-only';
import * as admin from 'firebase-admin';

const ADMIN_APP_NAME = 'server';

const initializeFirebaseAdmin = () => {
  if (admin.apps.find((a) => a && a.name === ADMIN_APP_NAME)) {
    return;
  }

  try {
    if (process.env.NODE_ENV === 'production') {
      try {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        }, ADMIN_APP_NAME);
      } catch (adcError: any) {
        const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
                     process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        if (!saRaw) {
          throw adcError;
        }

        const serviceAccount = saRaw.trim().startsWith('{')
          ? JSON.parse(saRaw)
          : JSON.parse(Buffer.from(saRaw, 'base64').toString('utf8'));

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        }, ADMIN_APP_NAME);
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const serviceAccount = require('../../firebase-service-account.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      }, ADMIN_APP_NAME);
    }
  } catch (error: any) {
    console.error('[AdminInit] Firebase Admin initialization error:', {
      message: error.message,
      code: error.code,
    });
    throw new Error('Failed to initialize Firebase Admin SDK: ' + error.message);
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
