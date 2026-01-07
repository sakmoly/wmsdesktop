-- Migration 004: Make purchase_order nullable in tabAdvanceShippingNotice
-- This allows ASN imports without Purchase Order numbers
-- Date: 2025-01-XX

-- Alter table to allow NULL for purchase_order
ALTER TABLE tabAdvanceShippingNotice 
MODIFY COLUMN purchase_order VARCHAR(100) NULL;

-- Note: The index on purchase_order will still work with NULL values
-- MySQL allows NULL values in indexed columns

