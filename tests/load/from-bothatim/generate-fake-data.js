#!/usr/bin/env node
/**
 * generate-fake-data.js
 * يولّد بيانات اختبار واقعية لمنصة WhatsApp SaaS متعددة المتاجر.
 *
 * مخرجات:
 *   data/stores.json          — { stores: [...] }
 *   data/customers.json       — composite key "storeId|phone"
 *   data/orders_{storeId}.jsonl
 *   data/coupons.json
 *
 * تشغيل:
 *   node D:\project\mostqlworkwatssap\staging\generate-fake-data.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- bcryptjs من مشروع البوت (لا نثبّت محلياً) ---
const BOT_ROOT = 'D:\\project\\mostqlworkwatssap\\whatsapp-cafe-bot\\whatsapp-cafe-bot';
let bcrypt;
try {
  bcrypt = require(path.join(BOT_ROOT, 'node_modules', 'bcryptjs'));
} catch (err) {
  console.error('[ERROR] لم أستطع تحميل bcryptjs من:', path.join(BOT_ROOT, 'node_modules', 'bcryptjs'));
  console.error(err.message);
  process.exit(1);
}

// --- إعدادات ---
const OUT_DIR = path.join(__dirname, 'data');
const STORE_COUNT = 50;
const CUSTOMER_COUNT = 500;
const ORDER_COUNT = 5000;
const COUPON_COUNT = 20;
const BCRYPT_ROUNDS = 10;
const DAYS_BACK = 90;

// --- بيانات عربية واقعية ---
const CAFE_NAMES = [
  'قهوة الصباح', 'بن الخليج', 'كافيه الرياض', 'مقهى النخيل', 'كوفي تايم',
  'بيت القهوة', 'قهوة العربية', 'لاتيه آرت', 'إسبريسو لاب', 'مقهى الجوهرة'
];
const RESTAURANT_NAMES = [
  'مطعم الذواقة', 'مشاوي الشام', 'بيت الكبسة', 'مطعم البركة', 'الفرسان جريل',
  'مأكولات الواحة', 'مطعم اللؤلؤة', 'دار المندي', 'حضرموت للمندي', 'مطعم النخبة'
];
const PHARMACY_NAMES = [
  'صيدلية الشفاء', 'صيدلية النهضة', 'صيدلية السلام', 'صيدلية الرحمة', 'صيدلية الحياة',
  'صيدلية المستقبل', 'صيدلية الأمل', 'صيدلية الوفاء', 'صيدلية البركة', 'صيدلية الصحة'
];
const SALON_NAMES = [
  'صالون اللمسة الذهبية', 'صالون الأناقة', 'صالون الجمال', 'صالون النجوم', 'صالون فينوس',
  'صالون الملكة', 'صالون الرفاهية', 'صالون الإبداع', 'صالون الفخامة', 'صالون السحر'
];

const CAFE_PRODUCTS = [
  ['قهوة سادة', 12], ['قهوة بالحليب', 15], ['كابتشينو', 18], ['لاتيه', 18],
  ['إسبريسو', 14], ['موكا', 22], ['شاي أحمر', 8], ['شاي بالنعناع', 10],
  ['شوكولاتة ساخنة', 20], ['كرواسون', 15], ['كيك شوكولاتة', 25], ['تشيز كيك', 30],
  ['ميلك شيك فانيلا', 22], ['عصير برتقال', 14], ['ماء معدني', 5], ['آيس لاتيه', 20],
  ['فرابتشينو', 28], ['دونات', 12], ['مافن', 14], ['سندوتش تونة', 20],
  ['سندوتش حلوم', 22], ['ساندويتش دجاج', 25], ['براوني', 18], ['آيس كريم', 15],
  ['كروسان جبن', 18], ['كروسان شوكولاتة', 18], ['وافل', 28], ['بان كيك', 30],
  ['عصير ليمون نعناع', 16], ['موهيتو', 20]
];
const RESTAURANT_PRODUCTS = [
  ['مندي لحم', 65], ['مندي دجاج', 45], ['كبسة دجاج', 40], ['كبسة لحم', 55],
  ['مشاوي مشكل', 85], ['شاورما دجاج', 18], ['شاورما لحم', 22], ['برجر لحم', 30],
  ['برجر دجاج', 25], ['فاهيتا دجاج', 45], ['كبدة', 35], ['ريش', 75],
  ['تيكا دجاج', 35], ['سلطة سيزر', 25], ['سلطة فتوش', 20], ['حمص', 12],
  ['متبل', 12], ['بابا غنوج', 14], ['تبولة', 15], ['كباب', 60],
  ['شيش طاووق', 50], ['كفتة', 55], ['عصير مانجو', 14], ['عصير ليمون', 10],
  ['بيبسي', 6], ['ماء', 3], ['أرز بسمتي', 15], ['مكرونة بشاميل', 30]
];
const PHARMACY_PRODUCTS = [
  ['بنادول 500', 8], ['بانادول إكسترا', 12], ['كوميتركس', 18], ['فيتامين سي', 25],
  ['فيتامين د', 35], ['زنك', 22], ['أوميغا 3', 60], ['ملتي فيتامين', 75],
  ['شراب كحة', 28], ['قطرة عين', 18], ['كريم مرطب', 45], ['شامبو طبي', 55],
  ['معجون أسنان', 14], ['فرشاة أسنان', 8], ['مناديل مبللة', 12], ['كمامات طبية', 15],
  ['كحول طبي', 10], ['شاش طبي', 6], ['لاصق جروح', 8], ['ميزان حرارة', 35],
  ['جهاز ضغط', 180], ['جهاز سكر', 145], ['كريم واقي شمس', 65], ['كريم مرطب وجه', 95]
];
const SALON_PRODUCTS = [
  ['قص شعر', 50], ['صبغة شعر', 120], ['سيشوار', 40], ['تسريحة', 80],
  ['كيراتين', 200], ['بروتين شعر', 180], ['ماسك شعر', 60], ['حمام كريم', 45],
  ['مكياج سهرة', 150], ['مكياج عروس', 200], ['مانيكير', 40], ['بديكير', 50],
  ['أظافر جل', 90], ['تنظيف بشرة', 100], ['ماسك وجه', 70], ['تشقير', 30],
  ['إزالة شعر', 80], ['حناء', 45], ['تدليك وجه', 60], ['تساقط شعر علاج', 180]
];

const CITIES_SA = ['الرياض', 'جدة', 'الدمام', 'مكة', 'المدينة', 'الخبر', 'تبوك', 'أبها', 'الطائف', 'القصيم'];
const CITIES_EG = ['القاهرة', 'الإسكندرية', 'الجيزة', 'المنصورة', 'طنطا', 'أسيوط', 'الأقصر', 'أسوان', 'بورسعيد', 'الزقازيق'];

const FIRST_NAMES = [
  'محمد', 'أحمد', 'علي', 'حسن', 'حسين', 'عبدالله', 'عبدالرحمن', 'خالد', 'فهد', 'سعد',
  'ياسر', 'سامي', 'وليد', 'طارق', 'بدر', 'عمر', 'يوسف', 'إبراهيم', 'مصطفى', 'هاني',
  'فاطمة', 'عائشة', 'مريم', 'نورة', 'سارة', 'هند', 'منى', 'ليلى', 'دينا', 'رنا'
];
const LAST_NAMES = [
  'العتيبي', 'القحطاني', 'الشمري', 'الدوسري', 'الحربي', 'المطيري', 'الزهراني', 'الغامدي',
  'السلمي', 'البلوي', 'محمد', 'إبراهيم', 'حسن', 'علي', 'عبدالعزيز', 'فاروق', 'صبري', 'منصور'
];

const PLANS = ['starter', 'pro', 'premium'];
const ORDER_STATUSES = [
  { status: 'pending_confirmation', weight: 10 },
  { status: 'confirmed', weight: 20 },
  { status: 'completed', weight: 55 },
  { status: 'rejected', weight: 7 },
  { status: 'cancelled', weight: 8 }
];

// --- أدوات عشوائية ---
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max, decimals = 2) {
  const v = Math.random() * (max - min) + min;
  return Number(v.toFixed(decimals));
}
function weightedPick(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.status;
  }
  return items[0].status;
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function genBase62(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += BASE62[bytes[i] % 62];
  return out;
}

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function genPhoneSA(used) {
  // 9665XXXXXXXX
  while (true) {
    const rest = String(randInt(0, 99999999)).padStart(8, '0');
    const num = `9665${rest}`;
    if (!used.has(num)) { used.add(num); return num; }
  }
}
function genPhoneEG(used) {
  // 201XXXXXXXXX  (201 + 9 digits)
  while (true) {
    const rest = String(randInt(0, 999999999)).padStart(9, '0');
    const num = `201${rest}`;
    if (!used.has(num)) { used.add(num); return num; }
  }
}
function genPhone(used) {
  return Math.random() < 0.6 ? genPhoneSA(used) : genPhoneEG(used);
}

function randomTimestamp() {
  const now = Date.now();
  const offsetMs = randInt(0, DAYS_BACK * 24 * 60 * 60 * 1000);
  return new Date(now - offsetMs).toISOString();
}

function categoryFor(name) {
  if (CAFE_NAMES.includes(name)) return 'cafe';
  if (RESTAURANT_NAMES.includes(name)) return 'restaurant';
  if (PHARMACY_NAMES.includes(name)) return 'pharmacy';
  return 'salon';
}
function productsFor(category) {
  switch (category) {
    case 'cafe': return CAFE_PRODUCTS;
    case 'restaurant': return RESTAURANT_PRODUCTS;
    case 'pharmacy': return PHARMACY_PRODUCTS;
    default: return SALON_PRODUCTS;
  }
}

// --- المولّد الرئيسي ---
async function main() {
  console.log('🚀 بدء توليد البيانات...');
  console.log(`   المسار: ${OUT_DIR}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const usedPhones = new Set();
  const usedStoreNames = new Set();
  const stores = [];
  const allStoreNames = [...CAFE_NAMES, ...RESTAURANT_NAMES, ...PHARMACY_NAMES, ...SALON_NAMES];

  // 1) المتاجر
  for (let i = 0; i < STORE_COUNT; i++) {
    let baseName = pick(allStoreNames);
    let name = baseName;
    let dupIdx = 2;
    while (usedStoreNames.has(name)) name = `${baseName} ${dupIdx++}`;
    usedStoreNames.add(name);

    const category = categoryFor(baseName);
    const isSA = Math.random() < 0.6;
    const city = isSA ? pick(CITIES_SA) : pick(CITIES_EG);
    const ownerPhone = genPhone(usedPhones);
    const storeId = genId('store');
    const plainPassword = genBase62(12);
    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

    // منتجات
    const catalog = productsFor(category);
    const productCount = randInt(10, Math.min(30, catalog.length));
    const shuffled = [...catalog].sort(() => Math.random() - 0.5).slice(0, productCount);
    const products = shuffled.map(([pname, basePrice]) => {
      const price = Math.max(5, Math.min(200, Math.round(basePrice * randFloat(0.85, 1.25))));
      return {
        id: genId('prod'),
        name: pname,
        price,
        available: Math.random() < 0.9,
        category
      };
    });

    const plan = pick(PLANS);
    const createdAt = randomTimestamp();

    stores.push({
      id: storeId,
      name,
      category,
      city,
      country: isSA ? 'SA' : 'EG',
      ownerPhone,
      plan,
      status: 'active',
      password: plainPassword,        // plaintext للاختبار فقط
      passwordHash,
      createdAt,
      products,
      settings: {
        currency: isSA ? 'SAR' : 'EGP',
        deliveryFee: randInt(0, 25),
        minOrder: randInt(10, 50),
        workingHours: '09:00-23:00'
      }
    });

    if ((i + 1) % 10 === 0) {
      console.log(`   ✅ ${i + 1}/${STORE_COUNT} متجر`);
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'stores.json'),
    JSON.stringify({ stores }, null, 2),
    'utf8'
  );
  console.log(`💾 stores.json  (${stores.length} متجر)`);

  // 2) العملاء — composite key storeId|phone
  console.log('👥 توليد العملاء...');
  const customers = {};
  const customerKeysByStore = new Map(); // storeId -> [keys]
  for (const s of stores) customerKeysByStore.set(s.id, []);

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const store = pick(stores);
    const phone = genPhone(usedPhones);
    const key = `${store.id}|${phone}`;
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    customers[key] = {
      storeId: store.id,
      phone,
      name,
      address: `${store.city}، حي ${pick(['النخيل', 'الورود', 'الياسمين', 'الروضة', 'السلام', 'النزهة'])}`,
      ordersCount: 0,
      totalSpent: 0,
      firstSeen: randomTimestamp(),
      lastSeen: randomTimestamp()
    };
    customerKeysByStore.get(store.id).push(key);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'customers.json'),
    JSON.stringify(customers, null, 2),
    'utf8'
  );
  console.log(`💾 customers.json  (${Object.keys(customers).length} عميل)`);

  // 3) الطلبات
  console.log('📦 توليد الطلبات...');
  // وزّع 5000 طلب على المتاجر بحيث بعضها 50-200 طلب
  const ordersPerStore = new Map();
  let remaining = ORDER_COUNT;
  // امنح كل متجر حدًّا أدنى صغير
  for (const s of stores) {
    const base = randInt(20, 60);
    ordersPerStore.set(s.id, base);
    remaining -= base;
  }
  // وزّع الباقي عشوائياً مع تركيز على متاجر "نشطة"
  const activeStores = stores.filter(() => Math.random() < 0.5);
  while (remaining > 0) {
    const s = pick(activeStores.length ? activeStores : stores);
    const add = Math.min(remaining, randInt(1, 5));
    ordersPerStore.set(s.id, ordersPerStore.get(s.id) + add);
    remaining -= add;
  }
  // اضمن لبعض المتاجر نطاق 50-200
  for (const s of stores) {
    if (Math.random() < 0.4) {
      ordersPerStore.set(s.id, randInt(50, 200));
    }
  }

  let totalOrders = 0;
  for (const store of stores) {
    const count = ordersPerStore.get(store.id);
    const fileLines = [];
    const storeCustomers = customerKeysByStore.get(store.id);

    for (let i = 0; i < count; i++) {
      // بعض الطلبات بعملاء لا ينتمون للمتجر أصلاً → ننشئ مؤقتاً
      let customerPhone, customerName;
      if (storeCustomers.length && Math.random() < 0.7) {
        const key = pick(storeCustomers);
        const c = customers[key];
        customerPhone = c.phone;
        customerName = c.name;
      } else {
        customerPhone = genPhone(usedPhones);
        customerName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      }

      // أصناف الطلب
      const itemCount = randInt(1, 5);
      const items = [];
      let total = 0;
      for (let j = 0; j < itemCount; j++) {
        const p = pick(store.products);
        const qty = randInt(1, 3);
        items.push({ productId: p.id, name: p.name, price: p.price, qty });
        total += p.price * qty;
      }
      total += store.settings.deliveryFee;

      const status = weightedPick(ORDER_STATUSES);
      const createdAt = randomTimestamp();

      const order = {
        id: genId('ord'),
        storeId: store.id,
        customerPhone,
        customerName,
        items,
        deliveryFee: store.settings.deliveryFee,
        total,
        currency: store.settings.currency,
        status,
        createdAt,
        updatedAt: createdAt,
        notes: Math.random() < 0.15 ? pick(['بدون بصل', 'حار', 'بدون سكر', 'إضافة جبن', '']) : ''
      };

      // حدّث ملخّص العميل إن كان مسجّلاً
      const key = `${store.id}|${customerPhone}`;
      if (customers[key]) {
        customers[key].ordersCount += 1;
        if (status === 'completed') customers[key].totalSpent += total;
      }

      fileLines.push(JSON.stringify(order));
      totalOrders++;
    }

    const filePath = path.join(OUT_DIR, `orders_${store.id}.jsonl`);
    fs.writeFileSync(filePath, fileLines.join('\n') + '\n', 'utf8');
  }
  console.log(`💾 orders_{storeId}.jsonl  (${totalOrders} طلب على ${stores.length} ملف)`);

  // أعد كتابة customers بعد تحديث ordersCount/totalSpent
  fs.writeFileSync(
    path.join(OUT_DIR, 'customers.json'),
    JSON.stringify(customers, null, 2),
    'utf8'
  );

  // 4) الكوبونات
  console.log('🎟  توليد الكوبونات...');
  const coupons = [];
  const usedCodes = new Set();
  const couponPrefixes = ['SAVE', 'WELCOME', 'EID', 'RAMADAN', 'VIP', 'NEW', 'SUMMER', 'WINTER'];
  for (let i = 0; i < COUPON_COUNT; i++) {
    let code;
    do { code = `${pick(couponPrefixes)}${randInt(10, 99)}`; } while (usedCodes.has(code));
    usedCodes.add(code);
    const isPercent = Math.random() < 0.7;
    coupons.push({
      id: genId('cpn'),
      code,
      storeId: Math.random() < 0.6 ? pick(stores).id : null,  // null = عام
      type: isPercent ? 'percent' : 'fixed',
      value: isPercent ? randInt(5, 30) : randInt(5, 50),
      minOrder: randInt(0, 100),
      usageLimit: randInt(50, 500),
      usedCount: randInt(0, 50),
      validFrom: randomTimestamp(),
      validUntil: new Date(Date.now() + randInt(7, 60) * 24 * 60 * 60 * 1000).toISOString(),
      active: Math.random() < 0.85
    });
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'coupons.json'),
    JSON.stringify({ coupons }, null, 2),
    'utf8'
  );
  console.log(`💾 coupons.json  (${coupons.length} كوبون)`);

  console.log('\n✅ اكتمل التوليد بنجاح');
  console.log(`   stores:    ${stores.length}`);
  console.log(`   customers: ${Object.keys(customers).length}`);
  console.log(`   orders:    ${totalOrders}`);
  console.log(`   coupons:   ${coupons.length}`);
  console.log(`   📁 ${OUT_DIR}`);
}

main().catch(err => {
  console.error('❌ فشل التوليد:', err);
  process.exit(1);
});
