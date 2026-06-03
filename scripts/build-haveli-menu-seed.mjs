/**
 * Generates sql/seed_haveli_menu.sql from the Haveli restaurant menu.
 * Run: node scripts/build-haveli-menu-seed.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACEHOLDER = '/placeholder.svg';

/** Known images in public/assets that map to menu item names. */
const IMAGE_BY_NAME = {
  'Dal Makhan Wali': '/assets/dal_makhani.png',
  'Subji Biryani': '/assets/mutton_biryani.png',
  'Spring Roll': '/assets/spring_rolls.png',
  'Mushroom Matter': '/assets/mushroom_salt_pepper.png',
  'Kadai Mushroom': '/assets/mushroom_salt_pepper.png',
  'Paneer Tikka Butter Masala': '/assets/paneer_tikka.png',
};

const DEFAULT_PRICE_BY_CATEGORY = {
  'Dalon Ki Bahar': 180,
  'Basmati Ki Khushbu': 160,
  'Handi, Curries & Kadhi, Subziyan': 240,
  'Paneer Specialities': 280,
  'Salad & Raita': 90,
  'Rotiyon Ki Dawat': 55,
  'Hot Beverages': 80,
  'Cold Beverages': 120,
  'Sandwiches': 150,
  'Burgers & Fries': 140,
  'South Indian': 120,
  'Indian Snacks & Chaat': 110,
  'Chinese': 200,
  'Pizza': 320,
  'Meetha (Desserts)': 100,
  'Special Thalis': 399,
};

