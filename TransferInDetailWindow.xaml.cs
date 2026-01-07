using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class TransferInDetailWindow : Window
{
    public TransferInDetailWindow(TransferIn transferIn)
    {
        InitializeComponent();
        DataContext = new TransferInDetailViewModel(transferIn);
    }
}

