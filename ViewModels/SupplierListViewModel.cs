using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class SupplierListViewModel : BaseViewModel
{
    public ObservableCollection<Supplier> Suppliers { get; } = new();

    public SupplierListViewModel()
    {
        // Mock data inspired by ImportJson/vendors.json
        Suppliers.Add(new Supplier
        {
            Code = "VEND001",
            Name = "ABC Suppliers",
            Description = "Main supplier for clothing",
            ContactPerson = "John Smith",
            Phone = "+966501234567",
            Email = "john@abcsuppliers.com",
            Address = "123 Main Street, Riyadh",
            IsActive = true
        });

        Suppliers.Add(new Supplier
        {
            Code = "VEND002",
            Name = "XYZ Trading",
            Description = "Wholesale trading company",
            ContactPerson = "Ahmed Ali",
            Phone = "+966507654321",
            Email = "ahmed@xyztrading.com",
            Address = "456 Business District, Jeddah",
            IsActive = true
        });
    }
}


