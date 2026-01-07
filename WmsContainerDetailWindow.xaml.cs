using System.Linq;
using System.Windows;
using Wms.Desktop.Models;

namespace Wms.Desktop;

public sealed class WmsContainerDetailViewModel
{
    public WmsContainer Container { get; }

    public int TotalLines => Container.Contents.Count;
    public double TotalQty => Container.Contents.Sum(i => i.Quantity);

    public WmsContainerDetailViewModel(WmsContainer container)
    {
        Container = container;
    }
}

public partial class WmsContainerDetailWindow : Window
{
    public WmsContainerDetailWindow(WmsContainer container)
    {
        InitializeComponent();
        DataContext = new WmsContainerDetailViewModel(container);
    }
}


