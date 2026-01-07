-- Migration Script: Update "In Receiving" to "Receiving" in tabCartonStatus
-- Run this script to update existing records in the database

-- Update existing "In Receiving" status to "Receiving" in tabCartonStatus
UPDATE tabCartonStatus
SET status = 'Receiving',
    updated_on = NOW()
WHERE status = 'In Receiving';

-- Verify the update
SELECT 
    COUNT(*) as total_records,
    SUM(CASE WHEN status = 'Receiving' THEN 1 ELSE 0 END) as receiving_count,
    SUM(CASE WHEN status = 'In Receiving' THEN 1 ELSE 0 END) as old_status_count
FROM tabCartonStatus;

-- Expected result: old_status_count should be 0 after migration

