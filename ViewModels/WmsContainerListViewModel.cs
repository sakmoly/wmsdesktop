using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class WmsContainerListViewModel : BaseViewModel
{
    public ObservableCollection<WmsContainer> Containers { get; } = new();

    public WmsContainerListViewModel()
    {
        // Sample containers based on the WMS Container DocType
        Containers.Add(new WmsContainer
        {
            ContainerId = "LPN-00001",
            ContainerType = "Carton",
            Status = "Loaded",
            CurrentBin = "BIN-REC-01",
            TareWeight = 1.2,
            Contents =
            [
                new WmsContainerItem
                {
                    Item = "SKU-TSHIRT-001-BLK-S",
                    Quantity = 100,
                    Uom = "Nos",
                    BatchNoSerialNo = "BATCH-TS-001"
                },
                new WmsContainerItem
                {
                    Item = "SKU-TSHIRT-001-BLK-M",
                    Quantity = 80,
                    Uom = "Nos",
                    BatchNoSerialNo = "BATCH-TS-002"
                }
            ]
        });

        Containers.Add(new WmsContainer
        {
            ContainerId = "LPN-00002",
            ContainerType = "Pallet",
            Status = "Staged",
            CurrentBin = "BIN-STAGE-01",
            TareWeight = 25,
            Contents =
            [
                new WmsContainerItem
                {
                    Item = "SKU-JEANS-021-BLU-32",
                    Quantity = 120,
                    Uom = "Nos",
                    BatchNoSerialNo = "BATCH-JE-010"
                }
            ]
        });
    }
}


