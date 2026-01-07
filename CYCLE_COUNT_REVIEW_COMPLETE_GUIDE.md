# Cycle Count Review and Complete Guide

## Overview

This guide explains how to review and complete Cycle Count tasks in the desktop application.

---

## Cycle Count Workflow

### Status Flow:
1. **Draft** → Task created but not started
2. **In Progress** → Task started, items being counted
3. **Review** → All items counted, discrepancies found (requires review)
4. **Completed** → Task completed, stock adjustments made (if any)

---

## How to Submit a Cycle Count

### When to Submit:
- Status is **"In Progress"**
- All items have been counted (Counted Items = Total Items)

### Steps:
1. Open the Cycle Count Task detail window (double-click on a task in the list)
2. Verify that all items are counted (check the statistics)
3. Click the **"Submit"** button
4. The system will:
   - Check if all items are counted
   - If discrepancies exist → Status changes to **"Review"**
   - If no discrepancies → Status changes to **"Completed"**

### Submit Button:
- **Location:** Bottom right of the detail window
- **Enabled when:** Status is "In Progress"
- **API Endpoint:** `POST /api/cycle-count/:title/submit`

---

## How to Complete a Cycle Count

### When to Complete:
- Status is **"Review"** (discrepancies found)
- Stock adjustments have been made (if needed)
- Ready to finalize the count

### Steps:
1. Open the Cycle Count Task detail window
2. Review discrepancies in the lines grid
3. Make stock adjustments if needed (outside the Cycle Count module)
4. Click the **"Complete"** button
5. The system will:
   - Change status to **"Completed"**
   - Unfreeze stock (if it was frozen)

### Complete Button:
- **Location:** Bottom right of the detail window
- **Enabled when:** Status is "Review"
- **API Endpoint:** `POST /api/cycle-count/:title/complete`

---

## Desktop Application Features

### Detail Window Buttons:

#### Submit Button
- **Color:** Blue (#3B82F6)
- **Text:** "Submit"
- **Enabled:** When status is "In Progress"
- **Action:** Submits the cycle count for review

#### Complete Button
- **Color:** Green (#10B981)
- **Text:** "Complete"
- **Enabled:** When status is "Review"
- **Action:** Completes the cycle count and unfreezes stock

### Statistics Display:
- **Total Lines:** Total number of items to count
- **Counted:** Number of items that have been counted
- **Pending:** Number of items not yet counted
- **With Discrepancy:** Number of items with variance

### Summary:
- **Total Expected Qty:** Sum of all expected quantities
- **Total Actual Qty:** Sum of all counted quantities
- **Total Discrepancy:** Difference between expected and actual

---

## API Endpoints

### Submit Cycle Count
```
POST /api/cycle-count/:title/submit
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task submitted successfully. Status: Review",
  "data": {
    "title": "CC-0001",
    "status": "Review",
    "items_with_discrepancy": 2
  }
}
```

**Validation:**
- Task must be in "In Progress" status
- All items must be counted (counted_items = total_items)

**Status Logic:**
- If `items_with_discrepancy > 0` → Status = "Review"
- If `items_with_discrepancy = 0` → Status = "Completed"

---

### Complete Cycle Count
```
POST /api/cycle-count/:title/complete
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task completed successfully",
  "data": {
    "title": "CC-0001",
    "status": "Completed"
  }
}
```

**Validation:**
- Task must not already be "Completed"

**Actions:**
- Changes status to "Completed"
- Unfreezes stock (sets `freeze_stock = FALSE`)

---

## Error Handling

### Common Errors:

#### 1. "Cannot submit Cycle Count Task. Current status: Draft"
- **Cause:** Task hasn't been started yet
- **Solution:** Start the task first (change status to "In Progress")

#### 2. "Not all items have been counted. Counted: 5/10"
- **Cause:** Some items haven't been counted yet
- **Solution:** Count all items before submitting

#### 3. "Cycle Count Task is already completed"
- **Cause:** Trying to complete an already completed task
- **Solution:** No action needed, task is already complete

#### 4. "API endpoint or key not configured"
- **Cause:** Settings not configured in desktop app
- **Solution:** Configure API endpoint and key in Settings

---

## Best Practices

1. **Review Discrepancies:** Before completing, review all items with discrepancies
2. **Stock Adjustments:** Make stock adjustments before completing (if needed)
3. **Documentation:** Document reasons for discrepancies in the `discrepancy_reason` field
4. **Verification:** Verify all counts are accurate before submitting
5. **Timing:** Complete cycle counts promptly after review to unfreeze stock

---

## Workflow Example

### Example 1: Cycle Count with No Discrepancies
1. Task created: Status = "Draft"
2. Task started: Status = "In Progress"
3. All items counted via mobile app
4. Click "Submit" → Status = "Completed" (no discrepancies)
5. Done! ✅

### Example 2: Cycle Count with Discrepancies
1. Task created: Status = "Draft"
2. Task started: Status = "In Progress"
3. All items counted via mobile app
4. Click "Submit" → Status = "Review" (discrepancies found)
5. Review discrepancies in detail window
6. Make stock adjustments (if needed)
7. Click "Complete" → Status = "Completed"
8. Done! ✅

---

## Notes

- **Stock Freeze:** If `freeze_stock = TRUE`, stock is frozen during counting. It's automatically unfrozen when the task is completed.
- **Auto-Refresh:** The detail window automatically refreshes after submit/complete actions.
- **List Refresh:** The main list view should be refreshed to see updated statuses.

