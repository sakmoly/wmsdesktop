using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class HomeViewModel : BaseViewModel
{
    private bool _isRunning;
    public bool IsRunning { get => _isRunning; set { _isRunning = value; OnPropertyChanged(); OnPropertyChanged(nameof(CanRunPushAndPull)); } }
    public bool CanRunPushAndPull => !_isRunning;

    public ICommand PushAndPullCommand { get; }

    public HomeViewModel()
    {
        PushAndPullCommand = new RelayCommand(_ => _ = RunPushAndPullAsync(), _ => CanRunPushAndPull);
    }

    private async Task RunPushAndPullAsync()
    {
        if (IsRunning) return;
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not found. Open Settings to configure.", "Push & Pull", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        IsRunning = true;
        try
        {
            var result = await SyncOrchestrationService.RunPushAndPullAsync(settings);
            var title = result.Success ? "Push & Pull completed" : "Push & Pull finished with errors";
            var icon = result.Success ? MessageBoxImage.Information : MessageBoxImage.Warning;
            MessageBox.Show(result.Summary, title, MessageBoxButton.OK, icon);
        }
        catch (System.Exception ex)
        {
            Services.ErrorLogService.LogError("HomeViewModel: Push & Pull error", ex);
            MessageBox.Show("Error: " + ex.Message, "Push & Pull", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsRunning = false;
        }
    }
}
