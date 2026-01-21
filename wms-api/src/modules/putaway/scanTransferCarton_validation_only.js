// VALIDATION-ONLY VERSION - NO AUTO-CREATION
// This is the simplified version that only validates carton_id and location_id
// All creation and stock updates happen in completePutaway endpoint

export const scanTransferCarton = async (req, res) => {
  const { tc_id, box_id, location_id, user_id } = req.body;

  // VALIDATION: location_id is required
  if (!location_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "location_id is required",
      },
    });
  }

  // VALIDATION: Either tc_id or box_id is required
  if (!tc_id && !box_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Either tc_id (carton_id) or box_id is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    // VALIDATION ONLY - No transaction needed (no database writes)
    // Step 1: Validate location_id exists
    let locationInfo = null;
    try {
      locationInfo = await lookupLocationFromId(connection, location_id);
    } catch (error) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "LOCATION_NOT_FOUND",
          message: `Location ID "${location_id}" not found or not available`,
          details: error.message,
        },
      });
    }

    // Step 2: Validate carton_id exists (for ASN - required)
    // For ASN putaway, carton_id must exist in tabTransferCarton
    if (tc_id) {
      const [tcRows] = await connection.execute(
        `SELECT tc_id, status FROM tabTransferCarton WHERE tc_id = ? LIMIT 1`,
        [tc_id]
      );

      if (tcRows.length === 0) {
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "CARTON_NOT_FOUND",
            message: `Transfer carton ${tc_id} not found. Carton must be created during receiving before putaway.`,
          },
        });
      }
    }

    // Step 3: Validate box_id exists (if provided instead of tc_id)
    if (box_id && !tc_id) {
      const [boxRows] = await connection.execute(
        `SELECT box_id, status FROM tabSortBox WHERE box_id = ? LIMIT 1`,
        [box_id]
      );

      if (boxRows.length === 0) {
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "BOX_NOT_FOUND",
            message: `Box ${box_id} not found. Box must be created before putaway.`,
          },
        });
      }
    }

    // All validations passed - return success
    // NO CREATION - all creation happens in completePutaway
    connection.release();
    return res.status(200).json({
      ok: true,
      message: "Validation successful",
      validated: {
        carton_id: tc_id || null,
        box_id: box_id || null,
        location_id: location_id,
        location: {
          location_id: locationInfo.location_id,
          zone: locationInfo.zone,
          aisle: locationInfo.aisle,
          rack: locationInfo.rack,
          level: locationInfo.level,
          bin: locationInfo.bin,
        },
      },
      ready_for_completion: true, // Enable Complete button in mobile app
    });
  } catch (error) {
    connection.release();
    console.error("Failed to validate transfer carton for putaway:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to validate transfer carton for putaway",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  }
};
