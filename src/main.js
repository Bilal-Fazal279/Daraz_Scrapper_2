// import { Actor } from 'apify';
// import { BasicCrawler, Dataset } from 'crawlee';
// import { gotScraping } from 'got-scraping';

// // Initialize the Apify Actor
// await Actor.init();

// // 1. Get the search query from the Input tab (default to 'Mobile Accessories')
// const input = await Actor.getInput() || { query: 'Mobile Accessories' };
// const { query } = input;

// const crawler = new BasicCrawler({
//     async requestHandler({ request }) {
//         const { url, userData } = request;
//         const page = userData.page || 1;

//         console.log(`🚀 Scraping Page ${page} for: ${query}`);

//         // 2. Fetch the data using gotScraping (mimics a real browser)
//         const response = await gotScraping({
//             url: url,
//             // These headers make us look like a real Windows Chrome user
//             headerGeneratorOptions: {
//                 browsers: [{ name: 'chrome', minVersion: 100 }],
//                 devices: ['desktop'],
//             },
//         });

//         // 3. Parse the JSON string into a JavaScript Object
//         const data = JSON.parse(response.body);

//         // Dig into the JSON structure we found in your file
//         const products = data.mods?.listItems || [];

//         if (products.length === 0) {
//             console.log('⚠️ No more products found. Stopping.');
//             return;
//         }

//         // 4. Map the data into your SastaDost format
//         const cleanData = products.map((item) => ({
//             daraz_id: item.itemId,
//             name: item.name,
//             price: parseFloat(item.price),
//             original_price: parseFloat(item.originalPrice || item.price),
//             discount: item.discount,
//             rating: parseFloat(item.ratingScore || 0),
//             reviews: item.review,
//             seller: item.sellerName,
//             location: item.location,
//             brand: item.brandName,
//             url: `https:${item.itemUrl}`,
//             image: item.image,
//             scraped_at: new Date().toISOString(),
//         }));

//         // 5. Save the products to the Apify Dataset (Storage)
//         await Dataset.pushData(cleanData);

//         // 6. Pagination: Check if there is a next page
//         const noMorePages = data.mainInfo?.noMorePages;
//         if (!noMorePages && page < 20) { // Limit to 20 pages for testing
//             const nextPage = page + 1;

//             // Generate the URL for the next page
//             const nextUrl = `https://www.daraz.pk/catalog/?ajax=true&page=${nextPage}&q=${encodeURIComponent(query)}`;

//             // Add the next page to the crawler's to-do list
//             await crawler.addRequests([{
//                 url: nextUrl,
//                 userData: { page: nextPage },
//             }]);
//         }
//     },
// });

// // Start the crawler with the first page
// const startUrl = `https://www.daraz.pk/catalog/?ajax=true&page=1&q=${encodeURIComponent(query)}`;
// await crawler.run([startUrl]);

// // Clean up and close the Actor
// await Actor.exit();
////////////////////////////////////////////////////

import 'dotenv/config';
import { Actor } from 'apify';
import { BasicCrawler, sleep } from 'crawlee';
import { gotScraping } from 'got-scraping';
import pkg from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { PrismaClient } = pkg;

/**
 * 1. DATABASE CONFIGURATION
 */
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

await Actor.init();

/**
 * 2. DYNAMIC INPUT HANDLING WITH IMMEDIATE ATOMIC LOCKING
 * Fixes concurrency: Marks category instantly so parallel scrapers skip it.
 */
let categoryToScrape = null;
 
try {
    // Wrap selection and immediate update inside an atomic transaction
    categoryToScrape = await prisma.$transaction(async (tx) => {
        const selected = await tx.categories.findFirst({
            orderBy: [
                { updated_at: 'asc' },
                { id: 'asc' }
            ],
        });

        if (!selected) return null;

        // Immediately update updated_at to NOW to lock it out for other scrapers
        const lockedCategory = await tx.categories.update({
            where: { id: selected.id },
            data: { updated_at: new Date() }
        });

        return lockedCategory;
    });
} catch (lockError) {
    console.error("❌ Failed to secure an atomic category lock:", lockError.message);
}

if (!categoryToScrape) {
    console.log("⚠️ No categories found in the database or all are currently locked.");
    await prisma.$disconnect();
    await pool.end();
    await Actor.exit();
    process.exit(0);
}

