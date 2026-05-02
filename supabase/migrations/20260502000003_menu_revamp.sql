-- =============================================================================
-- Migration: Menu revamp — categories table + is_vegetarian flag
-- Run in Supabase Studio SQL editor or: npx supabase db push
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1: categories table
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id            text primary key,
  name          text not null unique,
  display_order integer not null default 0,
  icon          text null
);

grant select, insert, update, delete on categories to anon, authenticated;

-- ---------------------------------------------------------------------------
-- STEP 2: is_vegetarian flag on menu_items
-- ---------------------------------------------------------------------------
alter table menu_items add column if not exists is_vegetarian boolean not null default false;

-- ---------------------------------------------------------------------------
-- STEP 3: Optional FK from menu_items → categories (by category name match)
--         We keep the existing 'category' text column for backward-compat and
--         just add a category_id that can be populated by the seed.
-- ---------------------------------------------------------------------------
alter table menu_items add column if not exists category_id text null references categories(id);

-- Index for category filtering (replaces the old text-only index)
create index if not exists idx_menu_items_category_id on menu_items (category_id, out_of_stock);

-- ---------------------------------------------------------------------------
-- STEP 4: Realtime for categories (so manager OOS changes propagate)
-- ---------------------------------------------------------------------------
alter table categories replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table categories;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
