using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class TransferCartonDetailWindow : Window
{
    public TransferCartonDetailWindow(TransferCarton transferCarton)
    {
        InitializeComponent();
        DataContext = new TransferCartonDetailViewModel(transferCarton);
    }
}

