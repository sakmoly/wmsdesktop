using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class ItemGroupListViewModel : BaseViewModel
{
    public ObservableCollection<ItemGroup> ItemGroups { get; } = new();

    public ItemGroupListViewModel()
    {
        ItemGroups.Add(new ItemGroup
        {
            Code = "ROOT",
            Name = "All Item Groups",
            ParentGroup = null,
            IsGroup = true
        });

        ItemGroups.Add(new ItemGroup
        {
            Code = "APPAREL",
            Name = "Apparel",
            ParentGroup = "ROOT",
            IsGroup = true
        });

        ItemGroups.Add(new ItemGroup
        {
            Code = "APPAREL-TSHIRT",
            Name = "T-Shirts",
            ParentGroup = "APPAREL",
            IsGroup = false
        });

        ItemGroups.Add(new ItemGroup
        {
            Code = "APPAREL-JEANS",
            Name = "Jeans",
            ParentGroup = "APPAREL",
            IsGroup = false
        });

        ItemGroups.Add(new ItemGroup
        {
            Code = "PACK",
            Name = "Packaging",
            ParentGroup = "ROOT",
            IsGroup = false
        });
    }
}


