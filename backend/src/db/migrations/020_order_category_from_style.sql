-- Order no longer asks for a Product category: the style (made on the Product category screen)
-- carries its Product group and Product class, and the order shows those.
-- Old orders keep the category they had.
ALTER TABLE orders ALTER COLUMN product_category_id DROP NOT NULL;
