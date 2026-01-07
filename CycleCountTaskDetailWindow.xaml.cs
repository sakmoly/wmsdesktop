using System;
using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class CycleCountTaskDetailWindow : Window
{
    private readonly CycleCountTaskDetailViewModel _viewModel;

    public CycleCountTaskDetailWindow(CycleCountTask cycleCountTask)
    {
        InitializeComponent();
        _viewModel = new CycleCountTaskDetailViewModel(cycleCountTask);
        DataContext = _viewModel;
        
        // Handle task update event to refresh the window
        _viewModel.TaskUpdated += ViewModel_TaskUpdated;
    }

    private void ViewModel_TaskUpdated(object? sender, EventArgs e)
    {
        // Refresh the window title and any other UI elements if needed
        // The ViewModel will update the properties automatically
    }

    protected override void OnClosed(EventArgs e)
    {
        if (_viewModel != null)
        {
            _viewModel.TaskUpdated -= ViewModel_TaskUpdated;
        }
        base.OnClosed(e);
    }
}

