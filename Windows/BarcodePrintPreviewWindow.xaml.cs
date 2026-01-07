using System.Windows;
using System.Windows.Media.Imaging;
using Wms.Desktop.Services;

namespace Wms.Desktop.Windows;

public partial class BarcodePrintPreviewWindow : Window
{
    private readonly BitmapImage _barcodeImage;
    private readonly string _labelText;

    public BarcodePrintPreviewWindow(BitmapImage barcodeImage, string labelText)
    {
        InitializeComponent();
        _barcodeImage = barcodeImage;
        _labelText = labelText;

        // Set preview content
        BarcodeImage.Source = barcodeImage;
        BarcodeText.Text = labelText;
    }

    private void PrintButton_Click(object sender, RoutedEventArgs e)
    {
        var success = PrintService.PrintLabel(_barcodeImage, _labelText, labelWidth: 4.0, labelHeight: 2.0);
        if (success)
        {
            DialogResult = true;
            Close();
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}

