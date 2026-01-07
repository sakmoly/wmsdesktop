using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class PutawayTaskDetailWindow : Window
{
    public PutawayTaskDetailWindow(PutawayTask putawayTask)
    {
        InitializeComponent();
        DataContext = new PutawayTaskDetailViewModel(putawayTask);
    }
}

