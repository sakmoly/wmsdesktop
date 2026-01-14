# Mobile App - Button State Clarification

## Issue

When Material Request status is **"In Progress"** with **0 items picked** (0/4), the user should still be able to navigate to the picking screen to start picking items.

## Correct Button Behavior

### Status: "In Progress"

**When NOT all items are fully picked (0/4, 1/4, 2/4, etc.):**
- ✅ **Button Text:** "Resume Picking" or "Continue Picking"
- ✅ **Button State:** **ENABLED**
- ✅ **Button Action:** Navigate to picking screen
- ✅ **Purpose:** Allow user to start/resume picking items

**When ALL items are fully picked (4/4):**
- ✅ **Button Text:** "Complete Picking"
- ✅ **Button State:** **ENABLED**
- ✅ **Button Action:** Call `POST /api/material-requests/:title/update-status` with `{ "status": "Picked" }`
- ✅ **Purpose:** Complete the picking process

## Implementation

### Button Display Logic

```javascript
function getButtonState(materialRequest, pickingStatus) {
  switch(materialRequest.status) {
    case 'Submitted':
      return {
        text: 'Start Picking',
        enabled: true,
        action: () => updateStatusToInProgress()
      };
      
    case 'In Progress':
      if (pickingStatus?.all_items_fully_picked) {
        // All items picked - show "Complete Picking"
        return {
          text: 'Complete Picking',
          enabled: true,
          action: () => completePicking()
        };
      } else {
        // Items not fully picked - show "Resume Picking" (ENABLED)
        return {
          text: 'Resume Picking', // or 'Continue Picking'
          enabled: true, // IMPORTANT: Must be enabled!
          action: () => navigateToPickingScreen() // Navigate to picking screen
        };
      }
      
    case 'Picked':
      // ... handle Picked status
      break;
  }
}
```

### Navigation to Picking Screen

When status is "In Progress" and button is clicked:

```javascript
function handleResumePicking(mrTitle) {
  // Navigate to picking screen (do NOT disable button)
  navigation.navigate('PickingScreen', { 
    materialRequestTitle: mrTitle 
  });
}
```

## Key Points

1. ✅ **Button is ALWAYS enabled** when status is "In Progress"
2. ✅ **Button navigates to picking screen** when items are not fully picked
3. ✅ **Button completes picking** when all items are fully picked
4. ✅ **User can resume picking** at any time when status is "In Progress"

## Example Flow

```
Status: "In Progress"
Progress: 0/4 items picked
Button: "Resume Picking" (ENABLED)
↓
User clicks button
↓
Navigate to Picking Screen
↓
User picks items
↓
Status: "In Progress"
Progress: 4/4 items picked
Button: "Complete Picking" (ENABLED)
↓
User clicks button
↓
Status changes to "Picked"
```

---

**Status:** ✅ **CLARIFIED**  
**Date:** 2026-01-12
