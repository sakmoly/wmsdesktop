// Server-authoritative pack: one closed sort box -> open transfer carton (transactional).

import { randomUUID } from "node:crypto";
import { getConnection } from "../../db/connection.js";
import {
  getWmsScanEventSortColumns,
  getSortToBoxContentsDesktop,
} from "../boxes/boxController.js";
import { updateTransferOrderQuantities } from "../transfer-orders/updateTransferOrderQuantities.js";

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Set<string>} eventColumns
 */
async function insertPackBoxToTcEvent(connection, eventColumns, row) {
  const {
    offlineUuid,
    userId,
    deviceId,
    cartonId,
    itemCode,
    qty,
    tcId,
    store,
    boxId,
    asnNo,
    transferOrder,
  } = row;

  const insertFields = [
    "offline_uuid",
    "event_type",
    "event_time",
    "device_id",
    "user_id",
    "carton_id",
    "item_code",
    "qty",
    "tc_id",
    "store",
    "box_id",
  ];
  const insertValues = ["?", "?", "NOW()", "?", "?", "?", "?", "?", "?", "?", "?"];
  const insertParams = [
    offlineUuid,
    "PACK_BOX_TO_TC",
    deviceId || "SERVER-PACK",
    userId,
    cartonId || null,
    itemCode,
    qty,
    tcId,
    store,
    boxId,
  ];

  if (eventColumns.has("advance_shipping_notice") && asnNo) {
    insertFields.push("advance_shipping_notice");
    insertValues.push("?");
    insertParams.push(asnNo);
  }
  if (eventColumns.has("asn_no") && asnNo) {
    insertFields.push("asn_no");
    insertValues.push("?");
    insertParams.push(asnNo);
  }
  if (eventColumns.has("to_no") && transferOrder) {
    insertFields.push("to_no");
    insertValues.push("?");
    insertParams.push(transferOrder);
  }
  if (eventColumns.has("transfer_order") && transferOrder) {
    insertFields.push("transfer_order");
    insertValues.push("?");
    insertParams.push(transferOrder);
  }
  if (eventColumns.has("material_request") && transferOrder) {
    insertFields.push("material_request");
    insertValues.push("?");
    insertParams.push(transferOrder);
  }

  await connection.execute(
    `
    INSERT INTO tabWmsScanEvent (${insertFields.join(", ")})
    VALUES (${insertValues.join(", ")})
  `,
    insertParams
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} tcId
 * @param {string} boxId
 */
async function getPackedQtyForBoxInTc(connection, tcId, boxId) {
  const [r] = await connection.execute(
    `
    SELECT COALESCE(SUM(qty), 0) AS total
    FROM tabWmsScanEvent
    WHERE tc_id = ?
      AND box_id = ?
      AND event_type = 'PACK_BOX_TO_TC'
      AND item_code IS NOT NULL
  `,
    [tcId, boxId]
  );
  return parseFloat(r[0]?.total || 0) || 0;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} tcId
 */
async function getDistinctPackedBoxIds(connection, tcId) {
  const [rows] = await connection.execute(
    `
    SELECT DISTINCT NULLIF(TRIM(box_id), '') AS box_id
    FROM tabWmsScanEvent
    WHERE tc_id = ?
      AND event_type = 'PACK_BOX_TO_TC'
      AND item_code IS NOT NULL
      AND box_id IS NOT NULL
      AND TRIM(box_id) <> ''
    ORDER BY box_id
  `,
    [tcId]
  );
  return rows.map((x) => x.box_id).filter(Boolean);
}

async function hasReceivedCartonLine(connection, inboundSession, cartonId, itemCode, qty) {
  if (!cartonId || !itemCode) return false;

  const params = [];
  let sessionFilter = "";
  if (inboundSession) {
    sessionFilter = "AND parent_title = ?";
    params.push(inboundSession);
  }

  const [rows] = await connection.execute(
    `
    SELECT COALESCE(SUM(received_qty), 0) AS received_qty
    FROM tabInboundReceiveLine
    WHERE carton_id = ?
      AND item_code = ?
      ${sessionFilter}
  `,
    [cartonId, itemCode, ...params]
  );

  return (parseFloat(rows[0]?.received_qty || 0) || 0) >= qty;
}

async function isReceivingCartonReceived(connection, inboundSession, asnNo, cartonId) {
  if (!cartonId) return false;

  const [asnCols] = await connection.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabReceivingCarton'
      AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice')
  `);
  const asnColumn = asnCols.some((row) => row.COLUMN_NAME === "asn_no")
    ? "asn_no"
    : "advance_shipping_notice";

  const params = [cartonId];
  let extra = "";
  if (inboundSession) {
    extra += " AND inbound_session = ?";
    params.push(inboundSession);
  }
  if (asnNo) {
    extra += ` AND \`${asnColumn}\` = ?`;
    params.push(asnNo);
  }

  const [rows] = await connection.execute(
    `
    SELECT status
    FROM tabReceivingCarton
    WHERE carton_id = ?
      ${extra}
    ORDER BY updated_on DESC
    LIMIT 1
  `,
    params
  );

  return String(rows[0]?.status || "").trim().toUpperCase() === "RECEIVED";
}

