using System;
using System.Windows.Media.Imaging;
using ZXing;
using ZXing.Common;
using System.Runtime.Versioning;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for generating barcode images using ZXing.Net
/// Supports Code128, EAN13, QR Code, and other symbologies
/// </summary>
[SupportedOSPlatform("windows")]
public static class BarcodeService
{
    /// <summary>
    /// Generate a Code128 barcode image from text
    /// </summary>
    /// <param name="text">Text to encode (e.g., "BOX-STORE-001-001")</param>
    /// <param name="width">Image width in pixels (default: 300)</param>
    /// <param name="height">Image height in pixels (default: 100)</param>
    /// <returns>BitmapImage containing the barcode</returns>
    public static BitmapImage GenerateCode128(string text, int width = 300, int height = 100)
    {
        try
        {
            ErrorLogService.LogInfo($"BarcodeService: Generating Code128 barcode for '{text}'");
            
            var writer = new BarcodeWriterPixelData
            {
                Format = BarcodeFormat.CODE_128,
                Options = new EncodingOptions
                {
                    Height = height,
                    Width = width,
                    Margin = 2,
                    PureBarcode = false // Include text below barcode
                }
            };

            var pixelData = writer.Write(text);
            
            // Convert to BitmapImage
            var bitmap = new System.Drawing.Bitmap(pixelData.Width, pixelData.Height, System.Drawing.Imaging.PixelFormat.Format32bppRgb);
            var bitmapData = bitmap.LockBits(
                new System.Drawing.Rectangle(0, 0, pixelData.Width, pixelData.Height),
                System.Drawing.Imaging.ImageLockMode.WriteOnly,
                System.Drawing.Imaging.PixelFormat.Format32bppRgb);

            System.Runtime.InteropServices.Marshal.Copy(pixelData.Pixels, 0, bitmapData.Scan0, pixelData.Pixels.Length);
            bitmap.UnlockBits(bitmapData);

            // Convert to BitmapImage (WPF compatible)
            // Use a byte array approach to ensure the image is fully loaded
            byte[] imageBytes;
            using (var memory = new System.IO.MemoryStream())
            {
                bitmap.Save(memory, System.Drawing.Imaging.ImageFormat.Png);
                imageBytes = memory.ToArray();
            }

            var bitmapImage = new BitmapImage();
            using (var memory = new System.IO.MemoryStream(imageBytes))
            {
                bitmapImage.BeginInit();
                bitmapImage.StreamSource = memory;
                bitmapImage.CacheOption = BitmapCacheOption.OnLoad;
                bitmapImage.CreateOptions = BitmapCreateOptions.None;
                bitmapImage.EndInit();
            }
            
            // Ensure image is fully loaded before freezing
            if (bitmapImage.IsDownloading)
            {
                bitmapImage.DownloadCompleted += (s, e) => bitmapImage.Freeze();
            }
            else
            {
                bitmapImage.Freeze(); // Freeze for thread safety and printing (required for FixedDocument)
            }

            bitmap.Dispose();
            
            ErrorLogService.LogInfo($"BarcodeService: Successfully generated barcode image ({width}x{height})");
            return bitmapImage;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"BarcodeService: Error generating barcode for '{text}'", ex);
            throw;
        }
    }

    /// <summary>
    /// Generate a QR Code image from text
    /// </summary>
    /// <param name="text">Text to encode</param>
    /// <param name="size">Image size in pixels (default: 200)</param>
    /// <returns>BitmapImage containing the QR code</returns>
    public static BitmapImage GenerateQrCode(string text, int size = 200)
    {
        try
        {
            ErrorLogService.LogInfo($"BarcodeService: Generating QR code for '{text}'");
            
            var writer = new BarcodeWriterPixelData
            {
                Format = BarcodeFormat.QR_CODE,
                Options = new EncodingOptions
                {
                    Height = size,
                    Width = size,
                    Margin = 2
                }
            };

            var pixelData = writer.Write(text);
            
            // Convert to BitmapImage
            var bitmap = new System.Drawing.Bitmap(pixelData.Width, pixelData.Height, System.Drawing.Imaging.PixelFormat.Format32bppRgb);
            var bitmapData = bitmap.LockBits(
                new System.Drawing.Rectangle(0, 0, pixelData.Width, pixelData.Height),
                System.Drawing.Imaging.ImageLockMode.WriteOnly,
                System.Drawing.Imaging.PixelFormat.Format32bppRgb);

            System.Runtime.InteropServices.Marshal.Copy(pixelData.Pixels, 0, bitmapData.Scan0, pixelData.Pixels.Length);
            bitmap.UnlockBits(bitmapData);

            // Convert to BitmapImage (WPF compatible)
            // Use a byte array approach to ensure the image is fully loaded
            byte[] imageBytes;
            using (var memory = new System.IO.MemoryStream())
            {
                bitmap.Save(memory, System.Drawing.Imaging.ImageFormat.Png);
                imageBytes = memory.ToArray();
            }

            var bitmapImage = new BitmapImage();
            using (var memory = new System.IO.MemoryStream(imageBytes))
            {
                bitmapImage.BeginInit();
                bitmapImage.StreamSource = memory;
                bitmapImage.CacheOption = BitmapCacheOption.OnLoad;
                bitmapImage.CreateOptions = BitmapCreateOptions.None;
                bitmapImage.EndInit();
            }
            
            // Ensure image is fully loaded before freezing
            if (bitmapImage.IsDownloading)
            {
                bitmapImage.DownloadCompleted += (s, e) => bitmapImage.Freeze();
            }
            else
            {
                bitmapImage.Freeze(); // Freeze for thread safety and printing (required for FixedDocument)
            }

            bitmap.Dispose();
            
            ErrorLogService.LogInfo($"BarcodeService: Successfully generated QR code ({size}x{size})");
            return bitmapImage;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"BarcodeService: Error generating QR code for '{text}'", ex);
            throw;
        }
    }
}

