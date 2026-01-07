# Carton Status Not Showing - Debug Fix

## Issue
The carton status is being updated in the backend (`tabReceivingCarton` table), but the desktop app is still showing "Assigned" instead of "Unloaded".

## Root Cause
**ASN Format Mismatch:**
- Backend normalizes ASN to **5-digit format**: `ASN-00002`
- Desktop app may store ASN in **4-digit format**: `ASN-0002`
- The JOIN condition fails because `ASN-0002` ≠ `ASN-00002`

## Fix Applied
Updated the SQL query in `Services/AsnDataService.cs` to handle both ASN formats in the JOIN condition:

```sql
AND (
    d.parent_title = rc_latest.advance_shipping_notice
    OR CONCAT(SUBSTRING_INDEX(rc_latest.advance_shipping_notice, '-', 1), '-', 
              LPAD(SUBSTRING_INDEX(rc_latest.advance_shipping_notice, '-', -1), 4, '0')) = d.parent_title
    OR CONCAT(SUBSTRING_INDEX(d.parent_title, '-', 1), '-', 
              LPAD(SUBSTRING_INDEX(d.parent_title, '-', -1), 5, '0')) = rc_latest.advance_shipping_notice
)
```

This ensures the JOIN works regardless of whether:
- `tabAsnItemDetails.parent_title` = "ASN-0002" (4-digit)
- `tabReceivingCarton.advance_shipping_notice` = "ASN-00002" (5-digit)

## Testing Steps

1. **Close and reopen the ASN Details window** to trigger the refresh
2. **Check the Carton Status column** - should now show "Unloaded" instead of "Assigned"
3. **Verify in database:**
   ```sql
   SELECT carton_id, advance_shipping_notice, status 
   FROM tabReceivingCarton 
   WHERE advance_shipping_notice LIKE 'ASN-000%2';
   ```

## Additional Debugging

If status still doesn't show:

1. **Check if data exists in tabReceivingCarton:**
   ```sql
   SELECT * FROM tabReceivingCarton 
   WHERE carton_id IN ('CTN-0101', 'CTN-0102') 
     AND advance_shipping_notice LIKE 'ASN-000%2';
   ```

2. **Check ASN format in tabAsnItemDetails:**
   ```sql
   SELECT DISTINCT parent_title FROM tabAsnItemDetails 
   WHERE parent_title LIKE 'ASN-000%2';
   ```

3. **Test the JOIN manually:**
   ```sql
   SELECT d.parent_title, rc.advance_shipping_notice, rc.status
   FROM tabAsnItemDetails d
   LEFT JOIN tabReceivingCarton rc ON d.carton_id = rc.carton_id
   WHERE d.parent_title LIKE 'ASN-000%2'
     AND d.carton_id IN ('CTN-0101', 'CTN-0102');
   ```

## Expected Result

After reopening the ASN Details window:
- **CTN-0101**: Should show "Unloaded" (or "In Receiving" if locked)
- **CTN-0102**: Should show "Unloaded"

The yellow highlighted "Carton Status" column should now reflect the actual status from `tabReceivingCarton` instead of the static "Assigned" from `tabAsnItemDetails`.

