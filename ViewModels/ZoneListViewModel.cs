using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class ZoneListViewModel : BaseViewModel
{
    public ObservableCollection<Zone> Zones { get; } = new();

    public ZoneListViewModel()
    {
        Zones.Add(new Zone
        {
            ZoneName = "Zone A",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZA",
            ZoneType = "Hierarchical"
        });

        Zones.Add(new Zone
        {
            ZoneName = "Zone B",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZB",
            ZoneType = "Hierarchical"
        });

        Zones.Add(new Zone
        {
            ZoneName = "Staging Area",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-STAGE",
            ZoneType = "Flat/Open"
        });
    }
}


