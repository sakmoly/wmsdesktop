using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class SortBoxDetailWindow : Window
{
    public SortBoxDetailWindow(SortBox sortBox)
    {
        InitializeComponent();
        DataContext = new SortBoxDetailViewModel(sortBox);
    }
}

