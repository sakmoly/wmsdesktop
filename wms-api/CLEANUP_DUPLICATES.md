# Cleanup Duplicate PACK_BOX_TO_TC Events

## Overview

This script removes duplicate `PACK_BOX_TO_TC` events from the database. Duplicates occur when the same box is packed into the same transfer carton multiple times, causing quantities to be doubled in transfer carton views.

## What It Does

The script:
1. Finds all duplicate `PACK_BOX_TO_TC` events (same `tc_id`, `box_id`, `item_code`, `qty`)
2. Keeps the earliest event (based on `event_time`)
3. Deletes all other duplicate events

## Usage

### Prerequisites

1. Ensure `.env` file is configured with database credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=your_user
   DB_PASSWORD=your_password
   DB_NAME=your_database
   ```

2. Make sure you have a backup of your database (recommended)

### Run the Script

```bash
npm run cleanup-duplicates
```

Or directly:
```bash
node cleanup-duplicate-pack-events.js
```

### Output

The script will show:
- Number of duplicate sets found
- Details for each duplicate (tc_id, box_id, item_code, qty)
- Which events are kept and which are deleted
- Total events deleted

Example output:
```
🔍 Finding duplicate PACK_BOX_TO_TC events...

Found 2 sets of duplicate events:

📦 Transfer Carton: TC-1767384318078
   Box: BOX-STORE001-043615
   Item: SKU-HAT-301-BLU-OS
   Quantity: 5
   Duplicate count: 2
   Keeping event ID: 123 (offline_uuid: abc-123...)
   Deleting event IDs: 124
   ✅ Deleted 1 duplicate event(s)

✅ Cleanup complete!
   Total duplicate sets: 2
   Total events deleted: 2
```

## Safety

- **Non-destructive**: Only deletes duplicate events (keeps the earliest)
- **Preview first**: The script shows what will be deleted before deleting
- **Transaction**: Each deletion is done individually (can be interrupted)

## When to Run

Run this script:
- After fixing the duplicate prevention code
- When you notice quantities are doubled in transfer cartons
- As a one-time cleanup after deploying the duplicate prevention fix

## Notes

- The script only removes duplicates for `PACK_BOX_TO_TC` events
- It keeps the earliest event (based on `event_time`)
- Events are matched by: `tc_id`, `box_id`, `item_code`, and `qty`
- After cleanup, the duplicate prevention code will prevent new duplicates

## Troubleshooting

### Script fails to connect

Check your `.env` file has correct database credentials.

### No duplicates found

This is good! It means there are no duplicate events in your database.

### Script deletes too many events

The script only deletes events that are exact duplicates (same tc_id, box_id, item_code, qty). If you're concerned, review the output before running, or create a database backup first.
