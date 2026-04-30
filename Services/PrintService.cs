using System;
using System.Collections.Generic;
using System.Linq;
using System.Printing;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for printing barcode labels using WPF PrintDialog
/// </summary>
public static class PrintService
{
    /// <summary>
    /// Print a barcode label with text
    /// </summary>
    /// <param name="barcodeImage">Barcode image to print</param>
    /// <param name="labelText">Text to display below barcode (e.g., Box ID)</param>
    /// <param name="title">Optional title for the print dialog</param>
    /// <returns>True if printing was successful, false if cancelled</returns>
    public static bool PrintBarcodeLabel(BitmapImage barcodeImage, string labelText, string title = "Print Barcode Label")
    {
        try
        {
            ErrorLogService.LogInfo($"PrintService: Starting print job for '{labelText}'");
            
            var printDialog = new System.Windows.Controls.PrintDialog();
            
            // Show print dialog
            if (printDialog.ShowDialog() != true)
            {
                ErrorLogService.LogInfo("PrintService: Print dialog cancelled by user");
                return false;
            }

            // Create a FixedDocument for printing
            var fixedDoc = new FixedDocument();
            var pageContent = new PageContent();
            var fixedPage = new FixedPage
            {
                Width = printDialog.PrintableAreaWidth,
                Height = printDialog.PrintableAreaHeight
            };

            // Create a border for the label (optional - for label paper)
            var border = new Border
            {
                BorderBrush = Brushes.Black,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10),
                Background = Brushes.White
            };

            // Create a stack panel for the label content
            var stackPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };

