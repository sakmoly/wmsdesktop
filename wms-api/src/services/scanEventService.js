/**
 * scanEventService.js
 * Centralized service for inserting scan events
 * Ensures box_id and store are NEVER NULL
 */

/**
 * Insert scan event with guaranteed box_id and store
 * 
 * @param {Connection} db - Database connection
 * @param {Object} params - Event parameters
 * @param {string} params.event_type - Event type (e.g., 'PUTAWAY_TO_RACK', 'SORT_TO_BOX')
 * @param {string} params.source_type - Source type: 'ASN' or 'TransferIn'
 * @param {string} params.source_doc - Source document: 'ASN-xxxxx' or 'INSLIP-xxxxx'
 * @param {string} params.warehouse - Warehouse code (e.g., 'WH-MAIN')
 * @param {string} params.carton_id - Carton ID (CTN-* format)
 * @param {string} params.user_id - User ID
 * @param {Object} params.payload - Additional event payload (optional)
 * @param {string} [params.item_code] - Item code (optional)
 * @param {number} [params.qty] - Quantity (optional)
 * @param {string} [params.rack] - Rack (optional)
 * @param {string} [params.bin] - Bin (optional)
 * @param {string} [params.location_id] - Location ID (optional)
 * @param {string} [params.offline_uuid] - Offline UUID for deduplication (optional)
 * @param {Date} [params.event_time] - Event time (defaults to NOW())
 * @param {string} [params.device_id] - Device ID (optional)
 * @param {string} [params.notes] - Notes (optional)
 */
export async function insertScanEvent(db, {
  event_type,
  source_type,
  source_doc,
  warehouse,
  carton_id,
  user_id,
  payload = {},
  item_code = null,
  qty = null,
  rack = null,
  bin = null,
  location_id = null,
  offline_uuid = null,
  event_time = null,
  device_id = null,
  notes = null
}) {
  // CRITICAL: box_id = carton_id (always)
  const box_id = carton_id || null;
  
  // CRITICAL: store = warehouse (mapping store=warehouse)
  const store = warehouse || null;

  // Generate offline_uuid if not provided
  if (!offline_uuid) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    offline_uuid = `EVT-${timestamp}-${random}`;
  }

  // Use current time if not provided
  const eventTime = event_time || new Date();

  // Check which columns exist in tabWmsScanEvent
  const [columns] = await db.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabWmsScanEvent'
      AND COLUMN_NAME IN (
        'offline_uuid', 'event_type', 'event_time', 'device_id', 'user_id',
        'advance_shipping_notice', 'transfer_order', 'transfer_in', 'inbound_session',
        'carton_id', 'item_code', 'qty', 'store', 'box_id', 'tc_id',
        'rack', 'bin', 'location_id', 'notes', 'source_type', 'title', 'warehouse'
      )
  `);

  const columnNames = new Set(columns.map(col => col.COLUMN_NAME));
  
  // Build INSERT statement dynamically
  const insertFields = [];
  const insertValues = [];
  const placeholders = [];

  // Required fields
  if (columnNames.has('offline_uuid')) {
    insertFields.push('offline_uuid');
    insertValues.push(offline_uuid);
    placeholders.push('?');
  }

  if (columnNames.has('event_type')) {
    insertFields.push('event_type');
    insertValues.push(event_type);
    placeholders.push('?');
  }

  if (columnNames.has('event_time')) {
    insertFields.push('event_time');
    insertValues.push(eventTime);
    placeholders.push('?');
  }

  if (columnNames.has('device_id') && device_id) {
    insertFields.push('device_id');
    insertValues.push(device_id);
    placeholders.push('?');
  }

  if (columnNames.has('user_id') && user_id) {
    insertFields.push('user_id');
    insertValues.push(user_id);
    placeholders.push('?');
  }

  // Source type and document
  if (columnNames.has('source_type') && source_type) {
    insertFields.push('source_type');
    insertValues.push(source_type);
    placeholders.push('?');
  }

  if (columnNames.has('title') && source_doc) {
    insertFields.push('title');
    insertValues.push(source_doc);
    placeholders.push('?');
  }

  // ASN/Transfer In fields
  if (columnNames.has('advance_shipping_notice') && source_type === 'ASN' && source_doc) {
    insertFields.push('advance_shipping_notice');
    insertValues.push(source_doc);
    placeholders.push('?');
  }

  if (columnNames.has('transfer_in') && source_type === 'TransferIn' && source_doc) {
    insertFields.push('transfer_in');
    insertValues.push(source_doc);
    placeholders.push('?');
  }

  if (columnNames.has('transfer_order') && payload.transfer_order) {
    insertFields.push('transfer_order');
    insertValues.push(payload.transfer_order);
    placeholders.push('?');
  }

  if (columnNames.has('inbound_session') && payload.inbound_session) {
    insertFields.push('inbound_session');
    insertValues.push(payload.inbound_session);
    placeholders.push('?');
  }

  // CRITICAL: carton_id, box_id, store, warehouse (always set)
  if (columnNames.has('carton_id') && carton_id) {
    insertFields.push('carton_id');
    insertValues.push(carton_id);
    placeholders.push('?');
  }

  if (columnNames.has('box_id') && box_id) {
    insertFields.push('box_id');
    insertValues.push(box_id);
    placeholders.push('?');
  }

  if (columnNames.has('store') && store) {
    insertFields.push('store');
    insertValues.push(store);
    placeholders.push('?');
  }

  if (columnNames.has('warehouse') && warehouse) {
    insertFields.push('warehouse');
    insertValues.push(warehouse);
    placeholders.push('?');
  }

  // Optional fields
  if (columnNames.has('item_code') && item_code) {
    insertFields.push('item_code');
    insertValues.push(item_code);
    placeholders.push('?');
  }

  if (columnNames.has('qty') && qty !== null) {
    insertFields.push('qty');
    insertValues.push(qty);
    placeholders.push('?');
  }

  if (columnNames.has('rack') && rack) {
    insertFields.push('rack');
    insertValues.push(rack);
    placeholders.push('?');
  }

  if (columnNames.has('bin') && bin) {
    insertFields.push('bin');
    insertValues.push(bin);
    placeholders.push('?');
  }

  if (columnNames.has('location_id') && location_id) {
    insertFields.push('location_id');
    insertValues.push(location_id);
    placeholders.push('?');
  }

  if (columnNames.has('tc_id') && payload.tc_id) {
    insertFields.push('tc_id');
    insertValues.push(payload.tc_id);
    placeholders.push('?');
  }

  if (columnNames.has('notes') && notes) {
    insertFields.push('notes');
    insertValues.push(notes);
    placeholders.push('?');
  }

  // Execute INSERT
  if (insertFields.length === 0) {
    throw new Error('No valid columns found for tabWmsScanEvent');
  }

  const sql = `
    INSERT IGNORE INTO tabWmsScanEvent (${insertFields.join(', ')})
    VALUES (${placeholders.join(', ')})
  `;

  const [result] = await db.execute(sql, insertValues);

  return {
    success: result.affectedRows > 0,
    offline_uuid,
    affectedRows: result.affectedRows
  };
}
