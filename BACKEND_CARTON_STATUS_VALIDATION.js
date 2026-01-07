// wms-api/src/validations/schemas.js

// Add this validation schema

const cartonStatusUpdateSchema = {
  type: 'object',
  required: ['asn_no', 'inbound_session'],
  properties: {
    asn_no: {
      type: 'string',
      pattern: '^ASN-\\d{4}$',
      description: 'ASN number in 4-digit format (e.g., ASN-0002)'
    },
    inbound_session: {
      type: 'string',
      description: 'Inbound session identifier'
    },
    // Single carton format
    carton_id: {
      type: 'string',
      description: 'Carton identifier (required for single update)'
    },
    status: {
      type: 'string',
      enum: ['Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed'],
      description: 'Carton status (required for single update)'
    },
    // Batch format
    cartons: {
      type: 'array',
      description: 'Array of carton status objects (required for batch update)',
      items: {
        type: 'object',
        required: ['carton_id', 'status'],
        properties: {
          carton_id: {
            type: 'string',
            description: 'Carton identifier'
          },
          status: {
            type: 'string',
            enum: ['Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed'],
            description: 'Carton status'
          }
        }
      },
      minItems: 1
    },
    // Optional fields
    user_id: {
      type: 'string',
      description: 'User ID who performed the action'
    },
    device_id: {
      type: 'string',
      description: 'Device identifier'
    }
  },
  // Either single or batch format must be provided
  oneOf: [
    {
      required: ['carton_id', 'status'],
      description: 'Single carton update format'
    },
    {
      required: ['cartons'],
      description: 'Batch carton update format'
    }
  ],
  // Cannot have both single and batch fields
  not: {
    allOf: [
      { required: ['carton_id'] },
      { required: ['cartons'] }
    ]
  }
};

module.exports = {
  // ... existing schemas
  cartonStatusUpdateSchema
};