console.log(`🚀 Locked & Selected Category : ${categoryToScrape.sub_category_name} (ID: ${categoryToScrape.id})`);

const buildDarazUrl = (baseUrl, pageNum) => {
    const connector = baseUrl.includes('?') ? '&' : '?';
    const cleanUrl = baseUrl.startsWith('//') ? `https:${baseUrl}` : baseUrl;
    return `${cleanUrl}${connector}ajax=true&page=${pageNum}`;
};

const platforms = ['windows', 'macos', 'linux'];

const crawler = new BasicCrawler({
    requestHandlerTimeoutSecs: 300, 
    maxConcurrency: 1,

    async requestHandler({ request }) {
        const page = request.userData?.page || 1;
        const retryCount = request.retryCount || 0;

        // Deep-page backoff strategy to reduce anti-bot triggering
        let baseDelay = 3000 + Math.random() * 3000;
        if (page > 40) {
            console.log(`🐢 Deep page detected (${page}). Applying extra stealth delay rules...`);
            baseDelay = 8000 + Math.random() * 7000;
        }

        const penaltyDelay = retryCount * 15000;
        const totalDelay = baseDelay + penaltyDelay;
        console.log(`🌐 [Page ${page}] Delaying ${Math.round(totalDelay)}ms (Retry: ${retryCount})...`);
        await sleep(totalDelay);

        try {
            const response = await gotScraping({
                url: request.url,
                headerGeneratorOptions: {
                    browsers: [
                        { name: 'chrome', minVersion: 110 },
                        { name: 'edge', minVersion: 110 },
                        { name: 'firefox', minVersion: 110 }
                    ],
                    devices: ['desktop'],
                    operatingSystems: [platforms[Math.floor(Math.random() * platforms.length)]],
                },
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.daraz.pk/',
                    'Cache-Control': 'no-cache',
                }
            });

            const contentType = response.headers['content-type'] || '';
            if (!contentType.includes('application/json') && response.body.trim().startsWith('<')) {
                console.warn(`🛑 [Page ${page}] Detected Anti-Bot HTML. Triggering retry...`);
                throw new Error("Daraz Anti-Bot Wall Triggered");
            }

            const data = JSON.parse(response.body);
            const products = data.mods?.listItems || [];

            if (products.length === 0) {
                console.log(`⚠️ No products found on page ${page}. Closing category.`);
                // Timestamp already bumped at start, keeping this to refresh final state
                await prisma.categories.update({
                    where: { id: categoryToScrape.id },
                    data: { updated_at: new Date() }
                });
                return;
            }

            console.log(`📦 Page ${page}: Scraped ${products.length} items. Processing Sync...`);

            /**
             * 3. INTELLIGENT SYNC & HISTORY LOGGING
             */
            try {
                const newProductsResult = await prisma.product.createMany({
                    data: products.map(item => ({
                        daraz_id: String(item.itemId),
                        name: String(item.name),
                        current_price: parseFloat(item.price) || 0,
                        product_url: item.itemUrl.startsWith('http') ? item.itemUrl : `https:${item.itemUrl}`,
                        image_url: item.image || null,
                        rating_score: parseFloat(item.ratingScore) || 0,
                        review_count: item.review ? String(item.review) : "0",
                        seller_name: item.sellerName || "Unknown Seller",
                        location: item.location || " ",
                        item_sold_count: String(item.itemSoldCntShow || "0"), 
                        category_id: categoryToScrape.id,
                        store: "daraz"
                    })),
                    skipDuplicates: true,
                });

                let priceChangesDetected = 0;
                let newHistoryEntries = 0;
                let metadataUpdates = 0; 

                for (const item of products) {
                    const newPrice = parseFloat(item.price) || 0;
                    const darazId = String(item.itemId);

                    const existingRecord = await prisma.product.findUnique({
                        where: { daraz_id: darazId },
                        select: {
                            id: true,
                            current_price: true,
                            rating_score: true,      
                            item_sold_count: true,   
                            review_count: true,       
                            seller_name: true,        
                            location: true,           
                            category_id: true,
                        }
                    });

                    if (existingRecord) {
                        let updateData = {};
                        let needsUpdate = false;

                        if ((!existingRecord.rating_score || existingRecord.rating_score === 0) && item.ratingScore) {
                            updateData.rating_score = parseFloat(item.ratingScore);
                            needsUpdate = true;
                        }
                        if ((!existingRecord.item_sold_count || existingRecord.item_sold_count === "0") && item.itemSoldCntShow) {
                            updateData.item_sold_count = String(item.itemSoldCntShow);
                            needsUpdate = true;
                        }
                        if ((!existingRecord.review_count || existingRecord.review_count === "0") && item.review) {
                            updateData.review_count = String(item.review);
                            needsUpdate = true;
                        }
                        if ((!existingRecord.seller_name || existingRecord.seller_name === "") && item.sellerName) {
                            updateData.seller_name = String(item.sellerName);
                            needsUpdate = true;
                        }
                        if ((!existingRecord.location || existingRecord.location === "") && item.location) {
                            updateData.location = String(item.location);
                            needsUpdate = true;
                        }
                        if ((!existingRecord.category_id || existingRecord.category_id === 0) && item.category_id) {
                            updateData.category_id = String(item.category_id);
                            needsUpdate = true;
                        }

                        if (existingRecord.current_price !== newPrice) {
                            priceChangesDetected++;
                            newHistoryEntries++;
                            updateData.current_price = newPrice;
                            needsUpdate = true;

                            await prisma.price_history.create({
                                data: {
                                    price: newPrice,
                                    product_id: existingRecord.id
                                }
                            });
                        }

                        if (needsUpdate) {
                            if (!updateData.current_price) metadataUpdates++; 
                            await prisma.product.update({
                                where: { id: existingRecord.id },
                                data: updateData
                            });
                        }

                        const historyExists = await prisma.price_history.findFirst({
                            where: { product_id: existingRecord.id }
                        });

                        if (!historyExists) {
                            newHistoryEntries++;
                            await prisma.price_history.create({
                                data: {
                                    price: newPrice,
                                    product_id: existingRecord.id
                                }
                            });
                        }
                    }
                }

                if (priceChangesDetected > 0) {
                    console.log(`📉 Price updates logged for ${priceChangesDetected} items.`);
                }

                console.log(`📊 DB SYNC REPORT:`);
                console.log(`   ✨ New Products: ${newProductsResult.count}`);
                console.log(`   📉 Price Changes: ${priceChangesDetected}`);
                console.log(`   🛠️ Metadata Repaired: ${metadataUpdates}`); 
                console.log(`   ** History Rows: ${newHistoryEntries}`);
                console.log(`   ⏩ Unchanged: ${products.length - (newProductsResult.count + priceChangesDetected + metadataUpdates)}`);
                console.log(`------------------------------\n`);

            } catch (dbError) {
                console.error(`❌ DB Error on Page ${page}:`, dbError.message);
                throw dbError;
            }

            /**
             * 4. PAGINATION LOGIC
             */
            const noMorePages = data.mainInfo?.noMorePages === true || data.mainInfo?.noMorePages === "true";

            if (!noMorePages) {
                const nextPage = page + 1;
                const nextUrl = buildDarazUrl(categoryToScrape.sub_category_url, nextPage);

                await crawler.addRequests([{
                    url: nextUrl,
                    userData: { page: nextPage },
                }]);
            } else {
                console.log(`✅ Category ID: ${categoryToScrape.id} completed. and noMorePages=${noMorePages} at page=${page}`);
                await prisma.categories.update({
                    where: { id: categoryToScrape.id },
                    data: { updated_at: new Date() }
                });
            }

        } catch (e) {
            console.error(`🛑 Scraper Error on page ${page}:`, e.message);

            if (request.retryCount >= 2) {
                console.log(`⏭️ Max retries hit. Moving to next category.`);
                await prisma.categories.update({
                    where: { id: categoryToScrape.id },
                    data: { updated_at: new Date() }
                });
            }
            throw e;
        }
    },
});

/**
 * 5. EXECUTION
 */
const startUrl = buildDarazUrl(categoryToScrape.sub_category_url, 1);

try {
    await crawler.run([{
        url: startUrl,
        userData: { page: 1 }
    }]);
} finally {
    await prisma.$disconnect();
    await pool.end();
    await Actor.exit();
    console.log('🏁 Scraper session finished safely.');
}