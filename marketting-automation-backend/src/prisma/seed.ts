import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function seed() {
    console.log('🌱 Seeding database...');

    // Clear existing data
    await prisma.analytics.deleteMany();
    await prisma.post.deleteMany();
    await prisma.connection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();

    // Create demo user
    const hashedPassword = await bcrypt.hash('password123', 12);
    const user = await prisma.user.create({
        data: {
            email: 'demo@weconnect.com',
            password: hashedPassword,
            firstName: 'Demo',
            lastName: 'User',
        },
    });

    console.log(`✅ Created user: ${user.email}`);

    // Create sample connections
    await prisma.connection.createMany({
        data: [
            {
                userId: user.id,
                platform: 'instagram',
                status: 'connected',
                accountName: '@weconnect_official',
                accountId: 'IG-123456789',
                connectedAt: new Date(),
                lastSync: new Date(),
                expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            },
            {
                userId: user.id,
                platform: 'linkedin',
                status: 'error',
                accountName: 'WeConnect Company',
                accountId: 'LI-987654321',
                connectedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                lastSync: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                errorMessage: 'Access token expired. Please reconnect your account.',
            },
        ],
    });

    console.log('✅ Created sample connections');

    // Create sample posts
    const posts = await Promise.all([
        prisma.post.create({
            data: {
                userId: user.id,
                title: 'Product Launch Announcement',
                content: '🚀 Exciting news! We\'re launching our new AI-powered marketing platform. Stay tuned for the big reveal!\n\n#ProductLaunch #AIMarketing #WeConnect',
                platforms: JSON.stringify(['instagram', 'linkedin']),
                status: 'published',
                publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                contentType: 'text',
                tone: 'professional',
                topic: 'product launch',
                metadata: JSON.stringify({ characterCount: 200, wordCount: 28, hashtags: ['#ProductLaunch', '#AIMarketing', '#WeConnect'], mentions: [] }),
            },
        }),
        prisma.post.create({
            data: {
                userId: user.id,
                title: 'Tips for Social Media Growth',
                content: '📈 5 proven strategies to grow your social media presence in 2026:\n\n1. Consistency is key\n2. Engage with your audience\n3. Use trending hashtags\n4. Post at optimal times\n5. Leverage AI tools like WeConnect\n\n#SocialMediaTips #MarketingStrategy',
                platforms: JSON.stringify(['instagram', 'linkedin', 'facebook']),
                status: 'scheduled',
                scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
                contentType: 'text',
                tone: 'casual',
                topic: 'social media growth',
                metadata: JSON.stringify({ characterCount: 350, wordCount: 52, hashtags: ['#SocialMediaTips', '#MarketingStrategy'], mentions: [] }),
            },
        }),
        prisma.post.create({
            data: {
                userId: user.id,
                title: 'Customer Success Story',
                content: '💡 How one of our customers achieved 300% engagement growth in just 30 days using WeConnect. Read the full case study!\n\n#CustomerSuccess #CaseStudy',
                platforms: JSON.stringify(['linkedin']),
                status: 'review',
                contentType: 'article',
                tone: 'professional',
                topic: 'customer success',
                metadata: JSON.stringify({ characterCount: 180, wordCount: 25, hashtags: ['#CustomerSuccess', '#CaseStudy'], mentions: [] }),
            },
        }),
    ]);

    console.log(`✅ Created ${posts.length} sample posts`);

    // Create sample analytics for the published post
    await prisma.analytics.createMany({
        data: [
            {
                postId: posts[0].id,
                platform: 'instagram',
                views: 1240,
                likes: 89,
                shares: 23,
                comments: 14,
                impressions: 3450,
                clickThroughRate: 2.98,
            },
            {
                postId: posts[0].id,
                platform: 'linkedin',
                views: 870,
                likes: 45,
                shares: 18,
                comments: 7,
                impressions: 2100,
                clickThroughRate: 3.33,
            },
        ],
    });

    console.log('✅ Created sample analytics');
    console.log('\n🎉 Seed complete!');
    console.log(`\nDemo credentials:`);
    console.log(`  Email:    demo@weconnect.com`);
    console.log(`  Password: password123\n`);
}

seed()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
