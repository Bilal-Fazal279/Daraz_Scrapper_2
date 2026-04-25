// run this file when you want to update the categories in the database
// run this file from other files if you need to  automate the process of updating categories in other files or 
// you can run it standalone with command "node updateDarazCategories.js" from terminal
// if calling from outside this folder you need to first install dependencies in other folder 
//using "npm install" command
// -------------------------------------------------------------------------------------------------------------


import 'dotenv/config';
import { gotScraping } from 'got-scraping';
import pkg from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { sleep } from 'crawlee';

const { PrismaClient } = pkg;

/**
 * 1. DATABASE SETUP
 * Using the Pool + Adapter method for high stability
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function startCategorySync() {
    console.log("🚀 Starting Protected Category Sync...");

    try {
        // --- STEP 1: HUMAN-LIKE BEHAVIOR ---
        // We wait a random time so Daraz doesn't see a "perfect" machine pattern
        const delay = 1500 + Math.random() * 2000;
        console.log(`⏱️ Sleeping for ${Math.round(delay)}ms to mimic a human...`);
        await sleep(delay);

        // --- STEP 2: FETCH VIA AJAX ---
        // Using the AJAX endpoint is the "secret weapon" to avoid blocks
        const response = await gotScraping({
            url: 'https://www.daraz.pk/ajax/home/getCategoryList',
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 100 }],
                devices: ['desktop'],
            },
        });

        const data = JSON.parse(response.body);
        const rawCategories = data.result?.categories || [];

        if (rawCategories.length === 0) {
            console.log("⚠️ No categories found. Daraz might have served a challenge page.");
            return;
        }

        // --- STEP 3: DATA TRANSFORMATION ---
        // Flatten the nested JSON into a simple list for our database
        const categoriesToSave = [];
        rawCategories.forEach(mainCat => {
            if (mainCat.children) {
                mainCat.children.forEach(subCat => {
                    let cleanUrl = subCat.url;
                    if (cleanUrl.startsWith('//')) cleanUrl = `https:${cleanUrl}`;

                    categoriesToSave.push({
                        category_name: mainCat.name,
                        sub_category_name: subCat.name,
                        sub_category_url: cleanUrl
                    });
                });
            }
        });

        console.log(`📦 Prepared ${categoriesToSave.length} categories.`);

        // --- STEP 4: BULK SYNC (The Fast Way) ---
        // createMany + skipDuplicates is much faster than looping one by one
        const result = await prisma.category.createMany({
            data: categoriesToSave,
            skipDuplicates: true,
        });

        console.log(`✅ SUCCESS: Synced ${categoriesToSave.length} items. New records: ${result.count}`);

    } catch (error) {
        console.error("🛑 Sync Failed:", error.message);
    } finally {
        // --- STEP 5: CLEANUP ---
        await prisma.$disconnect();
        await pool.end();
        console.log("🔌 Database connections closed safely.");
    }
}

startCategorySync();





////////////////////////////////////////////////////////////////////////////
// Scraped categories now have to enter them in db manually
// Code snippet:
// document.querySelectorAll(".lzd-site-menu-sub-item").forEach((item) => {
//     // We search for the <a> tag inside the list item
//     const anchor = item.querySelector('a');
//     const span = item.querySelector('a span');

//     if (anchor) {
//         const url = anchor.href;
//         const categoryName = span.innerHTML.trim();
//         console.log("anchor is:", anchor);
//         console.log("\n");
//         console.log(`✅ Category: ${categoryName}`);
//         console.log(`🔗 URL: ${url}`);
//         console.log('---');
//     }
// });


// Result: --------------------
//     anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Mobile%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Mobile Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Mobile%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Camera%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Camera Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Camera%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Wearable&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Wearable
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Wearable&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Network%20Components&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Network Components
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Network%20Components&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Computer%20Components&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Computer Components
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Computer%20Components&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Headphones%20%26%20Headsets&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Headphones & amp; Headsets
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Headphones%20%26%20Headsets&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Printers&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Printers
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Printers&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Storage&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Storage
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Storage&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Gaming%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Gaming Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Gaming%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Computer%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Computer Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Computer%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Refrigerators%20%26%20Freezers&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Refrigerators & amp; Freezers
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Refrigerators%20%26%20Freezers&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Cooling%20%26%20Heating&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Cooling & amp; Heating
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Cooling%20%26%20Heating&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Irons%20%26%20Garment%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Irons & amp; Garment Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Irons%20%26%20Garment%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Vacuums%20%26%20Floor%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Vacuums & amp; Floor Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Vacuums%20%26%20Floor%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Kitchen%20Appliances&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Kitchen Appliances
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Kitchen%20Appliances&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Home%20Audio%20%26%20Theater&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Home Audio & amp; Theater
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Home%20Audio%20%26%20Theater&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Televisions&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Televisions
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Televisions&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Projectors%20%26%20Players&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Projectors & amp; Players
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Projectors%20%26%20Players&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Generator,%20UPS%20%26%20Solar&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Generator, UPS & amp; Solar
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Generator,%20UPS%20%26%20Solar&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=TV%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: TV Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=TV%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Men's%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Men's Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Men%27s%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Medical%20Supplies&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Medical Supplies
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Medical%20Supplies&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Personal%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Personal Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Personal%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Hair%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Hair Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Hair%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Beauty%20Tools&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Beauty Tools
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Beauty%20Tools&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Makeup&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Makeup
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Makeup&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Fragrances&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Fragrances
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Fragrances&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Bath%20%26%20Body&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Bath & amp; Body
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Bath%20%26%20Body&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Sexual%20Wellness&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Sexual Wellness
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Sexual%20Wellness&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Skin%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Skin Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Skin%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Clothing%20%26%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Clothing & amp; Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Clothing%20%26%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Maternity%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Maternity Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Maternity%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Baby%20Gear&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Baby Gear
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Baby%20Gear&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Remote%20Control%20%26%20Vehicles&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Remote Control & amp; Vehicles
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Remote%20Control%20%26%20Vehicles&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Feeding&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Feeding
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Feeding&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Milk%20Formula%20%26%20Baby%20Food&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Milk Formula & amp; Baby Food
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Milk%20Formula%20%26%20Baby%20Food&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Diapering%20%26%20Potty&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Diapering & amp; Potty
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Diapering%20%26%20Potty&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Nursery&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Nursery
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Nursery&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Sports%20%26%20Outdoor%20Play&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Sports & amp; Outdoor Play
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Sports%20%26%20Outdoor%20Play&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Baby%20%26%20Toddler%20Toys&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Baby & amp; Toddler Toys
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Baby%20%26%20Toddler%20Toys&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Baby%20Personal%20Care&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Baby Personal Care
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Baby%20Personal%20Care&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Toys%20%26%20Games&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Toys & amp; Games
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Toys%20%26%20Games&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Daraz%20Like%20New&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Daraz Like New
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Daraz%20Like%20New&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Security%20Cameras&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Security Cameras
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Security%20Cameras&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Gaming%20Consoles&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Gaming Consoles
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Gaming%20Consoles&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Smart%20Phones&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Smart Phones
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Smart%20Phones&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Cameras%20%26%20Drones&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Cameras & amp; Drones
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Cameras%20%26%20Drones&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Laptops&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Laptops
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Laptops&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Desktops&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Desktops
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Desktops&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Frozen%20Food&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Frozen Food
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Frozen%20Food&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Dog&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Dog
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Dog&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Cat&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Cat
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Cat&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Breakfast,%20Choco%20%26%20Snacks&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Breakfast, Choco & amp; Snacks
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Breakfast,%20Choco%20%26%20Snacks&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Beverages&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Beverages
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Beverages&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Food%20Staples&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Food Staples
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Food%20Staples&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Laundry%20%26%20Household&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Laundry & amp; Household
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Laundry%20%26%20Household&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Fish&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Fish
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Fish&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Laundry%20%26%20Cleaning&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Laundry & amp; Cleaning
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Laundry%20%26%20Cleaning&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Tools,%20DIY%20%26%20Outdoor&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Tools, DIY & amp; Outdoor
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Tools,%20DIY%20%26%20Outdoor&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Bath&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Bath
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Bath&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Stationery%20%26%20Craft&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Stationery & amp; Craft
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Stationery%20%26%20Craft&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Furniture&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Furniture
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Furniture&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Bedding&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Bedding
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Bedding&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Decor&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Decor
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Decor&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Lighting&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Lighting
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Lighting&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Media,%20Music%20%26%20Books&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Media, Music & amp; Books
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Media,%20Music%20%26%20Books&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Girls%20Clothing&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Girls Clothing
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Girls%20Clothing&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Sleepwear%20%26%20Innerwear&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Sleepwear & amp; Innerwear
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Sleepwear%20%26%20Innerwear&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Bras,%20Panties%20%26%20Lingerie&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Bras, Panties & amp; Lingerie
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Bras,%20Panties%20%26%20Lingerie&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Unstitched%20Fabric&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Unstitched Fabric
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Unstitched%20Fabric&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Kurtas%20%26%20Shalwar%20Kameez&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Kurtas & amp; Shalwar Kameez
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Kurtas%20%26%20Shalwar%20Kameez&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Dresses%20%26%20Skirts&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Dresses & amp; Skirts
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Dresses%20%26%20Skirts&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Winter%20Clothing&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Winter Clothing
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Winter%20Clothing&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Pants,%20Jeans%20%26%20Leggings&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Pants, Jeans & amp; Leggings
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Pants,%20Jeans%20%26%20Leggings&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Tops&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Tops
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Tops&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Muslim%20Wear&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Muslim Wear
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Muslim%20Wear&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Kurtas%20%26%20Shalwar%20Kameez&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Kurtas & amp; Shalwar Kameez
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Kurtas%20%26%20Shalwar%20Kameez&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Winter%20Clothing&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Winter Clothing
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Winter%20Clothing&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Shorts,%20Joggers%20%26%20Sweats&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Shorts, Joggers & amp; Sweats
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Shorts,%20Joggers%20%26%20Sweats&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Shirts%20%26%20Polo&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Shirts & amp; Polo
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Shirts%20%26%20Polo&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Boy's%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Boy's Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Boy%27s%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Boy's%20Clothing&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Boy's Clothing
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Boy%27s%20Clothing&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Shoes&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Shoes
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Shoes&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Inner%20Wear&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Inner Wear
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Inner%20Wear&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Pants%20%26%20Jeans&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Pants & amp; Jeans
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Pants%20%26%20Jeans&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Women's%20Watches&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Women's Watches
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Women%27s%20Watches&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Men's%20Watches&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Men's Watches
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Men%27s%20Watches&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Kid's%20Watches&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Kid's Watches
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Kid%27s%20Watches&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Mens%20Jewellery&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Mens Jewellery
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Mens%20Jewellery&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Womens%20Jewellery&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Womens Jewellery
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Womens%20Jewellery&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Sunglasses%20%26%20Eyewear&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Sunglasses & amp; Eyewear
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Sunglasses%20%26%20Eyewear&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Womens%20Bags&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Womens Bags
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Womens%20Bags&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Mens%20Bags&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Mens Bags
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Mens%20Bags&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Luggage%20%26%20Suitcase&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Luggage & amp; Suitcase
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Luggage%20%26%20Suitcase&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Women's%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Women's Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Women%27s%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Racket%20Sports&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Racket Sports
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Racket%20Sports&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Shoes%20%26%20Clothing&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Shoes & amp; Clothing
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Shoes%20%26%20Clothing&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Sports%20Accessories&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Sports Accessories
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Sports%20Accessories&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Fitness%20Gadgets&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Fitness Gadgets
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Fitness%20Gadgets&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Outdoor%20Recreation&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Outdoor Recreation
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Outdoor%20Recreation&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Supplements&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Supplements
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Supplements&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Team%20Sports&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Team Sports
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Team%20Sports&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Exercise%20%26%20Fitness&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Exercise & amp; Fitness
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Exercise%20%26%20Fitness&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Loaders%20%26%20Rickshaw&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Loaders & amp; Rickshaw
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Loaders%20%26%20Rickshaw&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Automotive&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Automotive
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Automotive&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     VM25285: 9 anchor is: <a href="/​/​www.daraz.pk/​catalog?q=Motorcycle&from=hp_categories&src=all_channel" class="lzd-site-menu-root-item-link">​…​</a>
// VM25285: 10

// VM25285: 11 ✅ Category: Motorcycle
// VM25285: 12 🔗 URL: https://www.daraz.pk/catalog?q=Motorcycle&from=hp_categories&src=all_channel
// VM25285: 13 -- -
//     undefined