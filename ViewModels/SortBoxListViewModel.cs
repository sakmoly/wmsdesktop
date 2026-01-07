using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.Windows;

namespace Wms.Desktop.ViewModels;

public sealed partial class SortBoxListViewModel : BaseViewModel
{
    public ObservableCollection<SortBox> SortBoxes { get; } = new();

    public SortBoxListViewModel()
    {
        // Don't load in constructor - wait for Loaded event
    }

    public async Task RefreshAsync()
    {
        await LoadDataAsync();
    }

    [RelayCommand]
    private void CreateNewBox()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                MessageBox.Show("Please configure database settings and create database tables first.", 
                    "Database Required", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var createWindow = new CreateSortBoxWindow
            {
                Owner = Application.Current.MainWindow
            };

            var result = createWindow.ShowDialog();
            
            if (result == true)
            {
                // Refresh the list to show the new box
                _ = RefreshAsync();
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error opening Create Sort Box window", ex);
            MessageBox.Show($"Error opening Create Sort Box window:\n\n{ex.Message}", 
                "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task LoadDataAsync()
    {
        try
        {
            ErrorLogService.LogInfo("SortBoxListViewModel: Starting to load sort boxes");
            
            // Clear existing data
            SortBoxes.Clear();
            
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                ErrorLogService.LogInfo("SortBoxListViewModel: Database not available - using mock data");
                // Fallback to mock data if database not available
                foreach (var box in MockDataService.GetSortBoxes())
                {
                    SortBoxes.Add(box);
                }
                ErrorLogService.LogInfo($"SortBoxListViewModel: Added {SortBoxes.Count} mock sort boxes");
                return;
            }

            var boxes = await SortBoxDataService.GetSortBoxesAsync(settings);
            ErrorLogService.LogInfo($"SortBoxListViewModel: Received {boxes.Count} sort boxes from service");
            
            foreach (var box in boxes)
            {
                SortBoxes.Add(box);
            }
            
            ErrorLogService.LogInfo($"SortBoxListViewModel: Added {SortBoxes.Count} sort boxes to collection");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Sort Boxes in ViewModel", ex);
            // Fallback to mock data on error
            foreach (var box in MockDataService.GetSortBoxes())
            {
                SortBoxes.Add(box);
            }
            ErrorLogService.LogInfo($"SortBoxListViewModel: Added {SortBoxes.Count} mock sort boxes after error");
        }
    }
}

