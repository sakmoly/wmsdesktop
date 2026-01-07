using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class AisleListViewModel : BaseViewModel
{
    public ObservableCollection<Aisle> Aisles { get; } = new();

    public AisleListViewModel()
    {
        Aisles.Add(new Aisle
        {
            AisleName = "Aisle 01",
            ParentZone = "Zone A",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZA-A01"
        });

        Aisles.Add(new Aisle
        {
            AisleName = "Aisle 02",
            ParentZone = "Zone A",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZA-A02"
        });

        Aisles.Add(new Aisle
        {
            AisleName = "Aisle 01",
            ParentZone = "Zone B",
            Warehouse = "WH-MAIN",
            SystemId = "WH-MAIN-ZB-A01"
        });
    }
}


