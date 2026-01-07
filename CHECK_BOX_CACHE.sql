-- ============================================================
-- CHECK BOX CACHE ISSUES
-- This script helps diagnose box cache problems
-- Note: This is for the mobile app's local SQLite database
-- ============================================================

-- If you have access to the mobile app's local database,
-- you can run these queries to check for issues:

-- 1. Check if box exists in cache
SELECT 
  '=== BOX IN CACHE ===' as Info;

SELECT 
  box_id,
  asn_no,
  store,
  status,
  created_at,
  updated_at
FROM box_cache
WHERE box_id = 'PAW-ASN12223-1707122240030';

-- 2. Check for duplicate boxes
SELECT 
  '=== DUPLICATE BOXES ===' as Info;

SELECT 
  box_id,
  COUNT(*) as duplicate_count
FROM box_cache
GROUP BY box_id
HAVING COUNT(*) > 1;

-- 3. Check all boxes in cache
SELECT 
  '=== ALL BOXES IN CACHE ===' as Info;

SELECT 
  box_id,
  asn_no,
  store,
  status,
  created_at,
  updated_at
FROM box_cache
ORDER BY created_at DESC
LIMIT 20;

-- 4. Check boxes with same ASN
SELECT 
  '=== BOXES WITH SAME ASN ===' as Info;

SELECT 
  box_id,
  asn_no,
  store,
  status
FROM box_cache
WHERE asn_no = 'ASN-12223'
ORDER BY created_at DESC;

-- 5. Delete specific box from cache (if needed)
-- Uncomment to delete:
/*
DELETE FROM box_cache WHERE box_id = 'PAW-ASN12223-1707122240030';
*/

-- 6. Clear all box cache (if needed)
-- Uncomment to clear:
/*
DELETE FROM box_cache;
*/

-- ============================================================
-- NOTE: These queries are for the mobile app's local SQLite
-- database, not the backend MySQL database.
-- 
-- To access the mobile app's database:
-- - Android: Use adb to pull the database file
-- - iOS: Use Xcode or device file explorer
-- - Or use a SQLite browser app
-- ============================================================

