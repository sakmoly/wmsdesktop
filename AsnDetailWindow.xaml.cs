using System;
using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class AsnDetailWindow : Window
{
    private readonly string _asnTitle;

    public AsnDetailWindow(Asn asn)
    {
        InitializeComponent();
        _asnTitle = asn.Title;
        DataContext = new AsnDetailViewModel(asn);
        this.Loaded += AsnDetailWindow_Loaded;
    }

    private async void AsnDetailWindow_Loaded(object sender, RoutedEventArgs e)
    {
        // Refresh ASN data when window is loaded to get latest carton status
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings != null && settings.DatabaseExists && settings.TablesExist)
            {
                var refreshedAsn = await AsnDataService.GetAsnByTitleAsync(settings, _asnTitle);
                if (refreshedAsn != null)
                {
                    DataContext = new AsnDetailViewModel(refreshedAsn);
                    ErrorLogService.LogInfo($"AsnDetailWindow: Refreshed ASN {_asnTitle} with latest carton statuses");
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error refreshing ASN data in AsnDetailWindow", ex);
        }
    }
}


