using System.Windows;
using Wms.Desktop.Services;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Windows;

public partial class CreateSortBoxWindow : Window
{
    public CreateSortBoxWindow()
    {
        InitializeComponent();
        
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Please configure database settings first.", "Settings Required",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            Close();
            return;
        }

        var viewModel = new CreateSortBoxViewModel(settings);
        viewModel.CloseDialog += (success) =>
        {
            DialogResult = success;
            Close();
        };
        
        DataContext = viewModel;
    }
}