/**
 * POST /api/transfer-cartons/:tc_id/pack-box
 */
export async function packBoxIntoTransferCarton(req, res) {
  const tcId = req.params.tc_id?.trim();
  const { asn_no, box_id, store, user_id, device_id } = req.body || {};

  const boxIdNorm = box_id != null ? String(box_id).trim() : "";
  const storeNorm = store != null ? String(store).trim() : "";
  const userIdNorm = user_id != null ? String(user_id).trim() : "";
  const bodyAsnNorm =
    asn_no != null && String(asn_no).trim() !== "" ? String(asn_no).trim() : null;

  if (!tcId) {
    return res.status(400).json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "tc_id is required in the URL path" },
    });
  }
  if (!boxIdNorm) {
    return res.status(400).json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "box_id is required in the body" },
    });
  }
  if (!storeNorm) {
    return res.status(400).json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "store is required in the body" },
    });
  }
  if (!userIdNorm) {
    return res.status(400).json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "user_id is required in the body" },
    });
  }

  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allTcCols = new Set(tableInfo.map((row) => row.Field));
    const asnColumn = allTcCols.has("asn_no")
      ? "asn_no"
      : allTcCols.has("advance_shipping_notice")
        ? "advance_shipping_notice"
        : null;
    const toColumn = allTcCols.has("to_no")
      ? "to_no"
      : allTcCols.has("transfer_order")
        ? "transfer_order"
        : null;

    if (!asnColumn || !toColumn) {
      await connection.rollback();
      return res.status(500).json({
        ok: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "tabTransferCarton must have asn (asn_no or advance_shipping_notice) and TO (to_no or transfer_order)",
        },
      });
    }

    const [tcRows] = await connection.execute(
      `
      SELECT tc_id, status, store, \`${asnColumn}\` AS asn_no, \`${toColumn}\` AS to_no
      FROM tabTransferCarton
      WHERE tc_id = ?
      FOR UPDATE
    `,
      [tcId]
    );

    if (tcRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: `Transfer carton ${tcId} not found` },
      });
    }

    const tc = tcRows[0];
    const tcStatus = String(tc.status || "").trim();
    const allowedTc = new Set(["Open", "Created", "Filling"]);
    if (!allowedTc.has(tcStatus)) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_TC_STATUS",
          message: `Cannot pack into transfer carton ${tcId} with status "${tcStatus}". Status must be Open, Created, or Filling.`,
        },
      });
    }

    const tcStoreNorm = String(tc.store || "").trim();
    if (tcStoreNorm !== storeNorm) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "STORE_MISMATCH",
          message: `Request store "${storeNorm}" does not match transfer carton store "${tcStoreNorm}".`,
        },
      });
    }

    const tcAsnNorm =
      tc.asn_no != null && String(tc.asn_no).trim() !== ""
        ? String(tc.asn_no).trim()
        : null;
    if (tcAsnNorm && bodyAsnNorm !== tcAsnNorm) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "ASN_MISMATCH",
          message: `Request asn_no does not match transfer carton ASN.`,
          details: { expected: tcAsnNorm, provided: bodyAsnNorm },
        },
      });
    }
    if (tcAsnNorm && !bodyAsnNorm) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "asn_no is required in the body for this transfer carton.",
        },
      });
    }

    const [boxRows] = await connection.execute(
      `
      SELECT box_id, status, advance_shipping_notice AS asn_no, store, transfer_order AS to_no
      FROM tabSortBox
      WHERE box_id = ?
      FOR UPDATE
    `,
      [boxIdNorm]
    );

    if (boxRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: { code: "BOX_NOT_FOUND", message: `Sort box ${boxIdNorm} not found` },
      });
    }

    const box = boxRows[0];
    const boxStatus = String(box.status || "").trim().toLowerCase();

    const boxAsnNorm =
      box.asn_no != null && String(box.asn_no).trim() !== ""
        ? String(box.asn_no).trim()
        : null;
    if (bodyAsnNorm && boxAsnNorm && bodyAsnNorm !== boxAsnNorm) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "BOX_ASN_MISMATCH",
          message: "asn_no does not match this sort box.",
          details: { box_asn: boxAsnNorm, provided: bodyAsnNorm },
        },
      });
    }

    const boxStoreNorm = String(box.store || "").trim();
    if (boxStoreNorm !== storeNorm) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "BOX_STORE_MISMATCH",
          message: `Request store does not match sort box store.`,
          details: { box_store: boxStoreNorm, provided: storeNorm },
        },
      });
    }

    const [otherTc] = await connection.execute(
      `
      SELECT DISTINCT tc_id
      FROM tabWmsScanEvent
      WHERE event_type = 'PACK_BOX_TO_TC'
        AND item_code IS NOT NULL
        AND box_id = ?
        AND tc_id IS NOT NULL
        AND tc_id <> ?
    `,
      [boxIdNorm, tcId]
    );

    if (otherTc.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        error: {
          code: "ALREADY_PACKED_IN_OTHER_TC",
          message: `Box ${boxIdNorm} already has pack events on another transfer carton.`,
          details: { other_tc_ids: otherTc.map((r) => r.tc_id) },
        },
      });
    }

    const [existingThisTc] = await connection.execute(
      `
      SELECT COUNT(*) AS c
      FROM tabWmsScanEvent
      WHERE event_type = 'PACK_BOX_TO_TC'
        AND item_code IS NOT NULL
        AND box_id = ?
        AND tc_id = ?
    `,
      [boxIdNorm, tcId]
    );

    const isIdempotent = Number(existingThisTc[0]?.c || 0) > 0;

    if (!isIdempotent && boxStatus !== "closed") {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "BOX_NOT_CLOSED",
          message: `Sort box ${boxIdNorm} must be Closed before packing. Current status: ${box.status}`,
        },
      });
    }
    if (isIdempotent && boxStatus !== "closed" && boxStatus !== "packed") {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "BOX_INVALID_STATE",
          message: `Cannot replay pack for box ${boxIdNorm} in status "${box.status}".`,
        },
      });
    }

    const transferOrder =
      tc.to_no != null && String(tc.to_no).trim() !== "" ? String(tc.to_no).trim() : null;
    const asnForEvent = bodyAsnNorm || boxAsnNorm || tcAsnNorm || null;

    let contents = [];
    if (!isIdempotent) {
      const sortCols = await getWmsScanEventSortColumns(connection);
      contents = await getSortToBoxContentsDesktop(connection, boxIdNorm, sortCols);

      if (!contents.length) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "BOX_EMPTY",
            message: `No SORT_TO_BOX lines found for box ${boxIdNorm}; nothing to pack.`,
          },
        });
      }

      const [cartonStockTable] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCartonStock'
      `);
      const isCartonLevelMode = cartonStockTable.length > 0;

      for (const line of contents) {
        const qty = Number(line.scanned_qty) || 0;
        if (qty <= 0) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "INVALID_QTY",
              message: `Non-positive merged qty for item ${line.item_code} in box ${boxIdNorm}.`,
            },
          });
        }
        if (isCartonLevelMode) {
          const cid = line.source_carton != null ? String(line.source_carton).trim() : "";
          if (!cid) {
            await connection.rollback();
            return res.status(400).json({
              ok: false,
              error: {
                code: "CARTON_ID_REQUIRED",
                message: `Carton-level inventory is enabled; carton_id is required for item ${line.item_code} in box ${boxIdNorm}.`,
              },
            });
          }
          const [stock] = await connection.execute(
            `
            SELECT carton_id, item_code, qty
            FROM tabCartonStock
            WHERE carton_id = ?
              AND item_code = ?
              AND qty > 0
              AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
            LIMIT 1
          `,
            [cid, line.item_code]
          );
          if (stock.length === 0) {
            const receivedLineOk = await hasReceivedCartonLine(
              connection,
              null,
              cid,
              line.item_code,
              qty
            );
            const receivedCartonOk = await isReceivingCartonReceived(
              connection,
              null,
              asnForEvent,
              cid
            );

            if (!receivedLineOk || !receivedCartonOk) {
              await connection.rollback();
              return res.status(400).json({
                ok: false,
                error: {
                  code: "CARTON_NOT_IN_STOCK",
                  message: `Carton ${cid} not found in tabCartonStock for item ${line.item_code}.`,
                  details: {
                    received_line_found: receivedLineOk,
                    receiving_carton_received: receivedCartonOk,
                  },
                },
              });
            }

            console.warn(
              `[pack-box] Carton ${cid} item ${line.item_code} missing from tabCartonStock; allowing pack because receive line and Received carton status exist.`
            );
          }
        }
      }
    }

    const [eventTableInfo] = await connection.execute(`DESCRIBE tabWmsScanEvent`);
    const eventColumns = new Set(eventTableInfo.map((row) => row.Field));

    if (!isIdempotent) {
      for (const line of contents) {
        const qty = Number(line.scanned_qty) || 0;
        const cid = line.source_carton != null ? String(line.source_carton).trim() : null;
        const offlineUuid = randomUUID();
        await insertPackBoxToTcEvent(connection, eventColumns, {
          offlineUuid,
          userId: userIdNorm,
          deviceId: device_id != null ? String(device_id).trim() : null,
          cartonId: cid,
          itemCode: line.item_code,
          qty,
          tcId,
          store: storeNorm,
          boxId: boxIdNorm,
          asnNo: asnForEvent,
          transferOrder,
        });
      }

      const [sbCols] = await connection.execute(`DESCRIBE tabSortBox`);
      const sbFields = new Set(sbCols.map((r) => r.Field));
      const setParts = ["status = 'Packed'"];
      if (sbFields.has("updated_on")) {
        setParts.push("updated_on = NOW()");
      }
      await connection.execute(
        `UPDATE tabSortBox SET ${setParts.join(", ")} WHERE box_id = ?`,
        [boxIdNorm]
      );
    } else if (boxStatus === "closed") {
      const [sbCols] = await connection.execute(`DESCRIBE tabSortBox`);
      const sbFields = new Set(sbCols.map((r) => r.Field));
      const setParts = ["status = 'Packed'"];
      if (sbFields.has("updated_on")) {
        setParts.push("updated_on = NOW()");
      }
      await connection.execute(
        `UPDATE tabSortBox SET ${setParts.join(", ")} WHERE box_id = ? AND LOWER(TRIM(status)) = 'closed'`,
        [boxIdNorm]
      );
    }

    if (transferOrder) {
      try {
        await updateTransferOrderQuantities(transferOrder, connection);
      } catch (e) {
        console.warn("[pack-box] updateTransferOrderQuantities:", e?.message || e);
      }
    }

    await connection.commit();

    const packedQty = await getPackedQtyForBoxInTc(connection, tcId, boxIdNorm);
    const packedBoxes = await getDistinctPackedBoxIds(connection, tcId);

    res.json({
      ok: true,
      tc_id: tcId,
      box_id: boxIdNorm,
      status: "PACKED",
      packed_boxes: packedBoxes,
      packed_qty: packedQty,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    console.error("packBoxIntoTransferCarton:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to pack box into transfer carton",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
}
