using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class BrandListViewModel : BaseViewModel
{
    public ObservableCollection<Brand> Brands { get; } = new();

    public BrandListViewModel()
    {
        Brands.Add(new Brand
        {
            Code = "PRINTECHS",
            Name = "Printechs",
            Description = "House brand",
            IsActive = true
        });

        Brands.Add(new Brand
        {
            Code = "URBANLINE",
            Name = "UrbanLine",
            Description = "Denim and streetwear line",
            IsActive = true
        });

        Brands.Add(new Brand
        {
            Code = "LEGACY",
            Name = "Legacy",
            Description = "Clearance / legacy items",
            IsActive = false
        });
    }
}


