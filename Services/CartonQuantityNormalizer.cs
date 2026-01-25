using System;

namespace Wms.Desktop.Services;

/// <summary>
/// Service to normalize carton quantities to whole numbers (integers only)
/// Uses ROUND HALF UP (MidpointRounding.AwayFromZero) as per requirement
/// </summary>
public static class CartonQuantityNormalizer
{
    /// <summary>
    /// Normalize a carton quantity to the nearest whole number using ROUND HALF UP
    /// </summary>
    /// <param name="qty">The quantity to normalize</param>
    /// <returns>Normalized integer quantity</returns>
    public static int NormalizeQuantity(double qty)
    {
        // ROUND HALF UP: 0.5 rounds to 1, -0.5 rounds to -1
        return (int)Math.Round(qty, 0, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// Validate that a quantity is a whole number (no decimals)
    /// </summary>
    /// <param name="qty">The quantity to validate</param>
    /// <returns>True if the quantity is a whole number, false otherwise</returns>
    public static bool IsWholeNumber(double qty)
    {
        return Math.Abs(qty % 1) < double.Epsilon;
    }

    /// <summary>
    /// Validate and throw exception if quantity has decimals
    /// </summary>
    /// <param name="qty">The quantity to validate</param>
    /// <param name="fieldName">Name of the field for error message</param>
    /// <exception cref="ArgumentException">Thrown if quantity has decimals</exception>
    public static void ValidateWholeNumber(double qty, string fieldName = "Quantity")
    {
        if (!IsWholeNumber(qty))
        {
            throw new ArgumentException(
                $"{fieldName} must be a whole number (integer). Received: {qty}. " +
                $"Carton quantities cannot have decimal values.",
                fieldName);
        }
    }

    /// <summary>
    /// Normalize a nullable quantity
    /// </summary>
    public static int? NormalizeQuantity(double? qty)
    {
        return qty.HasValue ? NormalizeQuantity(qty.Value) : null;
    }
}
