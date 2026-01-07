-- ============================================================
-- GENERATE PUTAWAY JSON PAYLOADS FROM AVAILABLE ITEMS
-- This script generates JSON payloads for putaway API endpoints
-- based on actual items in your database
-- ============================================================

-- Step 1: View available items
SELECT '=== AVAILABLE ITEMS ===' as Info;
SELECT code as item_code, name as item_name, stock_qty
FROM tabItem 
ORDER BY code
LIMIT 10;

-- Step 2: Generate JSON for POST /api/putaway/assign-rack
-- This creates JSON payloads to assign rack/bin for putaway lines
SELECT '=== JSON FOR POST /api/putaway/assign-rack ===' as Info;

SELECT 
  CONCAT(
    '{\n',
    '  "putaway_task": "PUT-TEST-001",\n',
    '  "carton_id": "BOX-', code, '-001",\n',
    '  "item_code": "', code, '",\n',
    '  "rack": "A1-R01",\n',
    '  "bin": "L1-B1",\n',
    '  "qty": 50.00,\n',
    '  "user_id": "USER-001"\n',
    '}'
  ) as json_payload
FROM tabItem
LIMIT 5;

-- Step 3: Generate JSON for POST /api/putaway/complete
-- This creates JSON payloads to complete putaway tasks
SELECT '=== JSON FOR POST /api/putaway/complete ===' as Info;

SELECT 
  CONCAT(
    '{\n',
    '  "putaway_task": "PUT-TEST-001",\n',
    '  "performed_by": "USER-001",\n',
    '  "items": [\n',
    GROUP_CONCAT(
      CONCAT(
        '    {\n',
        '      "item_code": "', code, '",\n',
        '      "qty": 50.00,\n',
        '      "source_bin": "DOCK-01",\n',
        '      "target_bin": "A1-R01-L1-B1",\n',
        '      "completed": true\n',
        '    }'
      ) SEPARATOR ',\n'
    ),
    '\n  ]\n',
    '}'
  ) as json_payload
FROM (
  SELECT code FROM tabItem LIMIT 5
) as items;

-- Step 4: Generate JSON for POST /api/putaway/scan-transfer-carton
SELECT '=== JSON FOR POST /api/putaway/scan-transfer-carton ===' as Info;

SELECT 
  CONCAT(
    '{\n',
    '  "tc_id": "TC-TEST-001",\n',
    '  "rack": "A1-R01",\n',
    '  "bin": "L1-B1",\n',
    '  "user_id": "USER-001"\n',
    '}'
  ) as json_payload;

-- Step 5: Generate multiple assign-rack JSON payloads for batch testing
SELECT '=== MULTIPLE ASSIGN-RACK JSON PAYLOADS ===' as Info;

SELECT 
  CONCAT(
    'Payload ', ROW_NUMBER() OVER (ORDER BY code), ':\n',
    '{\n',
    '  "putaway_task": "PUT-TEST-001",\n',
    '  "carton_id": "BOX-', code, '-', LPAD(ROW_NUMBER() OVER (ORDER BY code), 3, '0'), '",\n',
    '  "item_code": "', code, '",\n',
    '  "rack": "A', 
      CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY code) % 3 = 1 THEN '1'
        WHEN ROW_NUMBER() OVER (ORDER BY code) % 3 = 2 THEN '2'
        ELSE '3'
      END,
    '-R0', 
      CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY code) % 2 = 1 THEN '1'
        ELSE '2'
      END,
    '",\n',
    '  "bin": "L', 
      CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY code) % 2 = 1 THEN '1'
        ELSE '2'
      END,
    '-B', 
      CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY code) % 4 = 1 THEN '1'
        WHEN ROW_NUMBER() OVER (ORDER BY code) % 4 = 2 THEN '2'
        WHEN ROW_NUMBER() OVER (ORDER BY code) % 4 = 3 THEN '3'
        ELSE '4'
      END,
    '",\n',
    '  "qty": ', (ROW_NUMBER() OVER (ORDER BY code) * 10), '.00,\n',
    '  "user_id": "USER-001"\n',
    '}'
  ) as json_payload
FROM tabItem
LIMIT 5;

-- ============================================================
-- END OF GENERATION SCRIPT
-- ============================================================

