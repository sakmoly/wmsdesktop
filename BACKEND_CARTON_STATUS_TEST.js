// Test file for carton status update API
// Can be used with curl, Postman, or automated tests

// ============================================
// TEST 1: Batch Update (Your JSON Format)
// ============================================
const testBatchUpdate = {
  method: 'POST',
  url: 'http://localhost:3000/api/cartons/update-status',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN_HERE'
  },
  body: JSON.stringify({
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "cartons": [
      { "carton_id": "CTN-0101", "status": "Unloaded" },
      { "carton_id": "CTN-0102", "status": "Unloaded" }
    ],
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  })
};

// Expected Response (200 OK):
// {
//   "success": true,
//   "message": "Carton statuses updated successfully",
//   "updated_count": 2,
//   "cartons": [
//     {
//       "carton_id": "CTN-0101",
//       "status": "Unloaded",
//       "updated": true
//     },
//     {
//       "carton_id": "CTN-0102",
//       "status": "Unloaded",
//       "updated": true
//     }
//   ]
// }

// ============================================
// CURL Command for Testing
// ============================================
/*
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "cartons": [
      { "carton_id": "CTN-0101", "status": "Unloaded" },
      { "carton_id": "CTN-0102", "status": "Unloaded" }
    ],
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
*/

// ============================================
// TEST 2: Single Carton Update
// ============================================
const testSingleUpdate = {
  method: 'POST',
  url: 'http://localhost:3000/api/cartons/update-status',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN_HERE'
  },
  body: JSON.stringify({
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "carton_id": "CTN-0101",
    "status": "Unloaded",
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  })
};

// ============================================
// TEST 3: Error Cases
// ============================================

// Missing required fields
const testMissingFields = {
  body: JSON.stringify({
    "asn_no": "ASN-0002"
    // Missing inbound_session and cartons/carton_id
  })
  // Expected: 400 Bad Request
};

// Invalid status
const testInvalidStatus = {
  body: JSON.stringify({
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-123",
    "cartons": [
      { "carton_id": "CTN-0101", "status": "InvalidStatus" }
    ]
  })
  // Expected: 400 Bad Request - Invalid status
};

// Carton not found
const testNotFound = {
  body: JSON.stringify({
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-123",
    "carton_id": "CTN-9999",
    "status": "Unloaded"
  })
  // Expected: 404 Not Found
};

