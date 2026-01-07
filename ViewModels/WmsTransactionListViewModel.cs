using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class WmsTransactionListViewModel : BaseViewModel
{
    public ObservableCollection<WmsTransaction> Transactions { get; } = new();

    public WmsTransactionListViewModel()
    {
        _ = LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                // Fallback to mock data if database not available
                LoadMockData();
                return;
            }

            // Check and create missing transactions for existing data
            await WmsTransactionAutoCreateService.CreateMissingTransactionsAsync(settings);

            // Load transactions from database
            var transactions = await WmsTransactionDataService.GetWmsTransactionsAsync(settings);
            foreach (var transaction in transactions)
            {
                Transactions.Add(transaction);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading WMS Transactions in ViewModel", ex);
            // Fallback to mock data on error
            LoadMockData();
        }
    }

    private void LoadMockData()
    {
        // Transaction 1: Receiving against ASN-0001 / PO-0001
        var t1Details = new System.Collections.ObjectModel.ObservableCollection<WmsTransactionItemDetail>
        {
            new WmsTransactionItemDetail
            {
                ItemCode = "SKU-TSHIRT-001-BLK-S",
                ItemName = "Basic T-Shirt Black S",
                Qty = 600,
                Uom = "Nos",
                ContainerId = "CARTON-0001",
                SourceBin = "DOCK-01",
                TargetBin = "A1-R01-L1-B1",
                AssignmentStatus = "In Progress",
                AssignedOperator = "john.doe"
            },
            new WmsTransactionItemDetail
            {
                ItemCode = "SKU-TSHIRT-001-BLK-M",
                ItemName = "Basic T-Shirt Black M",
                Qty = 600,
                Uom = "Nos",
                ContainerId = "CARTON-0002",
                SourceBin = "DOCK-01",
                TargetBin = "A1-R01-L2-B1",
                AssignmentStatus = "Pending",
                AssignedOperator = "john.doe"
            }
        };

        var t1Users = new System.Collections.ObjectModel.ObservableCollection<WmsActiveUser>
        {
            new WmsActiveUser { User = "john.doe", AssignedItemsCount = 2, CompletedItemsCount = 0, Status = "Active" }
        };

        Transactions.Add(new WmsTransaction
        {
            Title = "WMS-TRANS-0001",
            Status = "Submitted",
            OperationType = OperationType.Receiving,
            TransactionDate = DateTime.Now.AddMinutes(-30),
            AssignedTo = "john.doe",
            SourceWarehouse = "WH-MAIN",
            TargetWarehouse = "WH-MAIN",
            ReferenceDocType = "Advance Shipping Notice",
            ReferenceDoc = "ASN-0001",
            TransactionStatus = "In Progress",
            PrimaryAssignee = "john.doe",
            CompletionProgress = 40,
            IsLocked = true,
            Details = t1Details,
            ConcurrentUsers = t1Users,
            ReceivingDock = "DOCK-01",
            RequireQC = true
        });

        // Transaction 2: Picking for TO-0001
        var t2Details = new System.Collections.ObjectModel.ObservableCollection<WmsTransactionItemDetail>
        {
            new WmsTransactionItemDetail
            {
                ItemCode = "SKU-TSHIRT-001-BLK-S",
                ItemName = "Basic T-Shirt Black S",
                Qty = 150,
                Uom = "Nos",
                ContainerId = "TOTE-001",
                SourceBin = "A1-R01-L1-B1",
                TargetBin = "STAGE-01",
                AssignmentStatus = "Done",
                AssignedOperator = "ahmed.ali"
            },
            new WmsTransactionItemDetail
            {
                ItemCode = "SKU-TSHIRT-001-BLK-M",
                ItemName = "Basic T-Shirt Black M",
                Qty = 200,
                Uom = "Nos",
                ContainerId = "TOTE-002",
                SourceBin = "A1-R01-L2-B1",
                TargetBin = "STAGE-01",
                AssignmentStatus = "In Progress",
                AssignedOperator = "ahmed.ali"
            }
        };

        var t2Users = new System.Collections.ObjectModel.ObservableCollection<WmsActiveUser>
        {
            new WmsActiveUser { User = "ahmed.ali", AssignedItemsCount = 2, CompletedItemsCount = 1, Status = "Active" }
        };

        Transactions.Add(new WmsTransaction
        {
            Title = "WMS-TRANS-0002",
            Status = "Submitted",
            OperationType = OperationType.Picking,
            TransactionDate = DateTime.Now.AddMinutes(-10),
            AssignedTo = "ahmed.ali",
            SourceWarehouse = "WH-MAIN",
            TargetWarehouse = "ST-RYD-01",
            ReferenceDocType = "Transfer Order",
            ReferenceDoc = "TO-0001",
            TransactionStatus = "Partial",
            PrimaryAssignee = "ahmed.ali",
            CompletionProgress = 60,
            IsLocked = false,
            Details = t2Details,
            ConcurrentUsers = t2Users,
            PickingWave = "WAVE-001",
            PickRoute = "ROUTE-A"
        });
    }
}


