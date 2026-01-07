using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class RackListViewModel : BaseViewModel
{
    public ObservableCollection<Rack> Racks { get; } = new();

    public RackListViewModel()
    {
        Racks.Add(new Rack
        {
            RackName = "Rack 01",
            ParentAisle = "Aisle 01",
            ParentZone = "Zone A",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZA-A01-R01"
        });

        Racks.Add(new Rack
        {
            RackName = "Rack 02",
            ParentAisle = "Aisle 01",
            ParentZone = "Zone A",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZA-A01-R02"
        });

        Racks.Add(new Rack
        {
            RackName = "Rack 01",
            ParentAisle = "Aisle 01",
            ParentZone = "Zone B",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZB-A01-R01"
        });
    }
}