const MENU = [
  {
    id: 'cat_dal',
    name: 'Dalon Ki Bahar',
    items: [
      'Moong Dal Tadka',
      'Channe Amritsari',
      'Pindi Channa',
      'Urad Ki Sukhi Dal',
      'Rajmah Jammu Wale',
      'Dal Makhan Wali',
    ],
  },
  {
    id: 'cat_rice',
    name: 'Basmati Ki Khushbu',
    items: ['Sada Chawal', 'Jeera Rice', 'Vegetable Pulao', 'Subji Biryani'],
  },
  {
    id: 'cat_handi',
    name: 'Handi, Curries & Kadhi, Subziyan',
    items: [
      'Haveli Special',
      'Bharwan Karela',
      'Aloo Warian Desi',
      'Kadhi Pakora',
      'Achari Aloo',
      'Aloo Jeera',
      'Aloo Gobhi',
      'Mix Vegetable',
      'Baigan Da Bharta',
      'Bhindi Masala',
      'Veg Jaipuri',
      'Veg Kolhapuri',
      'Veg Makhaniwala',
      'Palak Corn Masala',
      'Sarson Da Saag',
      'Matar Methi Malai',
      'Dum Aloo Kashmiri',
      'Mushroom Matter',
      'Kadai Mushroom',
    ],
  },
  {
    id: 'cat_paneer',
    name: 'Paneer Specialities',
    items: [
      'Palak Paneer',
      'Shahi Paneer',
      'Kadai Paneer',
      'Cheese Tomato',
      'Matar Paneer',
      'Paneer Adraki',
      'Malai Kofta',
      'Paneer Tomato Bhurji',
      'Paneer Makhanwala',
      'Paneer Mushroom Butter Masala',
      'Paneer Tikka Butter Masala',
    ],
  },
  {
    id: 'cat_salad',
    name: 'Salad & Raita',
    items: [
      'Papad',
      'Pudina Chutney',
      'Plain Curd',
      'Hara Bhara Salad',
      'Raita of Your Choice',
      'Mix Raita',
      'Pineapple Raita',
      'Dahi Bhalla',
    ],
  },
  {
    id: 'cat_roti',
    name: 'Rotiyon Ki Dawat',
    items: [
      'Tandoori Roti',
      'Chapdi Roti',
      'Plain Naan',
      'Makki Di Roti',
      'Missi Roti',
      'Methi Paratha',
      'Pudina Parantha',
      'Butter Naan',
      'Lachha Parantha',
      'Red Chilli Parantha',
      'Green Chilli Parantha',
      'Loon Ajwain Wala Tawa Parantha',
      'Ajwain Wala Lachha Parantha',
      'Garlic Naan',
      'Stuffed Parantha (Aloo/Gobhi/Mix)',
      'Stuffed Masala Kulcha',
      'Paneer Parantha',
      'Cheese Naan with Gravy',
    ],
  },
  {
    id: 'cat_hot_bev',
    name: 'Hot Beverages',
    items: [
      'Tea',
      'Haveli Special Tea',
      'Green Tea',
      'Gud Wali Chai',
      'Adrak Wali Chai',
      'Coffee',
      'Cappuccino',
      'Café Latte',
      'Latte Macchiato',
      'Café Mocha',
      'Vanilla Coffee',
    ],
  },
  {
    id: 'cat_cold_bev',
    name: 'Cold Beverages',
    items: [
      'Bottled Water',
      'Soft Drinks',
      'Pudina Wali Bante Di Bottle',
      'Fresh Lime',
      'Roohafza Shikanji',
      'Chatti Di Lassi',
      'Sweet Lassi',
      'Milk Badam',
      'Choice of Shakes',
      'Choice of Shakes with Ice Cream',
      'Cold Coffee',
      'Cold Coffee with Ice Cream',
      'Iced Tea (Lemon-Peach)',
      'Jamun Mojito',
      'Virgin Mojito',
    ],
  },
  {
    id: 'cat_sandwich',
    name: 'Sandwiches',
    items: [
      'Vegetable Sandwich',
      'Veg Cheese Grilled Sandwich',
      'Three Layered Cheese Grilled Sandwich',
    ],
  },
  {
    id: 'cat_burger',
    name: 'Burgers & Fries',
    items: [
      'Veg Burger',
      'Veg & Cheese Burger',
      'French Fries',
      'Peri Peri Fries',
      'Cheese Garlic Bread',
    ],
  },
  {
    id: 'cat_south',
    name: 'South Indian',
    items: ['Idli Sambar', 'Vada Sambar', 'Plain Dosa', 'Masala Dosa', 'Paneer Dosa'],
  },
  {
    id: 'cat_chaat',
    name: 'Indian Snacks & Chaat',
    items: [
      'Paneer Pakora',
      'Gol Gappe',
      'Bhalla Papri Chaat',
      'Palak Patta Chaat',
      'Raj Kachori',
      'Aloo Tikki with Chutney',
      'Aloo Tikki with Chole',
      'Pav Bhaji',
      'Matar Kulcha',
      'Chole Samosa',
      'Chole Bhature',
    ],
  },
  {
    id: 'cat_chinese',
    name: 'Chinese',
    items: [
      'Spring Roll',
      'Fried Rice',
      'Veg Noodles',
      'Chilli Garlic Noodles',
      'Veg Manchurian (Dry/Gravy)',
      'Honey Chilli Potato',
      'Cheese Chilli (Dry/Gravy)',
    ],
  },
  {
    id: 'cat_pizza',
    name: 'Pizza',
    items: [
      'Margherita Pizza',
      'Veggie Fresh Pizza',
      'Farm Fresh Pizza',
      'Paneer Makhani Pizza',
      'Veg Exotic Pizza',
    ],
  },
  {
    id: 'cat_dessert',
    name: 'Meetha (Desserts)',
    items: [
      'Phirni',
      'Gulab Jamun',
      'Rasmalai',
      'Jalebi',
      'Haveli Special Kheer',
      'Fruit Custard',
      'Tille Wali Kulfi',
      'Kulfi Faluda',
      'Rabri Faluda',
      'Gajar Halwa (Seasonal)',
      'Choice of Ice Cream',
      'Tutti Fruity',
    ],
  },
  {
    id: 'cat_thali',
    name: 'Special Thalis',
    items: ['Haveli Di Special Thali', 'Ambarsari Special Thali', "Season's Special Thali"],
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

function buildRows() {
  const rows = [];
  let order = 1;
  for (const cat of MENU) {
    cat.displayOrder = order++;
    let priceBase = DEFAULT_PRICE_BY_CATEGORY[cat.name] || 150;
    cat.items.forEach((name, idx) => {
      const id = `mi_${slugify(name)}`;
      const image = IMAGE_BY_NAME[name] || PLACEHOLDER;
      const price = priceBase + (idx % 4) * 20;
      rows.push({
        id,
        name,
        category: cat.name,
        categoryId: cat.id,
        price,
        image,
      });
    });
  }
  return rows;
}

const rows = buildRows();

const categoryInserts = MENU.map(
  (c, i) =>
    `  ('${c.id}', '${sqlEscape(c.name)}', ${c.displayOrder}, '')`
).join(',\n');

const itemValues = rows
  .map(
    (r) =>
      `('${r.id}', '${sqlEscape(r.name)}', '${sqlEscape(r.category)}', '${r.categoryId}', ${r.price.toFixed(2)}, '', '${r.image}', true, false, now())`
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
-- Apply: run in Supabase SQL editor, or psql against local Postgres.
-- =============================================================================

-- Remove legacy menu items and categories not in this menu
delete from menu_items;
delete from categories;

${seedMenuBody}`;

const outPath = path.join(__dirname, '../sql/seed_haveli_menu.sql');
fs.writeFileSync(outPath, sql, 'utf8');

const supabaseSeedPath = path.join(__dirname, '../supabase/seed.sql');
const supabaseSeed = fs.readFileSync(supabaseSeedPath, 'utf8');
const menuMarker = '-- ---------------------------------------------------------------------------\n-- HAVELI MENU';
const menuStart = supabaseSeed.indexOf(menuMarker);
if (menuStart === -1) {
  throw new Error('Could not find HAVELI MENU section in supabase/seed.sql');
}
const supabasePrefix = supabaseSeed.slice(0, menuStart);
const supabaseMenuSection = `-- ---------------------------------------------------------------------------
-- HAVELI MENU (${rows.length} items) — generated by scripts/build-haveli-menu-seed.mjs
-- Production DB: run sql/seed_haveli_menu.sql in Supabase SQL editor to replace menu.
-- ---------------------------------------------------------------------------
${seedMenuBody}`;
fs.writeFileSync(supabaseSeedPath, supabasePrefix + supabaseMenuSection, 'utf8');

const categoryOrderPath = path.join(__dirname, '../src/data/categoryOrder.js');
const categoryOrderJs = `/** Haveli menu category display order — used by WaiterApp. */\nexport const CATEGORY_ORDER = [\n${MENU.map((c) => `  '${c.name.replace(/'/g, "\\'")}',`).join('\n')}\n];\n`;
fs.writeFileSync(categoryOrderPath, categoryOrderJs, 'utf8');

console.log(`Wrote ${rows.length} items to ${outPath}`);
console.log(`Wrote category order to ${categoryOrderPath}`);
console.log(`Updated menu section in ${supabaseSeedPath}`);
