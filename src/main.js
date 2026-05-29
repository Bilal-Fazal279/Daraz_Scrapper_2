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
    max: 15, // Slightly optimized pool size for concurrent runners
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

await Actor.init();

/**
 * 2. CHUNK-BASED DYNAMIC INPUT HANDLING
 * Distributes 550 categories safely across parallel instances
 */
const currentChunk = parseInt(process.env.SCRAPER_CHUNK) || 1;
const totalChunks = parseInt(process.env.TOTAL_CHUNKS) || 1;

// Fetch old records first, then apply modulo segmentation in memory
const allAvailableCategories = await prisma.categories.findMany({
    orderBy: [
        { updated_at: 'asc' },
        { id: 'asc' }
    ],
});

const chunkedCategories = allAvailableCategories.filter((_, index) => {
    return (index % totalChunks) === (currentChunk - 1);
});

const categoryToScrape = chunkedCategories[0];

if (!categoryToScrape) {
    console.log(`⚠️ [Chunk ${currentChunk}] No active categories assigned.`);
    await prisma.$disconnect();
    await pool.end();
    await Actor.exit();
    process.exit(0);
}

console.log(`🚀 [Chunk ${currentChunk}/${totalChunks}] Selected Category: ${categoryToScrape.sub_category_name} (ID: ${categoryToScrape.id})`);

const buildDarazUrl = (baseUrl, pageNum) => {
    const connector = baseUrl.includes('?') ? '&' : '?';
    const cleanUrl = baseUrl.startsWith('//') ? `https:${baseUrl}` : baseUrl;
    return `${cleanUrl}${connector}ajax=true&page=${pageNum}`;
};

const crawler = new BasicCrawler({
    requestHandlerTimeoutSecs: 300,
    maxConcurrency: 1,

    async requestHandler({ request }) {
        const page = request.userData?.page || 1;
        const retryCount = request.retryCount || 0;

        const baseDelay = 3000 + Math.random() * 3000; // Increased delay buffer slightly for safety against anti-bot triggers
        const penaltyDelay = retryCount * 12000;
        const totalDelay = baseDelay + penaltyDelay;
        console.log(`🌐 [Page ${page}] Delaying ${Math.round(totalDelay)}ms (Retry: ${retryCount})...`);
        await sleep(totalDelay);

        try {
            const response = await gotScraping({
                url: request.url,
                headerGeneratorOptions: {
                    browsers: [
                        { name: 'chrome', minVersion: 100 },
                        { name: 'firefox', minVersion: 100 }
                    ],
                    devices: ['desktop'],
                },
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
                await prisma.categories.update({
                    where: { id: categoryToScrape.id },
                    data: { updated_at: new Date() }
                });
                return;
            }

            console.log(`📦 Page ${page}: Scraped ${products.length} items. Syncing with High-Performance Memory Strategy...`);

            /**
             * 3. HIGH-PERFORMANCE RECONCILIATION LAYER (Fixes Timeout Error 57014)
             */
            try {
                const scrapedIds = products.map(item => String(item.itemId));

                // Batch-fetch all matching product records inside a single DB request
                const existingRecords = await prisma.product.findMany({
                    where: { daraz_id: { in: scrapedIds } },
                    select: {
                        id: true,
                        daraz_id: true,
                        current_price: true,
                        rating_score: true,
                        item_sold_count: true,
                        review_count: true,
                        seller_name: true,
                        location: true,
                        category_id: true,
                    }
                });

                // Create a lightning-fast hash map lookup table
                const recordMap = new Map(existingRecords.map(r => [r.daraz_id, r]));

                // Separate arrays for batch operations
                const newProductsPayload = [];
                const priceHistoryPayload = [];
                const updatesQueue = [];

                let priceChangesDetected = 0;
                let metadataUpdates = 0;

                for (const item of products) {
                    const darazId = String(item.itemId);
                    const newPrice = parseFloat(item.price) || 0;
                    const existingRecord = recordMap.get(darazId);

                    if (!existingRecord) {
                        // Product does not exist: Add to the batch creation payload
                        newProductsPayload.push({
                            daraz_id: darazId,
                            name: String(item.name),
                            current_price: newPrice,
                            product_url: item.itemUrl.startsWith('http') ? item.itemUrl : `https:${item.itemUrl}`,
                            image_url: item.image || null,
                            rating_score: parseFloat(item.ratingScore) || 0,
                            review_count: item.review ? String(item.review) : "0",
                            seller_name: item.sellerName || "Unknown Seller",
                            location: item.location || " ",
                            item_sold_count: String(item.itemSoldCntShow || "0"),
                            category_id: categoryToScrape.id,
                            store: "daraz"
                        });
                    } else {
                        // Product exists: Perform mutations in-memory
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

                        if (existingRecord.current_price !== newPrice) {
                            priceChangesDetected++;
                            updateData.current_price = newPrice;
                            needsUpdate = true;

                            priceHistoryPayload.push({
                                price: newPrice,
                                product_id: existingRecord.id
                            });
                        }

                        if (needsUpdate) {
                            if (updateData.current_price === undefined) metadataUpdates++;
                            updatesQueue.push(
                                prisma.product.update({
                                    where: { id: existingRecord.id },
                                    data: updateData
                                })
                            );
                        }
                    }
                }

                // ⚡ EXECUTE BULK DATABASE OPERATIONS Outside loops
                let insertedCount = 0;
                if (newProductsPayload.length > 0) {
                    const insertResult = await prisma.product.createMany({
                        data: newProductsPayload,
                        skipDuplicates: true
                    });
                    insertedCount = insertResult.count;

                    // Fetch newly inserted IDs to populate their initial tracking history point
                    const newInsertedRecords = await prisma.product.findMany({
                        where: { daraz_id: { in: newProductsPayload.map(p => p.daraz_id) } },
                        select: { id: true, current_price: true }
                    });

                    newInsertedRecords.forEach(p => {
                        priceHistoryPayload.push({
                            price: p.current_price,
                            product_id: p.id
                        });
                    });
                }

                // Execute scalar structural updates in a concurrent execution pool batch
                if (updatesQueue.length > 0) {
                    await prisma.$transaction(updatesQueue);
                }

                // Bulk insert all accumulated pricing entries at once
                if (priceHistoryPayload.length > 0) {
                    await prisma.price_history.createMany({
                        data: priceHistoryPayload
                    });
                }

                console.log(`📊 DB SYNC REPORT:`);
                console.log(`   ✨ New Products Created: ${insertedCount}`);
                console.log(`   📉 Price Fluctuations: ${priceChangesDetected}`);
                console.log(`   🛠️ Metadata Columns Repaired: ${metadataUpdates}`);
                console.log(`   📜 History Data Points Added: ${priceHistoryPayload.length}`);
                console.log(`   ⏩ Unchanged Items: ${products.length - (insertedCount + priceChangesDetected + metadataUpdates)}`);
                console.log(`------------------------------\n`);

            } catch (dbError) {
                console.error(`❌ DB Sync Error on Page ${page}:`, dbError.message);
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
 * 5. EXECUTION ENTRY POINT
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