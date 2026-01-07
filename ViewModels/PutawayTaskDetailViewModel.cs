using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class PutawayTaskDetailViewModel : BaseViewModel
{
    public PutawayTask PutawayTask { get; }

    public int TotalLines => PutawayTask.Lines?.Count ?? 0;

    public double TotalQty => PutawayTask.Lines?.Sum(l => l.Qty) ?? 0;

    public PutawayTaskDetailViewModel(PutawayTask putawayTask)
    {
        PutawayTask = putawayTask;
    }
}