            // Add barcode image
            var image = new System.Windows.Controls.Image
            {
                Source = barcodeImage,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 10)
            };
            stackPanel.Children.Add(image);

            // Add label text
            var textBlock = new TextBlock
            {
                Text = labelText,
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center
            };
            stackPanel.Children.Add(textBlock);

            border.Child = stackPanel;
            fixedPage.Children.Add(border);

            // Set page size
            fixedPage.Width = printDialog.PrintableAreaWidth;
            fixedPage.Height = printDialog.PrintableAreaHeight;

            pageContent.Child = fixedPage;
            fixedDoc.Pages.Add(pageContent);

            // Print the document
            printDialog.PrintDocument(fixedDoc.DocumentPaginator, title);
            
            ErrorLogService.LogInfo($"PrintService: Successfully printed barcode label for '{labelText}'");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PrintService: Error printing barcode label for '{labelText}'", ex);
            MessageBox.Show($"Error printing barcode label:\n\n{ex.Message}", 
                "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    /// <summary>
    /// Print a simple barcode label (just barcode image and text)
    /// Optimized for label printers (e.g., 4x2 inch labels)
    /// </summary>
    /// <param name="barcodeImage">Barcode image to print</param>
    /// <param name="labelText">Text to display</param>
    /// <param name="labelWidth">Label width in inches (default: 4)</param>
    /// <param name="labelHeight">Label height in inches (default: 2)</param>
    /// <returns>True if printing was successful, false if cancelled</returns>
    public static bool PrintLabel(BitmapImage barcodeImage, string labelText, double labelWidth = 4.0, double labelHeight = 2.0)
    {
        try
        {
            ErrorLogService.LogInfo($"PrintService: Starting label print job for '{labelText}' ({labelWidth}\" x {labelHeight}\")");
            
            var printDialog = new System.Windows.Controls.PrintDialog();
            
            // Show print dialog
            if (printDialog.ShowDialog() != true)
            {
                ErrorLogService.LogInfo("PrintService: Print dialog cancelled by user");
                return false;
            }

            // Convert inches to pixels (96 DPI standard)
            var widthInPixels = labelWidth * 96;
            var heightInPixels = labelHeight * 96;

            // Create a FixedDocument for printing
            var fixedDoc = new FixedDocument();
            var pageContent = new PageContent();
            var fixedPage = new FixedPage
            {
                Width = widthInPixels,
                Height = heightInPixels
            };

            // Create a stack panel for the label content
            var stackPanel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Width = widthInPixels,
                Height = heightInPixels
            };

            // Add barcode image
            var image = new System.Windows.Controls.Image
            {
                Source = barcodeImage,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 5, 0, 5),
                MaxWidth = widthInPixels - 20
            };
            stackPanel.Children.Add(image);

            // Add label text
            var textBlock = new TextBlock
            {
                Text = labelText,
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 5, 0, 5)
            };
            stackPanel.Children.Add(textBlock);

            fixedPage.Children.Add(stackPanel);

            pageContent.Child = fixedPage;
            fixedDoc.Pages.Add(pageContent);

            // Print the document
            printDialog.PrintDocument(fixedDoc.DocumentPaginator, $"Barcode Label: {labelText}");
            
            ErrorLogService.LogInfo($"PrintService: Successfully printed label for '{labelText}'");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PrintService: Error printing label for '{labelText}'", ex);
            MessageBox.Show($"Error printing label:\n\n{ex.Message}", 
                "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    /// <summary>
    /// Print a complete Sort Box label with barcode and all information
    /// </summary>
    /// <param name="sortBox">Sort box to print label for</param>
    /// <param name="barcodeImage">Barcode image for the Box ID</param>
    /// <param name="boxContents">Optional list of items in the box</param>
    /// <returns>True if printing was successful, false if cancelled</returns>
    public static bool PrintSortBoxLabel(SortBox sortBox, BitmapImage barcodeImage, IList<SortBoxItem>? boxContents = null)
    {
        try
        {
            ErrorLogService.LogInfo($"PrintService: Starting sort box label print job for '{sortBox.BoxId}'");
            
            var printDialog = new System.Windows.Controls.PrintDialog();
            
            // Show print dialog
            if (printDialog.ShowDialog() != true)
            {
                ErrorLogService.LogInfo("PrintService: Print dialog cancelled by user");
                return false;
            }

            // Convert to pixels (96 DPI standard)
            var pageWidth = printDialog.PrintableAreaWidth;
            var pageHeight = printDialog.PrintableAreaHeight;

            // Create a FixedDocument for printing
            var fixedDoc = new FixedDocument();
            var pageContent = new PageContent();
            var fixedPage = new FixedPage
            {
                Width = pageWidth,
                Height = pageHeight
            };

            // Main container
            var mainStack = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(20),
                Background = Brushes.White
            };

            // Title
            var titleBlock = new TextBlock
            {
                Text = "SORT BOX / TRANSFER CARTON",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(titleBlock);

            // Box ID
            var boxIdBlock = new TextBlock
            {
                Text = $"Box ID: {sortBox.BoxId}",
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 5)
            };
            mainStack.Children.Add(boxIdBlock);

            // Store
            var storeBlock = new TextBlock
            {
                Text = $"Store: {sortBox.Store}",
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 5)
            };
            mainStack.Children.Add(storeBlock);

            // Status
            var statusBlock = new TextBlock
            {
                Text = $"Status: {sortBox.Status}",
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(statusBlock);

            // Separator line
            var separator1 = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 10)
            };
            mainStack.Children.Add(separator1);

            // ASN
            var asnBlock = new TextBlock
            {
                Text = $"ASN: {sortBox.AdvanceShippingNotice}",
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 5)
            };
            mainStack.Children.Add(asnBlock);

            // Transfer Order
            var toBlock = new TextBlock
            {
                Text = $"TO: {sortBox.TransferOrder}",
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(toBlock);

            // Separator line
            var separator2 = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 10)
            };
            mainStack.Children.Add(separator2);

            // Contents section
            var contentsTitle = new TextBlock
            {
                Text = "CONTENTS:",
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 5)
            };
            mainStack.Children.Add(contentsTitle);

            // Add contents if available
            if (boxContents != null && boxContents.Count > 0)
            {
                foreach (var item in boxContents)
                {
                    var itemBlock = new TextBlock
                    {
                        Text = $"{item.ItemCode} Qty: {item.Qty}",
                        FontSize = 12,
                        Margin = new Thickness(10, 0, 0, 3)
                    };
                    mainStack.Children.Add(itemBlock);
                }

                var totalItems = boxContents.Count;
                var totalPieces = boxContents.Sum(i => i.Qty);

                // Total Items
                var totalItemsBlock = new TextBlock
                {
                    Text = $"Total Items: {totalItems}",
                    FontSize = 12,
                    FontWeight = FontWeights.SemiBold,
                    Margin = new Thickness(0, 10, 0, 3)
                };
                mainStack.Children.Add(totalItemsBlock);

                // Total Pieces
                var totalPiecesBlock = new TextBlock
                {
                    Text = $"Total Pieces: {totalPieces}",
                    FontSize = 12,
                    FontWeight = FontWeights.SemiBold,
                    Margin = new Thickness(0, 0, 0, 15)
                };
                mainStack.Children.Add(totalPiecesBlock);
            }
            else
            {
                var noContentsBlock = new TextBlock
                {
                    Text = "(No contents)",
                    FontSize = 12,
                    FontStyle = FontStyles.Italic,
                    Margin = new Thickness(10, 0, 0, 15)
                };
                mainStack.Children.Add(noContentsBlock);
            }

            // Created date
            var createdBlock = new TextBlock
            {
                Text = $"Created: {sortBox.CreatedOn:yyyy-MM-dd HH:mm}",
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(createdBlock);

            // Barcode image - Ensure it's frozen and set explicit dimensions for FixedPage
            if (!barcodeImage.IsFrozen)
            {
                barcodeImage.Freeze();
            }
            
            // Calculate dimensions - ensure barcode is visible and properly sized
            var maxBarcodeWidth = pageWidth - 60;
            var aspectRatio = (double)barcodeImage.PixelHeight / barcodeImage.PixelWidth;
            var barcodeWidth = Math.Min(maxBarcodeWidth, barcodeImage.PixelWidth);
            var barcodeHeight = barcodeWidth * aspectRatio;
            
            // Ensure minimum size for visibility
            if (barcodeHeight < 50)
            {
                barcodeHeight = 50;
                barcodeWidth = barcodeHeight / aspectRatio;
            }
            
            var barcodeImageControl = new System.Windows.Controls.Image
            {
                Source = barcodeImage,
                Width = barcodeWidth,
                Height = barcodeHeight,
                Stretch = Stretch.Uniform, // Maintain aspect ratio
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 10, 0, 10)
            };
            RenderOptions.SetBitmapScalingMode(barcodeImageControl, BitmapScalingMode.HighQuality);
            mainStack.Children.Add(barcodeImageControl);

            // Box ID below barcode
            var barcodeTextBlock = new TextBlock
            {
                Text = sortBox.BoxId,
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 0, 0, 10)
            };
            mainStack.Children.Add(barcodeTextBlock);

            fixedPage.Children.Add(mainStack);

            pageContent.Child = fixedPage;
            fixedDoc.Pages.Add(pageContent);

            // Print the document
            printDialog.PrintDocument(fixedDoc.DocumentPaginator, $"Sort Box Label - {sortBox.BoxId}");
            
            ErrorLogService.LogInfo($"PrintService: Successfully printed sort box label for '{sortBox.BoxId}'");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PrintService: Error printing sort box label for '{sortBox.BoxId}'", ex);
            MessageBox.Show($"Error printing label:\n\n{ex.Message}", 
                "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    /// <summary>
    /// Print a complete Transfer Carton label with barcode and all information
    /// </summary>
    /// <param name="transferCarton">Transfer carton to print label for</param>
    /// <param name="barcodeImage">Barcode image for the Carton ID</param>
    /// <param name="cartonContents">Optional list of items in the carton</param>
    /// <returns>True if printing was successful, false if cancelled</returns>
    public static bool PrintTransferCartonLabel(TransferCarton transferCarton, BitmapImage barcodeImage, IList<TransferCartonItem>? cartonContents = null)
    {
        try
        {
            ErrorLogService.LogInfo($"PrintService: Starting transfer carton label print job for '{transferCarton.TcId}'");
            
            var printDialog = new System.Windows.Controls.PrintDialog();
            
            // Show print dialog
            if (printDialog.ShowDialog() != true)
            {
                ErrorLogService.LogInfo("PrintService: Print dialog cancelled by user");
                return false;
            }

            // Convert to pixels (96 DPI standard)
            var pageWidth = printDialog.PrintableAreaWidth;
            var pageHeight = printDialog.PrintableAreaHeight;

            // Create a FixedDocument for printing
            var fixedDoc = new FixedDocument();
            var pageContent = new PageContent();
            var fixedPage = new FixedPage
            {
                Width = pageWidth,
                Height = pageHeight
            };

            // Main container
            var mainStack = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(20),
                Background = Brushes.White
            };

            // Title
            var titleBlock = new TextBlock
            {
                Text = "SORT BOX / TRANSFER CARTON",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(titleBlock);

            // Box ID
            var boxIdBlock = new TextBlock
            {
                Text = $"Box ID: {transferCarton.TcId}",
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 5)
            };
            mainStack.Children.Add(boxIdBlock);

            // Store
            var storeBlock = new TextBlock
            {
                Text = $"Store: {transferCarton.Store}",
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 5)
            };
            mainStack.Children.Add(storeBlock);

            // Status
            var statusBlock = new TextBlock
            {
                Text = $"Status: {transferCarton.Status}",
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(statusBlock);

            // Separator line
            var separator1 = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 10)
            };
            mainStack.Children.Add(separator1);

            // ASN (only show if not null - Material Request transfer cartons have null ASN)
            if (!string.IsNullOrEmpty(transferCarton.AdvanceShippingNotice))
            {
                var asnBlock = new TextBlock
                {
                    Text = $"ASN: {transferCarton.AdvanceShippingNotice}",
                    FontSize = 14,
                    Margin = new Thickness(0, 0, 0, 5)
                };
                mainStack.Children.Add(asnBlock);
            }

            // Transfer Order (can be Material Request number for MR transfer cartons)
            if (!string.IsNullOrEmpty(transferCarton.TransferOrder))
            {
                var toBlock = new TextBlock
                {
                    Text = $"TO: {transferCarton.TransferOrder}",
                    FontSize = 14,
                    Margin = new Thickness(0, 0, 0, 15)
                };
                mainStack.Children.Add(toBlock);
            }

            // Separator line
            var separator2 = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 10)
            };
            mainStack.Children.Add(separator2);

            // Contents section
            var contentsTitle = new TextBlock
            {
                Text = "CONTENTS:",
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 5)
            };
            mainStack.Children.Add(contentsTitle);

            // Add contents if available
            if (cartonContents != null && cartonContents.Count > 0)
            {
                foreach (var item in cartonContents)
                {
                    var itemBlock = new TextBlock
                    {
                        Text = $"{item.ItemCode} Qty: {item.Qty}",
                        FontSize = 12,
                        Margin = new Thickness(10, 0, 0, 3)
                    };
                    mainStack.Children.Add(itemBlock);
                }

                var totalItems = cartonContents.Count;
                var totalPieces = cartonContents.Sum(i => i.Qty);

                // Total Items
                var totalItemsBlock = new TextBlock
                {
                    Text = $"Total Items: {totalItems}",
                    FontSize = 12,
                    FontWeight = FontWeights.SemiBold,
                    Margin = new Thickness(0, 10, 0, 3)
                };
                mainStack.Children.Add(totalItemsBlock);

                // Total Pieces
                var totalPiecesBlock = new TextBlock
                {
                    Text = $"Total Pieces: {totalPieces}",
                    FontSize = 12,
                    FontWeight = FontWeights.SemiBold,
                    Margin = new Thickness(0, 0, 0, 15)
                };
                mainStack.Children.Add(totalPiecesBlock);
            }
            else
            {
                var noContentsBlock = new TextBlock
                {
                    Text = "(No contents)",
                    FontSize = 12,
                    FontStyle = FontStyles.Italic,
                    Margin = new Thickness(10, 0, 0, 15)
                };
                mainStack.Children.Add(noContentsBlock);
            }

            // Created date
            var createdBlock = new TextBlock
            {
                Text = $"Created: {transferCarton.CreatedOn:yyyy-MM-dd HH:mm}",
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(createdBlock);

            // Barcode image - Ensure it's frozen and set explicit dimensions for FixedPage
            if (!barcodeImage.IsFrozen)
            {
                barcodeImage.Freeze();
            }
            
            // Calculate dimensions - ensure barcode is visible and properly sized
            var maxBarcodeWidth = pageWidth - 60;
            var aspectRatio = (double)barcodeImage.PixelHeight / barcodeImage.PixelWidth;
            var barcodeWidth = Math.Min(maxBarcodeWidth, barcodeImage.PixelWidth);
            var barcodeHeight = barcodeWidth * aspectRatio;
            
            // Ensure minimum size for visibility
            if (barcodeHeight < 50)
            {
                barcodeHeight = 50;
                barcodeWidth = barcodeHeight / aspectRatio;
            }
            
            var barcodeImageControl = new System.Windows.Controls.Image
            {
                Source = barcodeImage,
                Width = barcodeWidth,
                Height = barcodeHeight,
                Stretch = Stretch.Uniform, // Maintain aspect ratio
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 10, 0, 10)
            };
            RenderOptions.SetBitmapScalingMode(barcodeImageControl, BitmapScalingMode.HighQuality);
            mainStack.Children.Add(barcodeImageControl);

            // Carton ID below barcode
            var barcodeTextBlock = new TextBlock
            {
                Text = transferCarton.TcId,
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 0, 0, 10)
            };
            mainStack.Children.Add(barcodeTextBlock);

            fixedPage.Children.Add(mainStack);

            pageContent.Child = fixedPage;
            fixedDoc.Pages.Add(pageContent);

            // Print the document
            printDialog.PrintDocument(fixedDoc.DocumentPaginator, $"Transfer Carton Label - {transferCarton.TcId}");
            
            ErrorLogService.LogInfo($"PrintService: Successfully printed transfer carton label for '{transferCarton.TcId}'");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PrintService: Error printing transfer carton label for '{transferCarton.TcId}'", ex);
            MessageBox.Show($"Error printing label:\n\n{ex.Message}", 
                "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    /// <summary>
    /// Helper method to extract color and size from item code (common patterns like CODE-COLOR-SIZE or CODE-COLOR/SIZE)
    /// </summary>
    private static (string? Color, string? Size) ExtractColorAndSize(string itemCode)
    {
        if (string.IsNullOrWhiteSpace(itemCode))
            return (null, null);

        var parts = itemCode.Split(new[] { '-', '_', '/' }, StringSplitOptions.RemoveEmptyEntries);
        
        // Try to find color and size in common positions
        // Pattern: XXX-COLOR-SIZE or XXX-XXX-COLOR-SIZE
        if (parts.Length >= 3)
        {
            // Check if last part looks like a size (S, M, L, XL, XXL, or numeric like 38, 40, etc.)
            var lastPart = parts[parts.Length - 1].ToUpper();
            var sizeCandidate = lastPart;
            var colorCandidate = parts.Length >= 2 ? parts[parts.Length - 2] : null;

            // Common size patterns
            var sizePatterns = new[] { "XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL" };
            bool isSize = sizePatterns.Contains(sizeCandidate) || (sizeCandidate.Length <= 3 && int.TryParse(sizeCandidate, out _));

            if (isSize && colorCandidate != null)
            {
                return (colorCandidate, sizeCandidate);
            }
        }

        return (null, null);
    }

    /// <summary>
    /// Print a professional delivery note/out slip for transfer carton
    /// </summary>
    public static bool PrintTransferCartonOutSlip(TransferCarton transferCarton, IList<TransferCartonItem>? cartonContents = null, Dictionary<string, Item>? itemsDictionary = null)
    {
        try
        {
            ErrorLogService.LogInfo($"PrintService: Starting out slip print job for '{transferCarton.TcId}'");
            
            var printDialog = new System.Windows.Controls.PrintDialog();
            
            // Set A4 page size (210mm x 297mm) in print ticket before showing dialog
            // This ensures the print dialog uses A4 as the page size
            try
            {
                if (printDialog.PrintTicket != null)
                {
                    printDialog.PrintTicket.PageMediaSize = new PageMediaSize(210, 297);
                }
            }
            catch
            {
                // If setting page size fails, continue with default
            }
            
            // Show print dialog
            if (printDialog.ShowDialog() != true)
            {
                ErrorLogService.LogInfo("PrintService: Print dialog cancelled by user");
                return false;
            }

            // Use printable area which will now be calculated for A4 size
            // This accounts for printer margins automatically
            var pageWidth = printDialog.PrintableAreaWidth;
            var pageHeight = printDialog.PrintableAreaHeight;

            // Create a FixedDocument for printing
            var fixedDoc = new FixedDocument();
            var pageContent = new PageContent();
            var fixedPage = new FixedPage
            {
                Width = pageWidth,
                Height = pageHeight
            };

            // Main container with optimized margins to better utilize A4 page space
            // Reduced margins from (40, 30, 40, 30) to (30, 20, 30, 20) for better page utilization
            var mainStack = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Margin = new Thickness(30, 20, 30, 20),
                Background = Brushes.White
            };

            // Header section with company info
            var headerGrid = new Grid();
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            
            var headerLeft = new StackPanel();
            
            // Company/Warehouse name (can be customized)
            var companyName = new TextBlock
            {
                Text = "WAREHOUSE MANAGEMENT SYSTEM",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Margin = new Thickness(0, 0, 0, 5)
            };
            headerLeft.Children.Add(companyName);

            // Address (optional - can be configured)
            var address = new TextBlock
            {
                Text = "Delivery Note / Out Slip",
                FontSize = 12,
                Foreground = Brushes.Gray,
                Margin = new Thickness(0, 0, 0, 0)
            };
            headerLeft.Children.Add(address);

            Grid.SetColumn(headerLeft, 0);
            headerGrid.Children.Add(headerLeft);

            // Date on right side
            var dateBlock = new TextBlock
            {
                Text = $"Date: {DateTime.Now:yyyy-MM-dd HH:mm}",
                FontSize = 11,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 5, 0, 0)
            };
            Grid.SetColumn(dateBlock, 1);
            headerGrid.Children.Add(dateBlock);

            mainStack.Children.Add(headerGrid);

            // Separator line
            var separator1 = new Rectangle
            {
                Height = 2,
                Fill = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Margin = new Thickness(0, 15, 0, 20)
            };
            mainStack.Children.Add(separator1);

            // Title: DELIVERY NOTE
            var titleBlock = new TextBlock
            {
                Text = "DELIVERY NOTE / OUT SLIP",
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 0, 0, 25)
            };
            mainStack.Children.Add(titleBlock);

            // Carton details section
            var detailsGrid = new Grid();
            detailsGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            detailsGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // Left column
            var leftDetails = new StackPanel { Margin = new Thickness(0, 0, 15, 0) };
            
            var cartonIdLabel = new TextBlock
            {
                Text = "Transfer Carton ID:",
                FontWeight = FontWeights.SemiBold,
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 2)
            };
            leftDetails.Children.Add(cartonIdLabel);
            
            var cartonIdValue = new TextBlock
            {
                Text = transferCarton.TcId,
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 10)
            };
            leftDetails.Children.Add(cartonIdValue);

            var storeLabel = new TextBlock
            {
                Text = "Destination Store:",
                FontWeight = FontWeights.SemiBold,
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 2)
            };
            leftDetails.Children.Add(storeLabel);
            
            var storeValue = new TextBlock
            {
                Text = transferCarton.Store,
                FontSize = 14,
                Margin = new Thickness(0, 0, 0, 10)
            };
            leftDetails.Children.Add(storeValue);

            Grid.SetColumn(leftDetails, 0);
            detailsGrid.Children.Add(leftDetails);

            // Right column
            var rightDetails = new StackPanel { Margin = new Thickness(15, 0, 0, 0) };
            
            // ASN (only show if not null - Material Request transfer cartons have null ASN)
            if (!string.IsNullOrEmpty(transferCarton.AdvanceShippingNotice))
            {
                var asnLabel = new TextBlock
                {
                    Text = "ASN:",
                    FontWeight = FontWeights.SemiBold,
                    FontSize = 12,
                    Margin = new Thickness(0, 0, 0, 2)
                };
                rightDetails.Children.Add(asnLabel);
                
                var asnValue = new TextBlock
                {
                    Text = transferCarton.AdvanceShippingNotice,
                    FontSize = 14,
                    Margin = new Thickness(0, 0, 0, 10)
                };
                rightDetails.Children.Add(asnValue);
            }

            // Transfer Order (can be Material Request number for MR transfer cartons)
            if (!string.IsNullOrEmpty(transferCarton.TransferOrder))
            {
                var toLabel = new TextBlock
                {
                    Text = "Transfer Order:",
                    FontWeight = FontWeights.SemiBold,
                    FontSize = 12,
                    Margin = new Thickness(0, 0, 0, 2)
                };
                rightDetails.Children.Add(toLabel);
                
                var toValue = new TextBlock
                {
                    Text = transferCarton.TransferOrder,
                    FontSize = 14,
                    Margin = new Thickness(0, 0, 0, 10)
                };
                rightDetails.Children.Add(toValue);
            }

            if (transferCarton.DispatchedOn.HasValue)
            {
                var dispatchedLabel = new TextBlock
                {
                    Text = "Dispatched On:",
                    FontWeight = FontWeights.SemiBold,
                    FontSize = 12,
                    Margin = new Thickness(0, 0, 0, 2)
                };
                rightDetails.Children.Add(dispatchedLabel);
                
                var dispatchedValue = new TextBlock
                {
                    Text = transferCarton.DispatchedOn.Value.ToString("yyyy-MM-dd HH:mm"),
                    FontSize = 14,
                    Margin = new Thickness(0, 0, 0, 10)
                };
                rightDetails.Children.Add(dispatchedValue);
            }

            Grid.SetColumn(rightDetails, 1);
            detailsGrid.Children.Add(rightDetails);

            mainStack.Children.Add(detailsGrid);

            // Separator
            var separator2 = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 15, 0, 15)
            };
            mainStack.Children.Add(separator2);

            // Items table header - 5 columns: Item Code, Description, Color, Size, Quantity
            var tableHeaderGrid = new Grid();
            tableHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.5, GridUnitType.Star) }); // Item Code
            tableHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2.5, GridUnitType.Star) }); // Description
            tableHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.2, GridUnitType.Star) }); // Color
            tableHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Size
            tableHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Quantity
            
            var headerBg = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Padding = new Thickness(8, 6, 8, 6),
                CornerRadius = new CornerRadius(2, 2, 0, 0)
            };
            tableHeaderGrid.Children.Add(headerBg);
            Grid.SetColumnSpan(headerBg, 5);

            var itemCodeHeader = new TextBlock
            {
                Text = "Item Code",
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                Foreground = Brushes.White,
                Margin = new Thickness(6, 5, 6, 5)
            };
            Grid.SetColumn(itemCodeHeader, 0);
            tableHeaderGrid.Children.Add(itemCodeHeader);

            var descriptionHeader = new TextBlock
            {
                Text = "Description",
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                Foreground = Brushes.White,
                Margin = new Thickness(6, 5, 6, 5)
            };
            Grid.SetColumn(descriptionHeader, 1);
            tableHeaderGrid.Children.Add(descriptionHeader);

            var colorHeader = new TextBlock
            {
                Text = "Color",
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                Foreground = Brushes.White,
                Margin = new Thickness(6, 5, 6, 5)
            };
            Grid.SetColumn(colorHeader, 2);
            tableHeaderGrid.Children.Add(colorHeader);

            var sizeHeader = new TextBlock
            {
                Text = "Size",
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                Foreground = Brushes.White,
                Margin = new Thickness(6, 5, 6, 5)
            };
            Grid.SetColumn(sizeHeader, 3);
            tableHeaderGrid.Children.Add(sizeHeader);

            var qtyHeader = new TextBlock
            {
                Text = "Quantity",
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(6, 5, 6, 5)
            };
            Grid.SetColumn(qtyHeader, 4);
            tableHeaderGrid.Children.Add(qtyHeader);

            mainStack.Children.Add(tableHeaderGrid);

            // Items rows
            double totalPieces = 0;
            int itemCount = 0;

            if (cartonContents != null && cartonContents.Count > 0)
            {
                // Group items by ItemCode and sum quantities
                var groupedItems = cartonContents
                    .GroupBy(i => i.ItemCode)
                    .Select(g => new { ItemCode = g.Key, TotalQty = g.Sum(i => i.Qty) })
                    .ToList();

                foreach (var item in groupedItems)
                {
                    itemCount++;
                    totalPieces += item.TotalQty;

                    // Get item details if available
                    Item? itemDetails = itemsDictionary?.GetValueOrDefault(item.ItemCode);
                    var description = itemDetails?.Name ?? "-";
                    var (color, size) = ExtractColorAndSize(item.ItemCode);

                    var itemRow = new Grid();
                    itemRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.5, GridUnitType.Star) }); // Item Code
                    itemRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2.5, GridUnitType.Star) }); // Description
                    itemRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.2, GridUnitType.Star) }); // Color
                    itemRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Size
                    itemRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Quantity

                    // Alternate row background
                    if (itemCount % 2 == 0)
                    {
                        var rowBg = new Border
                        {
                            Background = new SolidColorBrush(Color.FromRgb(249, 250, 251)),
                            Padding = new Thickness(0)
                        };
                        itemRow.Children.Add(rowBg);
                        Grid.SetColumnSpan(rowBg, 5);
                    }

                    var itemCodeText = new TextBlock
                    {
                        Text = item.ItemCode,
                        FontSize = 9,
                        Margin = new Thickness(6, 5, 6, 5),
                        VerticalAlignment = VerticalAlignment.Center,
                        TextWrapping = TextWrapping.Wrap
                    };
                    Grid.SetColumn(itemCodeText, 0);
                    itemRow.Children.Add(itemCodeText);

                    var descriptionText = new TextBlock
                    {
                        Text = description,
                        FontSize = 9,
                        Margin = new Thickness(6, 5, 6, 5),
                        VerticalAlignment = VerticalAlignment.Center,
                        TextWrapping = TextWrapping.Wrap
                    };
                    Grid.SetColumn(descriptionText, 1);
                    itemRow.Children.Add(descriptionText);

                    var colorText = new TextBlock
                    {
                        Text = color ?? "-",
                        FontSize = 9,
                        Margin = new Thickness(6, 5, 6, 5),
                        VerticalAlignment = VerticalAlignment.Center,
                        TextWrapping = TextWrapping.Wrap
                    };
                    Grid.SetColumn(colorText, 2);
                    itemRow.Children.Add(colorText);

                    var sizeText = new TextBlock
                    {
                        Text = size ?? "-",
                        FontSize = 9,
                        Margin = new Thickness(6, 5, 6, 5),
                        VerticalAlignment = VerticalAlignment.Center,
                        TextWrapping = TextWrapping.Wrap
                    };
                    Grid.SetColumn(sizeText, 3);
                    itemRow.Children.Add(sizeText);

                    var qtyText = new TextBlock
                    {
                        Text = item.TotalQty.ToString("0.##"),
                        FontSize = 9,
                        HorizontalAlignment = HorizontalAlignment.Right,
                        Margin = new Thickness(6, 5, 6, 5),
                        VerticalAlignment = VerticalAlignment.Center,
                        FontWeight = FontWeights.SemiBold
                    };
                    Grid.SetColumn(qtyText, 4);
                    itemRow.Children.Add(qtyText);

                    mainStack.Children.Add(itemRow);
                }
            }
            else
            {
                var noItemsRow = new TextBlock
                {
                    Text = "(No items in carton)",
                    FontSize = 11,
                    FontStyle = FontStyles.Italic,
                    Margin = new Thickness(8, 12, 8, 12),
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                mainStack.Children.Add(noItemsRow);
            }

            // Bottom border for table
            var tableBottomBorder = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 15)
            };
            mainStack.Children.Add(tableBottomBorder);

            // Totals section
            var totalsStack = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 0, 0, 20)
            };

            var totalsBorder = new Border
            {
                BorderBrush = Brushes.Black,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(15, 10, 15, 10),
                Background = new SolidColorBrush(Color.FromRgb(249, 250, 251))
            };

            var totalsGrid = new Grid();
            totalsGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            totalsGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) });

            var totalItemsLabel = new TextBlock
            {
                Text = "Total Items:",
                FontWeight = FontWeights.SemiBold,
                FontSize = 12,
                Margin = new Thickness(0, 0, 15, 5)
            };
            Grid.SetColumn(totalItemsLabel, 0);
            Grid.SetRow(totalItemsLabel, 0);
            totalsGrid.Children.Add(totalItemsLabel);

            var totalItemsValue = new TextBlock
            {
                Text = itemCount.ToString(),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 0, 0, 5)
            };
            Grid.SetColumn(totalItemsValue, 1);
            Grid.SetRow(totalItemsValue, 0);
            totalsGrid.Children.Add(totalItemsValue);

            totalsGrid.RowDefinitions.Add(new RowDefinition());
            totalsGrid.RowDefinitions.Add(new RowDefinition());

            var totalPiecesLabel = new TextBlock
            {
                Text = "Total Pieces:",
                FontWeight = FontWeights.SemiBold,
                FontSize = 12,
                Margin = new Thickness(0, 0, 15, 0)
            };
            Grid.SetColumn(totalPiecesLabel, 0);
            Grid.SetRow(totalPiecesLabel, 1);
            totalsGrid.Children.Add(totalPiecesLabel);

            var totalPiecesValue = new TextBlock
            {
                Text = totalPieces.ToString("0.##"),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            Grid.SetColumn(totalPiecesValue, 1);
            Grid.SetRow(totalPiecesValue, 1);
            totalsGrid.Children.Add(totalPiecesValue);

            totalsBorder.Child = totalsGrid;
            totalsStack.Children.Add(totalsBorder);
            mainStack.Children.Add(totalsStack);

            // Signature section
            var signatureStack = new StackPanel
            {
                Margin = new Thickness(0, 30, 0, 0)
            };

            var signatureSeparator = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 30)
            };
            signatureStack.Children.Add(signatureSeparator);

            var signatureGrid = new Grid();
            signatureGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            signatureGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // Received by section
            var receivedByStack = new StackPanel { Margin = new Thickness(0, 0, 30, 0) };
            var receivedByLabel = new TextBlock
            {
                Text = "Received By:",
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 40)
            };
            receivedByStack.Children.Add(receivedByLabel);
            var receivedByLine = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 5)
            };
            receivedByStack.Children.Add(receivedByLine);
            var receivedByName = new TextBlock
            {
                Text = "(Name & Signature)",
                FontSize = 10,
                FontStyle = FontStyles.Italic,
                Foreground = Brushes.Gray
            };
            receivedByStack.Children.Add(receivedByName);

            Grid.SetColumn(receivedByStack, 0);
            signatureGrid.Children.Add(receivedByStack);

            // Date section
            var dateStack = new StackPanel { Margin = new Thickness(30, 0, 0, 0) };
            var dateLabel = new TextBlock
            {
                Text = "Date:",
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 40)
            };
            dateStack.Children.Add(dateLabel);
            var dateLine = new Rectangle
            {
                Height = 1,
                Fill = Brushes.Black,
                Margin = new Thickness(0, 0, 0, 5)
            };
            dateStack.Children.Add(dateLine);
            var dateValue = new TextBlock
            {
                Text = "(Date & Time)",
                FontSize = 10,
                FontStyle = FontStyles.Italic,
                Foreground = Brushes.Gray
            };
            dateStack.Children.Add(dateValue);

            Grid.SetColumn(dateStack, 1);
            signatureGrid.Children.Add(dateStack);

            signatureStack.Children.Add(signatureGrid);
            mainStack.Children.Add(signatureStack);

            fixedPage.Children.Add(mainStack);

            pageContent.Child = fixedPage;
            fixedDoc.Pages.Add(pageContent);

            // Print the document
            printDialog.PrintDocument(fixedDoc.DocumentPaginator, $"Out Slip: {transferCarton.TcId}");
            
            ErrorLogService.LogInfo($"PrintService: Successfully printed out slip for '{transferCarton.TcId}'");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PrintService: Error printing out slip for '{transferCarton.TcId}'", ex);
            MessageBox.Show($"Error printing out slip: {ex.Message}",
                "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    /// <summary>
    /// Combined packing list grouped by sort box (<c>box_id</c> from scan events): summary page plus one page per box.
    /// </summary>
    public static bool PrintSortBoxPackingList(
        IReadOnlyList<SortBoxPackingListRow> packRows,
        IReadOnlyDictionary<string, TransferCarton> transferCartonById,
        Dictionary<string, Item>? itemsDictionary = null)
    {
        if (packRows == null || packRows.Count == 0)
            return false;

        try
        {
            var byBox = packRows.GroupBy(r => r.BoxKey).OrderBy(g => g.Key).ToList();
            ErrorLogService.LogInfo($"PrintService: Sort-box packing list — {byBox.Count} box group(s), {packRows.Count} line(s)");

            var printDialog = new PrintDialog();
            try
            {
                if (printDialog.PrintTicket != null)
                    printDialog.PrintTicket.PageMediaSize = new PageMediaSize(210, 297);
            }
            catch { /* use default */ }

            if (printDialog.ShowDialog() != true)
            {
                ErrorLogService.LogInfo("PrintService: Packing list print cancelled");
                return false;
            }

            var pageWidth = printDialog.PrintableAreaWidth;
            var pageHeight = printDialog.PrintableAreaHeight;
            var sideMargin = 16.0;
            var contentWidth = Math.Max(320, pageWidth - 2 * sideMargin);
            var fixedDoc = new FixedDocument();

            void AddPage(FrameworkElement content)
            {
                var pageContent = new PageContent();
                var fixedPage = new FixedPage { Width = pageWidth, Height = pageHeight };
                fixedPage.Children.Add(content);
                pageContent.Child = fixedPage;
                fixedDoc.Pages.Add(pageContent);
            }

            static (string store, string to, string asn, string status) MetaForTcs(
                IEnumerable<string> tcIds,
                IReadOnlyDictionary<string, TransferCarton> lookup)
            {
                string store = "-", to = "-", asn = "-", status = "-";
                foreach (var id in tcIds.Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    if (!lookup.TryGetValue(id, out var tc))
                        continue;
                    if (store == "-" && !string.IsNullOrWhiteSpace(tc.Store)) store = tc.Store;
                    if (to == "-" && !string.IsNullOrWhiteSpace(tc.TransferOrder)) to = tc.TransferOrder;
                    if (asn == "-" && !string.IsNullOrWhiteSpace(tc.AdvanceShippingNotice)) asn = tc.AdvanceShippingNotice;
                    if (status == "-" && !string.IsNullOrWhiteSpace(tc.Status)) status = tc.Status;
                }
                return (store, to, asn, status);
            }

            static string StoreSummaryForReport(
                IEnumerable<string> tcIds,
                IReadOnlyDictionary<string, TransferCarton> lookup)
            {
                var pairs = tcIds
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Select(id =>
                    {
                        lookup.TryGetValue(id, out var tc);
                        return (id, store: string.IsNullOrWhiteSpace(tc?.Store) ? "—" : tc!.Store!);
                    })
                    .ToList();
                var distinctStores = pairs.Select(p => p.store).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                if (pairs.Count == 0)
                    return "—";
                if (distinctStores.Count == 1)
                    return distinctStores[0];
                return string.Join(" · ", pairs.Select(p => $"{p.id}: {p.store}"));
            }

            var reportTcIds = packRows
                .Select(r => r.TcId)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s)
                .ToList();
            var reportTcLine = reportTcIds.Count == 0
                ? "—"
                : string.Join(", ", reportTcIds);
            var reportStoreLine = StoreSummaryForReport(reportTcIds, transferCartonById);

            // --- Summary page ---
            var summaryRoot = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Width = contentWidth,
                Margin = new Thickness(sideMargin, 20, sideMargin, 20),
                Background = Brushes.White
            };
            summaryRoot.Children.Add(new TextBlock
            {
                Text = "SORT BOX PACKING LIST",
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Margin = new Thickness(0, 0, 0, 6)
            });
            summaryRoot.Children.Add(new TextBlock
            {
                Text = $"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}   ·   Sort boxes: {byBox.Count}",
                FontSize = 12,
                Foreground = Brushes.Gray,
                Margin = new Thickness(0, 0, 0, 14)
            });

            var reportHdr = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(249, 250, 251)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(229, 231, 235)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(14, 12, 14, 12),
                Margin = new Thickness(0, 0, 0, 16)
            };
            var reportHdrStack = new StackPanel { Orientation = Orientation.Vertical };
            reportHdrStack.Children.Add(new TextBlock
            {
                Text = "Transfer carton(s)",
                FontWeight = FontWeights.SemiBold,
                FontSize = 11,
                Foreground = Brushes.Gray,
                Margin = new Thickness(0, 0, 0, 3)
            });
            reportHdrStack.Children.Add(new TextBlock
            {
                Text = reportTcLine,
                FontSize = 13,
                Foreground = new SolidColorBrush(Color.FromRgb(17, 24, 39)),
                TextWrapping = TextWrapping.Wrap
            });
            reportHdrStack.Children.Add(new TextBlock
            {
                Text = "Store",
                FontWeight = FontWeights.SemiBold,
                FontSize = 11,
                Foreground = Brushes.Gray,
                Margin = new Thickness(0, 10, 0, 3)
            });
            reportHdrStack.Children.Add(new TextBlock
            {
                Text = reportStoreLine,
                FontSize = 13,
                Foreground = new SolidColorBrush(Color.FromRgb(17, 24, 39)),
                TextWrapping = TextWrapping.Wrap
            });
            reportHdr.Child = reportHdrStack;
            summaryRoot.Children.Add(reportHdr);

            var summaryHeader = new Grid { Margin = new Thickness(0, 0, 0, 8), Width = contentWidth };
            summaryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3.4, GridUnitType.Star) });
            summaryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2.4, GridUnitType.Star) });
            summaryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(0.6, GridUnitType.Star) });
            summaryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(0.6, GridUnitType.Star) });
            void AddSummaryHeaderCell(int col, string text)
            {
                var b = new Border
                {
                    Background = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                    Padding = new Thickness(10, 8, 10, 8),
                    Margin = new Thickness(0, 0, 1, 0)
                };
                b.Child = new TextBlock
                {
                    Text = text,
                    Foreground = Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 12
                };
                Grid.SetColumn(b, col);
                summaryHeader.Children.Add(b);
            }
            AddSummaryHeaderCell(0, "Sort box (Box ID)");
            AddSummaryHeaderCell(1, "Transfer order");
            AddSummaryHeaderCell(2, "Lines");
            AddSummaryHeaderCell(3, "Qty");
            summaryRoot.Children.Add(summaryHeader);

            var rowIndex = 0;
            foreach (var g in byBox)
            {
                rowIndex++;
                var tcIds = g.Select(x => x.TcId).Where(s => !string.IsNullOrEmpty(s));
                var meta = MetaForTcs(tcIds, transferCartonById);
                var lineCount = g.Count();
                var sumQty = g.Sum(x => x.Qty);
                var rowGrid = new Grid { Margin = new Thickness(0, 0, 0, 2), Width = contentWidth };
                for (var c = 0; c < 4; c++)
                    rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = summaryHeader.ColumnDefinitions[c].Width });

                void AddCell(int col, string text, bool right = false)
                {
                    var bg = rowIndex % 2 == 0
                        ? new SolidColorBrush(Color.FromRgb(249, 250, 251))
                        : Brushes.White;
                    var cell = new Border { Background = bg, Padding = new Thickness(10, 8, 10, 8), Margin = new Thickness(0, 0, 1, 0) };
                    cell.Child = new TextBlock
                    {
                        Text = text,
                        FontSize = 12,
                        TextWrapping = TextWrapping.Wrap,
                        VerticalAlignment = VerticalAlignment.Center,
                        HorizontalAlignment = right ? HorizontalAlignment.Right : HorizontalAlignment.Left
                    };
                    Grid.SetColumn(cell, col);
                    rowGrid.Children.Add(cell);
                }
                AddCell(0, g.Key);
                AddCell(1, meta.to);
                AddCell(2, lineCount.ToString(), right: true);
                AddCell(3, sumQty.ToString("0.##"), right: true);
                summaryRoot.Children.Add(rowGrid);
            }

            AddPage(summaryRoot);

            // --- One page per sort box ---
            foreach (var g in byBox)
            {
                var page = new StackPanel
                {
                    Orientation = Orientation.Vertical,
                    Width = contentWidth,
                    Margin = new Thickness(sideMargin, 18, sideMargin, 18),
                    Background = Brushes.White
                };
                page.Children.Add(new TextBlock
                {
                    Text = "SORT BOX CONTENTS",
                    FontSize = 17,
                    FontWeight = FontWeights.Bold,
                    Margin = new Thickness(0, 0, 0, 10)
                });

                var detailHdrBand = new Border
                {
                    Background = new SolidColorBrush(Color.FromRgb(249, 250, 251)),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(229, 231, 235)),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(14, 12, 14, 12),
                    Margin = new Thickness(0, 0, 0, 14)
                };
                var detailHdrStack = new StackPanel { Orientation = Orientation.Vertical };
                detailHdrStack.Children.Add(new TextBlock
                {
                    Text = "Transfer carton(s)",
                    FontWeight = FontWeights.SemiBold,
                    FontSize = 11,
                    Foreground = Brushes.Gray,
                    Margin = new Thickness(0, 0, 0, 3)
                });
                detailHdrStack.Children.Add(new TextBlock
                {
                    Text = reportTcLine,
                    FontSize = 13,
                    Foreground = new SolidColorBrush(Color.FromRgb(17, 24, 39)),
                    TextWrapping = TextWrapping.Wrap
                });
                detailHdrStack.Children.Add(new TextBlock
                {
                    Text = "Store",
                    FontWeight = FontWeights.SemiBold,
                    FontSize = 11,
                    Foreground = Brushes.Gray,
                    Margin = new Thickness(0, 8, 0, 3)
                });
                detailHdrStack.Children.Add(new TextBlock
                {
                    Text = reportStoreLine,
                    FontSize = 13,
                    Foreground = new SolidColorBrush(Color.FromRgb(17, 24, 39)),
                    TextWrapping = TextWrapping.Wrap
                });
                detailHdrBand.Child = detailHdrStack;
                page.Children.Add(detailHdrBand);

                var tcIds = g.Select(x => x.TcId).Where(s => !string.IsNullOrEmpty(s));
                var meta = MetaForTcs(tcIds, transferCartonById);
                var hdr = new StackPanel { Margin = new Thickness(0, 0, 0, 12) };
                void AddLine(string label, string value)
                {
                    var sp = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 4) };
                    sp.Children.Add(new TextBlock { Text = label, FontWeight = FontWeights.SemiBold, Width = 172, FontSize = 12 });
                    sp.Children.Add(new TextBlock { Text = value, FontSize = 12, TextWrapping = TextWrapping.Wrap });
                    hdr.Children.Add(sp);
                }
                AddLine("Sort box (Box ID):", g.Key);
                AddLine("ASN:", meta.asn);
                AddLine("Transfer order:", meta.to);
                AddLine("Status:", meta.status);
                page.Children.Add(hdr);

                var detailRows = g
                    .OrderBy(x => x.TcId)
                    .ThenBy(x => x.ItemCode)
                    .ThenBy(x => x.SourceCartonId)
                    .ToList();

                var distinctTcInBox = detailRows.Select(x => x.TcId).Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase).Count();
                var showTcColumn = distinctTcInBox > 1;
                GridLength[] colW = showTcColumn
                    ? new[]
                    {
                        new GridLength(1.35, GridUnitType.Star),
                        new GridLength(2.35, GridUnitType.Star),
                        new GridLength(1.1, GridUnitType.Star),
                        new GridLength(1.05, GridUnitType.Star),
                        new GridLength(0.7, GridUnitType.Star)
                    }
                    : new[]
                    {
                        new GridLength(1.55, GridUnitType.Star),
                        new GridLength(2.75, GridUnitType.Star),
                        new GridLength(1.25, GridUnitType.Star),
                        new GridLength(0.7, GridUnitType.Star)
                    };
                var colCount = colW.Length;

                var thGrid = new Grid { Margin = new Thickness(0, 4, 0, 4), Width = contentWidth };
                foreach (var w in colW)
                    thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = w });
                void ThCell(int col, string t)
                {
                    var tb = new TextBlock
                    {
                        Text = t,
                        Foreground = Brushes.White,
                        FontWeight = FontWeights.Bold,
                        FontSize = 12,
                        Margin = new Thickness(8, 5, 8, 5)
                    };
                    Grid.SetColumn(tb, col);
                    thGrid.Children.Add(tb);
                }
                var thWrap = new Border
                {
                    Width = contentWidth,
                    Background = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                    Padding = new Thickness(8, 6, 8, 6),
                    Margin = new Thickness(0, 0, 0, 3),
                    Child = thGrid
                };
                ThCell(0, "Item code");
                ThCell(1, "Description");
                ThCell(2, "Source carton");
                if (showTcColumn)
                    ThCell(3, "Transfer carton");
                ThCell(showTcColumn ? 4 : 3, "Qty");
                page.Children.Add(thWrap);

                var r = 0;
                double pageTotal = 0;
                foreach (var line in detailRows)
                {
                    r++;
                    pageTotal += line.Qty;
                    var itemRow = new Grid { Margin = new Thickness(0, 0, 0, 2), Width = contentWidth };
                    foreach (var w in colW)
                        itemRow.ColumnDefinitions.Add(new ColumnDefinition { Width = w });

                    var rowBg = r % 2 == 0 ? new SolidColorBrush(Color.FromRgb(249, 250, 251)) : Brushes.White;
                    var bgBorder = new Border { Background = rowBg, Padding = new Thickness(6, 6, 6, 6) };
                    Grid.SetColumnSpan(bgBorder, colCount);
                    itemRow.Children.Add(bgBorder);

                    var desc = itemsDictionary?.GetValueOrDefault(line.ItemCode)?.Name ?? "-";
                    var codeTb = new TextBlock { Text = line.ItemCode, FontSize = 12, Margin = new Thickness(10, 6, 10, 6), TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
                    Grid.SetColumn(codeTb, 0);
                    itemRow.Children.Add(codeTb);
                    var descTb = new TextBlock { Text = desc, FontSize = 12, Margin = new Thickness(10, 6, 10, 6), TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
                    Grid.SetColumn(descTb, 1);
                    itemRow.Children.Add(descTb);
                    var srcTb = new TextBlock { Text = string.IsNullOrEmpty(line.SourceCartonId) ? "-" : line.SourceCartonId, FontSize = 12, Margin = new Thickness(10, 6, 10, 6), TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
                    Grid.SetColumn(srcTb, 2);
                    itemRow.Children.Add(srcTb);
                    var qtyCol = 3;
                    if (showTcColumn)
                    {
                        var tcTb = new TextBlock { Text = line.TcId, FontSize = 12, Margin = new Thickness(10, 6, 10, 6), TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
                        Grid.SetColumn(tcTb, 3);
                        itemRow.Children.Add(tcTb);
                        qtyCol = 4;
                    }
                    var qtyTb = new TextBlock { Text = line.Qty.ToString("0.##"), FontSize = 12, Margin = new Thickness(10, 6, 10, 6), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
                    Grid.SetColumn(qtyTb, qtyCol);
                    itemRow.Children.Add(qtyTb);
                    page.Children.Add(itemRow);
                }

                var foot = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 16, 0, 0) };
                foot.Children.Add(new TextBlock
                {
                    Text = $"Lines: {detailRows.Count}   Total qty: {pageTotal.ToString("0.##")}",
                    FontWeight = FontWeights.SemiBold,
                    FontSize = 13
                });
                page.Children.Add(foot);

                AddPage(page);
            }

            printDialog.PrintDocument(fixedDoc.DocumentPaginator, "Sort Box Packing List");
            ErrorLogService.LogInfo("PrintService: Sort-box packing list printed");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("PrintService: Error printing sort-box packing list", ex);
            MessageBox.Show($"Error printing packing list: {ex.Message}",
                "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    /// <summary>
    /// Single-page print for <b>one</b> transfer carton — same aggregated lines as the Carton Contents grid (not the multi-carton sort-box report).
    /// </summary>
    public static bool PrintSingleTransferCartonContentsList(
        TransferCarton transferCarton,
        IReadOnlyList<TransferCartonItem> lines,
        Dictionary<string, Item>? itemsDictionary = null)
    {
        if (transferCarton == null || lines == null || lines.Count == 0)
            return false;

        try
        {
            var printDialog = new PrintDialog();
            try
            {
                if (printDialog.PrintTicket != null)
                    printDialog.PrintTicket.PageMediaSize = new PageMediaSize(210, 297);
            }
            catch { /* default */ }

            if (printDialog.ShowDialog() != true)
                return false;

            var pageWidth = printDialog.PrintableAreaWidth;
            var pageHeight = printDialog.PrintableAreaHeight;
            var fixedDoc = new FixedDocument();
            var pageContent = new PageContent();
            var fixedPage = new FixedPage { Width = pageWidth, Height = pageHeight };

            // Use nearly full printable width so tables and text scale across the page
            var sideMargin = 16.0;
            var contentWidth = Math.Max(320, pageWidth - 2 * sideMargin);

            var root = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Width = contentWidth,
                Margin = new Thickness(sideMargin, 18, sideMargin, 18),
                Background = Brushes.White
            };

            root.Children.Add(new TextBlock
            {
                Text = "TRANSFER CARTON CONTENTS",
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Margin = new Thickness(0, 0, 0, 6)
            });
            root.Children.Add(new TextBlock
            {
                Text = $"This carton only · {DateTime.Now:yyyy-MM-dd HH:mm}",
                FontSize = 12,
                Foreground = Brushes.Gray,
                Margin = new Thickness(0, 0, 0, 16)
            });

            void AddHdr(string label, string value)
            {
                var sp = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 5) };
                sp.Children.Add(new TextBlock { Text = label, FontWeight = FontWeights.SemiBold, Width = 168, FontSize = 12 });
                sp.Children.Add(new TextBlock { Text = value, FontSize = 12, TextWrapping = TextWrapping.Wrap });
                root.Children.Add(sp);
            }

            AddHdr("Transfer carton:", transferCarton.TcId);
            AddHdr("Store:", transferCarton.Store ?? "—");
            AddHdr("ASN:", string.IsNullOrWhiteSpace(transferCarton.AdvanceShippingNotice) ? "—" : transferCarton.AdvanceShippingNotice);
            AddHdr("Transfer order:", transferCarton.TransferOrder ?? "—");
            AddHdr("Stock entry:", string.IsNullOrWhiteSpace(transferCarton.WarehouseTransferNo) ? "—" : transferCarton.WarehouseTransferNo);
            AddHdr("Status:", transferCarton.Status ?? "—");

            root.Children.Add(new Rectangle { Height = 1, Fill = Brushes.LightGray, Margin = new Thickness(0, 8, 0, 14) });

            // Prefer sort box (box_id); when missing, keep lines distinct by source carton for qty aggregation
            var grouped = lines
                .GroupBy(i =>
                {
                    var box = string.IsNullOrWhiteSpace(i.BoxId) ? null : i.BoxId.Trim();
                    var src = i.SourceCartonId ?? "";
                    return (i.ItemCode, LineKey: box ?? ("SRC:" + src));
                })
                .Select(g =>
                {
                    var first = g.First();
                    var boxDisp = string.IsNullOrWhiteSpace(first.BoxId) ? "—" : first.BoxId.Trim();
                    return (first.ItemCode, BoxDisp: boxDisp, Qty: g.Sum(x => x.Qty));
                })
                .OrderBy(x => x.ItemCode)
                .ThenBy(x => x.BoxDisp)
                .ToList();

            var th = new Border
            {
                Width = contentWidth,
                Background = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Padding = new Thickness(10, 8, 10, 8),
                Margin = new Thickness(0, 0, 0, 3)
            };
            var thGrid = new Grid();
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.55, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2.85, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.55, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(0.85, GridUnitType.Star) });
            string[] heads = { "Item code", "Description", "Sort box (Box ID)", "Qty" };
            for (var hi = 0; hi < heads.Length; hi++)
            {
                var tb = new TextBlock
                {
                    Text = heads[hi],
                    Foreground = Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 12,
                    Margin = new Thickness(8, 4, 8, 4),
                    HorizontalAlignment = hi == 3 ? HorizontalAlignment.Right : HorizontalAlignment.Left
                };
                Grid.SetColumn(tb, hi);
                thGrid.Children.Add(tb);
            }
            th.Child = thGrid;
            root.Children.Add(th);

            var ri = 0;
            double total = 0;
            foreach (var (itemCode, boxDisp, qty) in grouped)
            {
                ri++;
                total += qty;
                var row = new Grid { Margin = new Thickness(0, 0, 0, 2), Width = contentWidth };
                for (var c = 0; c < 4; c++)
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = thGrid.ColumnDefinitions[c].Width });

                var bg = new Border
                {
                    Background = ri % 2 == 0 ? new SolidColorBrush(Color.FromRgb(249, 250, 251)) : Brushes.White,
                    Padding = new Thickness(8, 7, 8, 7)
                };
                Grid.SetColumnSpan(bg, 4);
                row.Children.Add(bg);

                var desc = itemsDictionary?.GetValueOrDefault(itemCode)?.Name ?? "—";
                var t0 = new TextBlock { Text = itemCode, FontSize = 12, Margin = new Thickness(10, 5, 10, 5), TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
                Grid.SetColumn(t0, 0);
                row.Children.Add(t0);
                var t1 = new TextBlock { Text = desc, FontSize = 12, Margin = new Thickness(10, 5, 10, 5), TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
                Grid.SetColumn(t1, 1);
                row.Children.Add(t1);
                var t2 = new TextBlock { Text = boxDisp, FontSize = 12, Margin = new Thickness(10, 5, 10, 5), TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
                Grid.SetColumn(t2, 2);
                row.Children.Add(t2);
                var t3 = new TextBlock { Text = qty.ToString("0.##"), FontSize = 12, Margin = new Thickness(10, 5, 10, 5), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
                Grid.SetColumn(t3, 3);
                row.Children.Add(t3);
                root.Children.Add(row);
            }

            var footSp = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 18, 0, 0)
            };
            footSp.Children.Add(new TextBlock
            {
                Text = $"Lines: {grouped.Count}    Total qty: {total:0.##}",
                FontWeight = FontWeights.SemiBold,
                FontSize = 13
            });
            root.Children.Add(footSp);

            fixedPage.Children.Add(root);
            pageContent.Child = fixedPage;
            fixedDoc.Pages.Add(pageContent);
            printDialog.PrintDocument(fixedDoc.DocumentPaginator, $"Transfer carton {transferCarton.TcId}");
            ErrorLogService.LogInfo($"PrintService: Single transfer carton contents printed for {transferCarton.TcId}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PrintService: Error printing single transfer carton {transferCarton.TcId}", ex);
            MessageBox.Show($"Error printing: {ex.Message}", "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    /// <summary>
    /// Material Request transfer slip (after ERP Stock Entry exists): header + line items, includes Stock Entry number.
    /// </summary>
    public static bool PrintMaterialRequestTransferSlip(
        MaterialRequest materialRequest,
        string stockEntryNo,
        IReadOnlyList<MaterialRequestItem> lines,
        Dictionary<string, Item>? itemsDictionary = null)
    {
        if (materialRequest == null || lines == null)
            return false;

        var ste = (stockEntryNo ?? "").Trim();
        if (string.IsNullOrEmpty(ste))
            return false;

        try
        {
            var printDialog = new PrintDialog();
            try
            {
                if (printDialog.PrintTicket != null)
                    printDialog.PrintTicket.PageMediaSize = new PageMediaSize(210, 297);
            }
            catch { /* default */ }

            if (printDialog.ShowDialog() != true)
                return false;

            var pageWidth = printDialog.PrintableAreaWidth;
            var pageHeight = printDialog.PrintableAreaHeight;
            var fixedDoc = new FixedDocument();
            var pageContent = new PageContent();
            var fixedPage = new FixedPage { Width = pageWidth, Height = pageHeight };

            var sideMargin = 16.0;
            var contentWidth = Math.Max(320, pageWidth - 2 * sideMargin);

            var root = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Width = contentWidth,
                Margin = new Thickness(sideMargin, 18, sideMargin, 18),
                Background = Brushes.White
            };

            root.Children.Add(new TextBlock
            {
                Text = "MATERIAL REQUEST — TRANSFER SLIP",
                FontSize = 22,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Margin = new Thickness(0, 0, 0, 6)
            });
            root.Children.Add(new TextBlock
            {
                Text = $"Printed {DateTime.Now:yyyy-MM-dd HH:mm}",
                FontSize = 12,
                Foreground = Brushes.Gray,
                Margin = new Thickness(0, 0, 0, 14)
            });

            void AddHdr(string label, string value)
            {
                var sp = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 5) };
                sp.Children.Add(new TextBlock { Text = label, FontWeight = FontWeights.SemiBold, Width = 168, FontSize = 12 });
                sp.Children.Add(new TextBlock { Text = value, FontSize = 12, TextWrapping = TextWrapping.Wrap });
                root.Children.Add(sp);
            }

            AddHdr("Material request:", materialRequest.Title);
            AddHdr("Stock entry (ERP):", ste);
            AddHdr("Status:", materialRequest.Status ?? "—");
            AddHdr("From warehouse:", materialRequest.FromWarehouse ?? "—");
            AddHdr("To showroom:", materialRequest.ToShowroom ?? "—");
            AddHdr("Requested by:", string.IsNullOrWhiteSpace(materialRequest.RequestedBy) ? "—" : materialRequest.RequestedBy);
            AddHdr("Requested date:", materialRequest.RequestedDate.ToString("d"));
            AddHdr("Required date:", materialRequest.RequiredDate?.ToString("d") ?? "—");

            root.Children.Add(new Rectangle { Height = 1, Fill = Brushes.LightGray, Margin = new Thickness(0, 8, 0, 14) });

            var th = new Border
            {
                Width = contentWidth,
                Background = new SolidColorBrush(Color.FromRgb(31, 81, 255)),
                Padding = new Thickness(10, 8, 10, 8),
                Margin = new Thickness(0, 0, 0, 3)
            };
            var thGrid = new Grid();
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.2, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2.2, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(0.85, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(0.85, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(0.85, GridUnitType.Star) });
            thGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(0.75, GridUnitType.Star) });
            string[] heads = { "Item code", "Description", "Requested", "Picked", "Pending", "Status" };
            for (var hi = 0; hi < heads.Length; hi++)
            {
                var tb = new TextBlock
                {
                    Text = heads[hi],
                    Foreground = Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 11,
                    Margin = new Thickness(6, 4, 6, 4),
                    HorizontalAlignment = hi >= 2 && hi <= 4 ? HorizontalAlignment.Right : HorizontalAlignment.Left
                };
                Grid.SetColumn(tb, hi);
                thGrid.Children.Add(tb);
            }
            th.Child = thGrid;
            root.Children.Add(th);

            var ri = 0;
            double totReq = 0, totPick = 0, totPen = 0;
            foreach (var line in lines.OrderBy(l => l.ItemCode))
            {
                ri++;
                totReq += line.RequestedQty;
                totPick += line.PickedQty;
                totPen += line.PendingQty;
                var row = new Grid { Margin = new Thickness(0, 0, 0, 2), Width = contentWidth };
                for (var c = 0; c < 6; c++)
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = thGrid.ColumnDefinitions[c].Width });

                var bg = new Border
                {
                    Background = ri % 2 == 0 ? new SolidColorBrush(Color.FromRgb(249, 250, 251)) : Brushes.White,
                    Padding = new Thickness(6, 6, 6, 6)
                };
                Grid.SetColumnSpan(bg, 6);
                row.Children.Add(bg);

                var desc = itemsDictionary?.GetValueOrDefault(line.ItemCode)?.Name ?? "—";
                void AddCell(int col, string text, bool right = false)
                {
                    var t = new TextBlock
                    {
                        Text = text,
                        FontSize = 11,
                        Margin = new Thickness(8, 4, 8, 4),
                        TextWrapping = TextWrapping.Wrap,
                        VerticalAlignment = VerticalAlignment.Center,
                        HorizontalAlignment = right ? HorizontalAlignment.Right : HorizontalAlignment.Left
                    };
                    Grid.SetColumn(t, col);
                    row.Children.Add(t);
                }

                AddCell(0, line.ItemCode);
                AddCell(1, desc);
                AddCell(2, line.RequestedQty.ToString("0.##"), true);
                AddCell(3, line.PickedQty.ToString("0.##"), true);
                AddCell(4, line.PendingQty.ToString("0.##"), true);
                AddCell(5, line.Status ?? "—");
                root.Children.Add(row);
            }

            var footSp = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 16, 0, 0)
            };
            footSp.Children.Add(new TextBlock
            {
                Text = $"Lines: {lines.Count}    Requested: {totReq:0.##}    Picked: {totPick:0.##}    Pending: {totPen:0.##}",
                FontWeight = FontWeights.SemiBold,
                FontSize = 12
            });
            root.Children.Add(footSp);

            fixedPage.Children.Add(root);
            pageContent.Child = fixedPage;
            fixedDoc.Pages.Add(pageContent);
            printDialog.PrintDocument(fixedDoc.DocumentPaginator, $"MR Transfer Slip {materialRequest.Title}");
            ErrorLogService.LogInfo($"PrintService: Material Request transfer slip printed for {materialRequest.Title} (STE {ste})");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PrintService: Error printing MR transfer slip {materialRequest.Title}", ex);
            MessageBox.Show($"Error printing: {ex.Message}", "Print Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }
}

