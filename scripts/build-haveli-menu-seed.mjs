/**
 * Generates sql/seed_haveli_menu.sql from the Haveli restaurant menu.
 * Run: node scripts/build-haveli-menu-seed.mjs
 *
 * Edit MENU items as { name, price } objects to change prices.
 * Images are resolved from public/assets/{name}.jpg (see IMAGE_FILENAME_ALIASES for exceptions).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '../public/assets');
const PLACEHOLDER = '/placeholder.svg';

/** Menu item names whose asset filenames differ from "{name}.jpg". */
const IMAGE_FILENAME_ALIASES = {
  'Stuffed Parantha (Aloo/Gobhi/Mix)': 'Stuffed Parantha (AlooGobhiMix).jpg',
  'Veg Manchurian (Dry/Gravy)': 'Veg Manchurian (DryGravy).jpg',
  'Cheese Chilli (Dry/Gravy)': 'Cheese Chilli (DryGravy).jpg',
  'Vada Sambar': 'vada Sambar.jpg',
  "Season's Special Thali": 'Seasons Special Thali.jpg',
};

const MENU = [
  {
    id: 'cat_dal',
    name: 'Dalon Ki Bahar',
    items: [
      { name: 'Moong Dal Tadka', price: 215 },
      { name: 'Channe Amritsari', price: 384 },
      { name: 'Pindi Channa', price: 127 },
      { name: 'Urad Ki Sukhi Dal', price: 328 },
      { name: 'Rajmah Jammu Wale', price: 193 },
      { name: 'Dal Makhan Wali', price: 394 },
    ],
  },
  {
    id: 'cat_rice',
    name: 'Basmati Ki Khushbu',
    items: [
      { name: 'Sada Chawal', price: 121 },
      { name: 'Jeera Rice', price: 159 },
      { name: 'Vegetable Pulao', price: 254 },
      { name: 'Subji Biryani', price: 232 },
    ],
  },
  {
    id: 'cat_handi',
    name: 'Handi, Curries & Kadhi, Subziyan',
    items: [
      { name: 'Haveli Special', price: 303 },
      { name: 'Bharwan Karela', price: 253 },
      { name: 'Aloo Warian Desi', price: 192 },
      { name: 'Kadhi Pakora', price: 186 },
      { name: 'Achari Aloo', price: 373 },
      { name: 'Aloo Jeera', price: 207 },
      { name: 'Aloo Gobhi', price: 395 },
      { name: 'Mix Vegetable', price: 332 },
      { name: 'Baigan Da Bharta', price: 378 },
      { name: 'Bhindi Masala', price: 181 },
      { name: 'Veg Jaipuri', price: 117 },
      { name: 'Veg Kolhapuri', price: 365 },
      { name: 'Veg Makhaniwala', price: 357 },
      { name: 'Palak Corn Masala', price: 222 },
      { name: 'Sarson Da Saag', price: 160 },
      { name: 'Matar Methi Malai', price: 324 },
      { name: 'Dum Aloo Kashmiri', price: 297 },
      { name: 'Mushroom Matter', price: 110 },
      { name: 'Kadai Mushroom', price: 197 },
    ],
  },
  {
    id: 'cat_paneer',
    name: 'Paneer Specialities',
    items: [
      { name: 'Palak Paneer', price: 320 },
      { name: 'Shahi Paneer', price: 349 },
      { name: 'Kadai Paneer', price: 311 },
      { name: 'Cheese Tomato', price: 333 },
      { name: 'Matar Paneer', price: 279 },
      { name: 'Paneer Adraki', price: 316 },
      { name: 'Malai Kofta', price: 269 },
      { name: 'Paneer Tomato Bhurji', price: 283 },
      { name: 'Paneer Makhanwala', price: 133 },
      { name: 'Paneer Mushroom Butter Masala', price: 301 },
      { name: 'Paneer Tikka Butter Masala', price: 296 },
    ],
  },
  {
    id: 'cat_salad',
    name: 'Salad & Raita',
    items: [
      { name: 'Papad', price: 224 },
      { name: 'Pudina Chutney', price: 356 },
      { name: 'Plain Curd', price: 157 },
      { name: 'Hara Bhara Salad', price: 132 },
      { name: 'Raita of Your Choice', price: 149 },
      { name: 'Mix Raita', price: 209 },
      { name: 'Pineapple Raita', price: 120 },
      { name: 'Dahi Bhalla', price: 394 },
    ],
  },
  {
    id: 'cat_roti',
    name: 'Rotiyon Ki Dawat',
    items: [
      { name: 'Tandoori Roti', price: 319 },
      { name: 'Chapdi Roti', price: 363 },
      { name: 'Plain Naan', price: 198 },
      { name: 'Makki Di Roti', price: 338 },
      { name: 'Missi Roti', price: 305 },
      { name: 'Methi Paratha', price: 238 },
      { name: 'Pudina Parantha', price: 139 },
      { name: 'Butter Naan', price: 149 },
      { name: 'Lachha Parantha', price: 372 },
      { name: 'Red Chilli Parantha', price: 399 },
      { name: 'Green Chilli Parantha', price: 128 },
      { name: 'Loon Ajwain Wala Tawa Parantha', price: 263 },
      { name: 'Ajwain Wala Lachha Parantha', price: 159 },
      { name: 'Garlic Naan', price: 387 },
      { name: 'Stuffed Parantha (Aloo/Gobhi/Mix)', price: 358 },
      { name: 'Stuffed Masala Kulcha', price: 299 },
      { name: 'Paneer Parantha', price: 316 },
      { name: 'Cheese Naan with Gravy', price: 131 },
    ],
  },
  {
    id: 'cat_hot_bev',
    name: 'Hot Beverages',
    items: [
      { name: 'Tea', price: 374 },
      { name: 'Haveli Special Tea', price: 132 },
      { name: 'Green Tea', price: 397 },
      { name: 'Gud Wali Chai', price: 369 },
      { name: 'Adrak Wali Chai', price: 381 },
      { name: 'Coffee', price: 384 },
      { name: 'Cappuccino', price: 245 },
      { name: 'Café Latte', price: 277 },
      { name: 'Latte Macchiato', price: 206 },
      { name: 'Café Mocha', price: 361 },
      { name: 'Vanilla Coffee', price: 119 },
    ],
  },
  {
    id: 'cat_cold_bev',
    name: 'Cold Beverages',
    items: [
      { name: 'Bottled Water', price: 282 },
      { name: 'Soft Drinks', price: 322 },
      { name: 'Pudina Wali Bante Di Bottle', price: 254 },
      { name: 'Fresh Lime', price: 194 },
      { name: 'Roohafza Shikanji', price: 125 },
      { name: 'Chatti Di Lassi', price: 246 },
      { name: 'Sweet Lassi', price: 122 },
      { name: 'Milk Badam', price: 348 },
      { name: 'Choice of Shakes', price: 233 },
      { name: 'Choice of Shakes with Ice Cream', price: 248 },
      { name: 'Cold Coffee', price: 362 },
      { name: 'Cold Coffee with Ice Cream', price: 162 },
      { name: 'Iced Tea (Lemon-Peach)', price: 132 },
      { name: 'Jamun Mojito', price: 394 },
      { name: 'Virgin Mojito', price: 121 },
    ],
  },
  {
    id: 'cat_sandwich',
    name: 'Sandwiches',
    items: [
      { name: 'Vegetable Sandwich', price: 181 },
      { name: 'Veg Cheese Grilled Sandwich', price: 307 },
      { name: 'Three Layered Cheese Grilled Sandwich', price: 156 },
    ],
  },
  {
    id: 'cat_burger',
    name: 'Burgers & Fries',
    items: [
      { name: 'Veg Burger', price: 388 },
      { name: 'Veg & Cheese Burger', price: 230 },
      { name: 'French Fries', price: 215 },
      { name: 'Peri Peri Fries', price: 182 },
      { name: 'Cheese Garlic Bread', price: 186 },
    ],
  },
  {
    id: 'cat_south',
    name: 'South Indian',
    items: [
      { name: 'Idli Sambar', price: 235 },
      { name: 'Vada Sambar', price: 388 },
      { name: 'Plain Dosa', price: 130 },
      { name: 'Masala Dosa', price: 148 },
      { name: 'Paneer Dosa', price: 300 },
    ],
  },
  {
    id: 'cat_chaat',
    name: 'Indian Snacks & Chaat',
    items: [
      { name: 'Paneer Pakora', price: 294 },
      { name: 'Gol Gappe', price: 134 },
      { name: 'Bhalla Papri Chaat', price: 381 },
      { name: 'Palak Patta Chaat', price: 222 },
      { name: 'Raj Kachori', price: 115 },
      { name: 'Aloo Tikki with Chutney', price: 345 },
      { name: 'Aloo Tikki with Chole', price: 389 },
      { name: 'Pav Bhaji', price: 193 },
      { name: 'Matar Kulcha', price: 125 },
      { name: 'Chole Samosa', price: 205 },
      { name: 'Chole Bhature', price: 189 },
    ],
  },
  {
    id: 'cat_chinese',
    name: 'Chinese',
    items: [
      { name: 'Spring Roll', price: 184 },
      { name: 'Fried Rice', price: 167 },
      { name: 'Veg Noodles', price: 197 },
      { name: 'Chilli Garlic Noodles', price: 214 },
      { name: 'Veg Manchurian (Dry/Gravy)', price: 127 },
      { name: 'Honey Chilli Potato', price: 263 },
      { name: 'Cheese Chilli (Dry/Gravy)', price: 244 },
    ],
  },
  {
    id: 'cat_pizza',
    name: 'Pizza',
    items: [
      { name: 'Margherita Pizza', price: 219 },
      { name: 'Veggie Fresh Pizza', price: 178 },
      { name: 'Farm Fresh Pizza', price: 283 },
      { name: 'Paneer Makhani Pizza', price: 214 },
      { name: 'Veg Exotic Pizza', price: 110 },
    ],
  },
  {
    id: 'cat_dessert',
    name: 'Meetha (Desserts)',
    items: [
      { name: 'Phirni', price: 354 },
      { name: 'Gulab Jamun', price: 231 },
      { name: 'Rasmalai', price: 275 },
      { name: 'Jalebi', price: 112 },
      { name: 'Haveli Special Kheer', price: 363 },
      { name: 'Fruit Custard', price: 158 },
      { name: 'Tille Wali Kulfi', price: 142 },
      { name: 'Kulfi Faluda', price: 284 },
      { name: 'Rabri Faluda', price: 397 },
      { name: 'Gajar Halwa (Seasonal)', price: 135 },
      { name: 'Choice of Ice Cream', price: 120 },
      { name: 'Tutti Fruity', price: 177 },
    ],
  },
  {
    id: 'cat_thali',
    name: 'Special Thalis',
    items: [
      { name: 'Haveli Di Special Thali', price: 312 },
      { name: 'Ambarsari Special Thali', price: 344 },
      { name: "Season's Special Thali", price: 166 },
    ],
  },
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

function sqlEscape(str) {
  return str.replace(/'/g, "''");
}

function loadAssetIndex() {
  const files = fs.readdirSync(ASSETS_DIR);
  const byLower = new Map();
  for (const file of files) {
    const base = file.replace(/\.[^.]+$/i, '');
    byLower.set(base.toLowerCase(), file);
  }
  return byLower;
}

function imageForName(name, assetIndex) {
  const alias = IMAGE_FILENAME_ALIASES[name];
  if (alias) return `/assets/${alias}`;

  const match = assetIndex.get(name.toLowerCase());
  if (match) return `/assets/${match}`;

  console.warn(`No image found for "${name}", using placeholder`);
  return PLACEHOLDER;
}

function buildRows() {
  const assetIndex = loadAssetIndex();
  const rows = [];
  let order = 1;
  for (const cat of MENU) {
    cat.displayOrder = order++;
    for (const item of cat.items) {
      const { name, price } = item;
      rows.push({
        id: `mi_${slugify(name)}`,
        name,
        category: cat.name,
        categoryId: cat.id,
        price,
        image: imageForName(name, assetIndex),
      });
    }
  }
  return rows;
}

const rows = buildRows();

const categoryInserts = MENU.map(
  (c) => `  ('${c.id}', '${sqlEscape(c.name)}', ${c.displayOrder}, '')`
).join(',\n');

const itemValues = rows
  .map(
    (r) =>
      `('${r.id}', '${sqlEscape(r.name)}', '${sqlEscape(r.category)}', '${r.categoryId}', ${r.price.toFixed(2)}, '', '${sqlEscape(r.image)}', true, false, now())`
  )
  .join(',\n');

const seedMenuBody = `insert into categories (id, name, display_order, icon) values
${categoryInserts}
on conflict (id) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  icon = excluded.icon;

insert into menu_items
  (id, name, category, category_id, price, description, image_url, is_vegetarian, out_of_stock, updated_at)
values
${itemValues}
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  category_id = excluded.category_id,
  price = excluded.price,
  description = excluded.description,
  image_url = excluded.image_url,
  is_vegetarian = excluded.is_vegetarian,
  out_of_stock = excluded.out_of_stock,
  updated_at = excluded.updated_at;
`;

const sql = `-- =============================================================================
-- HAVELI RESTAURANT — Full menu seed (${rows.length} items, ${MENU.length} categories)
-- Generated by scripts/build-haveli-menu-seed.mjs — re-run that script after menu edits.
--
-- Apply: import into SQLite or adapt for server/db/seed.js.
-- =============================================================================

-- Remove legacy menu items and categories not in this menu
delete from menu_items;
delete from categories;

${seedMenuBody}`;

const outPath = path.join(__dirname, '../sql/seed_haveli_menu.sql');
fs.writeFileSync(outPath, sql, 'utf8');

const categoryOrderPath = path.join(__dirname, '../src/data/categoryOrder.js');
const categoryOrderJs = `/** Haveli menu category display order — used by WaiterApp. */\nexport const CATEGORY_ORDER = [\n${MENU.map((c) => `  '${c.name.replace(/'/g, "\\'")}',`).join('\n')}\n];\n`;
fs.writeFileSync(categoryOrderPath, categoryOrderJs, 'utf8');

console.log(`Wrote ${rows.length} items to ${outPath}`);
console.log(`Wrote category order to ${categoryOrderPath}`);
