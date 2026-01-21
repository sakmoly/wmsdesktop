using System;
using System.Collections.ObjectModel;
using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class RelocationSessionDetailViewModel : BaseViewModel
{
    private RelocationSession? _session;
    private string? _mode;
    private string? _warehouseId;
    private string? _fromBin;
    private string? _fromCarton;
    private string? _toBin;
    private string? _toCarton;
    private string? _policy;
    private CartonContents? _fromCartonContents;
    private CartonContents? _toCartonContents;

    public RelocationSession? Session
    {
        get => _session;
        set
        {
            if (_session != value)
            {
                _session = value;
                if (value != null)
                {
                    Mode = value.Mode;
                    WarehouseId = value.WarehouseId;
                    FromBin = value.FromBin;
                    FromCarton = value.FromCarton;
                    ToBin = value.ToBin;
                    ToCarton = value.ToCarton;
                    Policy = value.Policy;
                    
                    // Load lines
                    Lines.Clear();
                    foreach (var line in value.Lines)
                    {
                        Lines.Add(line);
                    }
                }
                OnPropertyChanged();
                OnPropertyChanged(nameof(SessionId));
                OnPropertyChanged(nameof(Status));
                OnPropertyChanged(nameof(CanSetFromLocation));
                OnPropertyChanged(nameof(CanSetToLocation));
                OnPropertyChanged(nameof(CanCommitFull));
                OnPropertyChanged(nameof(CanCommitPartial));
                OnPropertyChanged(nameof(CanViewCartonContents));
            }
        }
    }

    public string? Mode
    {
        get => _mode;
        set
        {
            if (_mode != value)
            {
                _mode = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsFullCartonMode));
                OnPropertyChanged(nameof(IsPartialMode));
                OnPropertyChanged(nameof(CanCommitFull));
                OnPropertyChanged(nameof(CanCommitPartial));
            }
        }
    }

    public string? WarehouseId
    {
        get => _warehouseId;
        set
        {
            if (_warehouseId != value)
            {
                _warehouseId = value;
                OnPropertyChanged();
            }
        }
    }

    public string? FromBin
    {
        get => _fromBin;
        set
        {
            if (_fromBin != value)
            {
                _fromBin = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanSetToLocation));
                OnPropertyChanged(nameof(CanCommitFull));
                OnPropertyChanged(nameof(CanCommitPartial));
            }
        }
    }

    public string? FromCarton
    {
        get => _fromCarton;
        set
        {
            if (_fromCarton != value)
            {
                _fromCarton = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanViewCartonContents));
            }
        }
    }

    public string? ToBin
    {
        get => _toBin;
        set
        {
            if (_toBin != value)
            {
                _toBin = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanCommitFull));
                OnPropertyChanged(nameof(CanCommitPartial));
            }
        }
    }

    public string? ToCarton
    {
        get => _toCarton;
        set
        {
            if (_toCarton != value)
            {
                _toCarton = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanCommitPartial));
            }
        }
    }

    public string? Policy
    {
        get => _policy;
        set
        {
            if (_policy != value)
            {
                _policy = value;
                OnPropertyChanged();
            }
        }
    }

    public CartonContents? FromCartonContents
    {
        get => _fromCartonContents;
        set
        {
            if (_fromCartonContents != value)
            {
                _fromCartonContents = value;
                OnPropertyChanged();
            }
        }
    }

    public CartonContents? ToCartonContents
    {
        get => _toCartonContents;
        set
        {
            if (_toCartonContents != value)
            {
                _toCartonContents = value;
                OnPropertyChanged();
            }
        }
    }

    public string SessionId => Session?.SessionId ?? "New Session";
    public string Status => Session?.Status ?? "IN_PROGRESS";

    public bool IsFullCartonMode => Mode == "FULL_CARTON";
    public bool IsPartialMode => Mode == "PARTIAL_ITEMS" || Mode == "CARTON_TO_CARTON";

    public bool CanSetFromLocation => Session != null && Status == "IN_PROGRESS";
    public bool CanSetToLocation => Session != null && Status == "IN_PROGRESS" && !string.IsNullOrWhiteSpace(FromBin);
    public bool CanViewCartonContents => !string.IsNullOrWhiteSpace(FromCarton) || !string.IsNullOrWhiteSpace(ToCarton);
    public bool CanCommitFull => Session != null && Status == "IN_PROGRESS" && IsFullCartonMode && 
                                 !string.IsNullOrWhiteSpace(FromCarton) && !string.IsNullOrWhiteSpace(ToBin);
    public bool CanCommitPartial => Session != null && Status == "IN_PROGRESS" && IsPartialMode && 
                                    !string.IsNullOrWhiteSpace(FromCarton) && !string.IsNullOrWhiteSpace(ToCarton) &&
                                    !string.IsNullOrWhiteSpace(ToBin) && // Require ToBin for partial/carton-to-carton moves
                                    (Lines.Count > 0 || Mode == "CARTON_TO_CARTON");

    public ObservableCollection<RelocationLine> Lines { get; } = new();

    public RelocationSessionDetailViewModel(RelocationSession? session = null, string? mode = null)
    {
        Session = session;
        Mode = mode;
        if (session == null && !string.IsNullOrWhiteSpace(mode))
        {
            // New session - set default policy
            Policy = mode == "FULL_CARTON" ? "BLIND" : "VERIFIED";
        }
    }
}
