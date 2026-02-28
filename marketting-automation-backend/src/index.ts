import 'dotenv/config';
import app from './app';
import config from './config';
import prisma from './lib/prisma';

async function main() {
    try {
        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected');

        const server = app.listen(config.port, () => {
            console.log(`\n🚀 WeConnect API running:`);
            console.log(`   URL:  http://localhost:${config.port}`);
            console.log(`   ENV:  ${config.nodeEnv}`);
            console.log(`   API:  http://localhost:${config.port}/api`);
            console.log(`   Health: http://localhost:${config.port}/health\n`);
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            console.log(`\n${signal} received. Shutting down gracefully...`);
            server.close(async () => {
                await prisma.$disconnect();
                console.log('Database disconnected. Goodbye! 👋');
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

main();
