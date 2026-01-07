-- ============================================================
-- CHECK TRANSFER CARTON EXISTS
-- Use this to verify if a transfer carton exists in the database
-- ============================================================

-- Step 1: Check for specific transfer carton
SELECT 
  '=== CHECKING FOR TRANSFER CARTON: PAW-ASN12225-1767107840801 ===' as Info;

SELECT 
  tc_id,
  status,
  asn_no,
  to_no,
  store,
  created_by,
  created_on,
  sealed_by,
  sealed_on
FROM tabTransferCarton
WHERE tc_id = 'PAW-ASN12225-1767107840801';

-- Step 2: Check for similar transfer cartons (different format)
SELECT 
  '=== TRANSFER CARTONS FOR ASN-12225 ===' as Info;

SELECT 
  tc_id,
  status,
  asn_no,
  to_no,
  store,
  created_by,
  created_on,
  sealed_by,
  sealed_on
FROM tabTransferCarton
WHERE asn_no = 'ASN-12225'
ORDER BY created_on DESC;

-- Step 3: Check all transfer cartons (recent)
SELECT 
  '=== ALL RECENT TRANSFER CARTONS (Last 20) ===' as Info;

SELECT 
  tc_id,
  status,
  asn_no,
  to_no,
  store,
  created_by,
  created_on
FROM tabTransferCarton
ORDER BY created_on DESC
LIMIT 20;

-- Step 4: Check transfer cartons with similar pattern
SELECT 
  '=== TRANSFER CARTONS LIKE PAW-% OR LIKE %ASN12225% ===' as Info;

SELECT 
  tc_id,
  status,
  asn_no,
  to_no,
  store,
  created_by,
  created_on
FROM tabTransferCarton
WHERE tc_id LIKE 'PAW-%'
   OR tc_id LIKE '%ASN12225%'
   OR tc_id LIKE '%1767107840801%'
ORDER BY created_on DESC;

-- Step 5: Check if transfer carton exists with different ASN column name
SELECT 
  '=== CHECKING WITH advance_shipping_notice COLUMN ===' as Info;

-- This will only work if the column exists
SELECT 
  tc_id,
  status,
  advance_shipping_notice as asn_no,
  transfer_order as to_no,
  store,
  created_by,
  created_on
FROM tabTransferCarton
WHERE advance_shipping_notice = 'ASN-12225'
ORDER BY created_on DESC;

-- ============================================================
-- CREATE TRANSFER CARTON (if needed)
-- ============================================================
-- Uncomment below to manually create the transfer carton
-- WARNING: Only do this if you understand the workflow!

/*
-- Check what columns exist first
DESCRIBE tabTransferCarton;

-- Create transfer carton (adjust column names based on your schema)
-- Option 1: If table uses asn_no and to_no
INSERT INTO tabTransferCarton (
  tc_id,
  status,
  asn_no,
  to_no,
  store,
  created_by,
  created_on
)
VALUES (
  'PAW-ASN12225-1767107840801',
  'Sealed',  -- or 'Created' if not sealed yet
  'ASN-12225',
  NULL,  -- Set to actual TO number if available
  'WAREHOUSE',  -- Set to actual store
  'SYSTEM',  -- Set to actual user
  NOW()
);

-- Option 2: If table uses advance_shipping_notice and transfer_order
INSERT INTO tabTransferCarton (
  tc_id,
  status,
  advance_shipping_notice,
  transfer_order,
  store,
  created_by,
  created_on
)
VALUES (
  'PAW-ASN12225-1767107840801',
  'Sealed',
  'ASN-12225',
  NULL,
  'WAREHOUSE',
  'SYSTEM',
  NOW()
);

-- Verify it was created
SELECT 
  '=== CREATED TRANSFER CARTON ===' as Info,
  tc_id,
  status,
  asn_no,
  store
FROM tabTransferCarton
WHERE tc_id = 'PAW-ASN12225-1767107840801';
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

