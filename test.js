import 'dotenv/config';
import pkg from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { PrismaClient } = pkg;

// DATABASE CONFIGURATION
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Test Database Connection
async function testConnection() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ PostgreSQL connection successful!');

        // Also test Prisma Client can find the Categories table
        const count = await prisma.categories.count();
        console.log(`✅ Found ${count} existing categories in the database.`);

    } catch (error) {
        console.error('❌ Database connection FAILED:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

testConnection();

