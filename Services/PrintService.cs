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
}

