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
 * 2. DYNAMIC INPUT HANDLING
 */
const categoryToScrape = await prisma.categories.findFirst({
    orderBy: [
        { updated_at: 'asc' },
        { id: 'asc' }
    ],
});

if (!categoryToScrape) {
    console.log("⚠️ No categories found in the database.");
    await Actor.exit();
}

console.log(`🚀 Selected Category : ${categoryToScrape.sub_category_name} (ID: ${categoryToScrape.id})`);
const buildDarazUrl = (baseUrl, pageNum) => {
    const connector = baseUrl.includes('?') ? '&' : '?';
    const cleanUrl = baseUrl.startsWith('//') ? `https:${baseUrl}` : baseUrl;
    return `${cleanUrl}${connector}ajax=true&page=${pageNum}`;
};

const crawler = new BasicCrawler({
    requestHandlerTimeoutSecs: 300, // Increased for history processing
    maxConcurrency: 1,

    async requestHandler({ request }) {
        const page = request.userData?.page || 1;
        const retryCount = request.retryCount || 0;

        const baseDelay = 2000 + Math.random() * 2000;
        const penaltyDelay = retryCount * 10000;
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

            console.log(`📦 Page ${page}: Scraped ${products.length} items. Processing Sync...`);

            /**
             * 3. INTELLIGENT SYNC & HISTORY LOGGING
             */
            try {
                // Step A: Attempt to create new products in bulk (will skip if daraz_id exists)
                const newProductsResult = await prisma.product.createMany({
                    data: products.map(item => ({
                        daraz_id: String(item.itemId),
                        name: String(item.name),
                        current_price: parseFloat(item.price) || 0,
                        product_url: item.itemUrl.startsWith('http') ? item.itemUrl : `https:${item.itemUrl}`,
                        image_url: item.image || null,
                    })),
                    skipDuplicates: true,
                });

                // Step B: Loop through all items to handle price changes & initial history
                let priceChangesDetected = 0;
                let newHistoryEntries = 0; // Add this counter

                for (const item of products) {
                    const newPrice = parseFloat(item.price) || 0;
                    const darazId = String(item.itemId);

                    // Find record to check price or check if history exists
                    const existingRecord = await prisma.product.findUnique({
                        where: { daraz_id: darazId },
                        select: { id: true, current_price: true }
                    });

                    if (existingRecord) {
                        // Check if price history already exists for this product
                        const historyExists = await prisma.price_history.findFirst({
                            where: { product_id: existingRecord.id }
                        });

                        // Logic: If price changed OR if this is a new product with no history yet
                        if (existingRecord.current_price !== newPrice) {
                            priceChangesDetected++;
                            newHistoryEntries++; // It's a change, so we add history

                            // Update the main product price
                            await prisma.product.update({
                                where: { id: existingRecord.id },
                                data: { current_price: newPrice }
                            });

                            // Log the change in history
                            await prisma.price_history.create({
                                data: {
                                    price: newPrice,
                                    product_id: existingRecord.id
                                }
                            });
                        }
                        else if (!historyExists) {
                            newHistoryEntries++; // It's new history for a new product
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

                // Update your console log to show the history count:
                console.log(`📊 DB SYNC REPORT:`);
                console.log(`   ✨ New Products: ${newProductsResult.count}`);
                console.log(`   📉 Price Changes: ${priceChangesDetected}`);
                console.log(`   📜 History Rows: ${newHistoryEntries}`); // Now you'll see the rows increasing
                console.log(`   ⏩ Unchanged: ${products.length - (newProductsResult.count + priceChangesDetected)}`);
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