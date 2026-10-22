// Reads settings from the .env file in one place, so the rest of the code
// never touches process.env directly.
import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing setting ${name}. Copy backend/.env.example to backend/.env and fill it in.`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  defaultCompanyCode: process.env.DEFAULT_COMPANY_CODE || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  seedAdminUsername: process.env.SEED_ADMIN_USERNAME || 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || '',
  // ORBYT owner (super admin) login, created by `npm run seed:owner`
  ownerUsername: process.env.OWNER_USERNAME || 'owner',
  ownerName: process.env.OWNER_NAME || 'ORBYT owner',
  ownerPassword: process.env.OWNER_PASSWORD || ''
};
