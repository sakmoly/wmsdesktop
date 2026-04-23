-- Diagnostic SQL Script: Check if Location A1-R02-L2-B2 Exists
-- Run this script to diagnose location validation errors

-- 1. Check if the specific location exists
SELECT 
  location_id,
  warehouse,
  zone,
  aisle,
  parent_rack,
  level,
  bin_id,
  location_type,
  is_available,
  created_at,
  updated_at
FROM tabLocation 
WHERE location_id = 'A1-R02-L2-B2';

-- 2. If location doesn't exist, check similar locations in the same rack
SELECT 
  location_id,
  warehouse,
  level,
  bin_id,
  is_available
FROM tabLocation 
WHERE location_id LIKE 'A1-R02-%'
ORDER BY level, bin_id;

-- 3. Check all locations in A1 zone
SELECT 
  location_id,
  warehouse,
  zone,
  parent_rack,
  level,
  bin_id,
  is_available
FROM tabLocation 
WHERE zone = 'A1' OR location_id LIKE 'A1-%'
ORDER BY location_id;

-- 4. Count total locations
SELECT COUNT(*) as total_locations FROM tabLocation;

-- 5. List all unavailable locations (might cause validation errors)
SELECT 
  location_id,
  warehouse,
  is_available,
  location_type
FROM tabLocation 
WHERE is_available = FALSE
ORDER BY location_id;

-- 6. Check if location exists but with different case/spacing
SELECT 
  location_id,
  warehouse,
  is_available
FROM tabLocation 
WHERE UPPER(TRIM(location_id)) = UPPER(TRIM('A1-R02-L2-B2'));
