using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public partial class InboundSessionDetailViewModel : ObservableObject
{
    public InboundSession Session { get; }
    
    private Asn? _asn;
    public Asn? Asn 
    { 
        get => _asn;
        private set => SetProperty(ref _asn, value);
    }
    
    private TransferOrder? _transferOrder;
    public TransferOrder? TransferOrder 
    { 
        get => _transferOrder;
        private set => SetProperty(ref _transferOrder, value);
    }

    // All unload lines (displayed in grid - no filtering needed)
    public ObservableCollection<InboundUnloadLine> UnloadLines { get; }
    
    // All receive lines (source collection)
    private readonly ObservableCollection<InboundReceiveLineEditable> _allReceiveLines;
    
    // Filtered receive lines (displayed in grid)
    public ObservableCollection<InboundReceiveLineEditable> ReceiveLines { get; }
    
    // Track currently filtered carton ID (null = show all)
    private string? _currentFilterCartonId;

    public string Status => Session.Status;
    public int TotalUnloads => Session.UnloadLines.Count;
    public int TotalReceiveLines => _allReceiveLines.Count;
    
    public double TotalReceivedQty => ReceiveLines.Sum(r => r.ReceivedQty);
    public double TotalExpectedQty => ReceiveLines.Sum(r => r.ExpectedQty);

    private InboundReceiveLineEditable? _selectedReceiveLine;
    public InboundReceiveLineEditable? SelectedReceiveLine
    {
        get => _selectedReceiveLine;
        set => SetProperty(ref _selectedReceiveLine, value);
    }

    public InboundSessionDetailViewModel(InboundSession session)
    {
        Session = session;
        _ = LoadRelatedDataAsync();

        // Initialize unload lines (no filtering needed)
        UnloadLines = new ObservableCollection<InboundUnloadLine>(session.UnloadLines);
        
        // Filter receive lines to only show items for cartons that have been unloaded
        // Get set of unloaded carton IDs (unit_id from unload lines where unit_type is "Carton")
        var unloadedCartonIds = new HashSet<string>(
            session.UnloadLines
                .Where(u => u.UnitType == "Carton")
                .Select(u => u.UnitId),
            StringComparer.OrdinalIgnoreCase
        );
        
        ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Found {unloadedCartonIds.Count} unloaded cartons: {string.Join(", ", unloadedCartonIds)}");
        ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Total receive lines before filtering: {session.ReceiveLines.Count}");
        
        // Only include receive lines where carton_id matches an unloaded carton
        var filteredReceiveLines = session.ReceiveLines
            .Where(r => 
            {
                var matches = unloadedCartonIds.Contains(r.CartonId);
                if (!matches)
                {
                    ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Filtering out receive line - CartonId: {r.CartonId} (not in unloaded cartons)");
                }
                return matches;
            })
            .Select(InboundReceiveLineEditable.FromInboundReceiveLine)
            .ToList();
        
        ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Total receive lines after filtering: {filteredReceiveLines.Count}");
        
        // Store all receive lines (source collection)
        _allReceiveLines = new ObservableCollection<InboundReceiveLineEditable>(filteredReceiveLines);
        
        // Initialize filtered collection with all receive lines (no filter applied initially)
        ReceiveLines = new ObservableCollection<InboundReceiveLineEditable>(filteredReceiveLines);

        // Subscribe to property changes to update totals
        foreach (var line in _allReceiveLines)
        {
            line.PropertyChanged += (s, e) =>
            {
                if (e.PropertyName == nameof(InboundReceiveLineEditable.ReceivedQty))
                {
                    OnPropertyChanged(nameof(TotalReceivedQty));
                }
            };
        }
    }

    /// <summary>
    /// Filters Receive Lines based on the double-clicked Unload Line's Unit ID.
    /// If an Unload Line is double-clicked, shows only Receive Lines for that carton.
    /// If the same line is double-clicked again, clears the filter (shows all).
    /// </summary>
    [RelayCommand]
    public void FilterReceiveLinesByUnloadLine(InboundUnloadLine? unloadLine)
    {
        ErrorLogService.LogInfo($"InboundSessionDetailViewModel: FilterReceiveLinesByUnloadLine called - UnloadLine: {(unloadLine == null ? "null" : $"{unloadLine.UnitType} - {unloadLine.UnitId}")}");
        
        if (unloadLine == null || string.IsNullOrEmpty(unloadLine.UnitId) || unloadLine.UnitType != "Carton")
        {
            // No selection, empty unit ID, or not a carton - show all receive lines
            _currentFilterCartonId = null;
            ErrorLogService.LogInfo($"InboundSessionDetailViewModel: No valid carton selected - showing all {_allReceiveLines.Count} receive lines");
        }
        else
        {
            var cartonId = unloadLine.UnitId;
            
            // If clicking the same carton again, clear the filter (toggle behavior)
            if (string.Equals(_currentFilterCartonId, cartonId, StringComparison.OrdinalIgnoreCase))
            {
                _currentFilterCartonId = null;
                ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Same carton double-clicked - clearing filter, showing all {_allReceiveLines.Count} receive lines");
            }
            else
            {
                // Filter to show only receive lines where CartonId matches the unload line's UnitId
                _currentFilterCartonId = cartonId;
                ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Filtering Receive Lines for Carton ID: {cartonId}");
            }
        }
        
        // Apply filter
        ReceiveLines.Clear();
        
        if (_currentFilterCartonId == null)
        {
            // Show all receive lines
            foreach (var receiveLine in _allReceiveLines)
            {
                ReceiveLines.Add(receiveLine);
            }
        }
        else
        {
            // Filter by carton ID
            ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Total receive lines in source: {_allReceiveLines.Count}");
            
            var matchingReceiveLines = _allReceiveLines
                .Where(r => string.Equals(r.CartonId, _currentFilterCartonId, StringComparison.OrdinalIgnoreCase))
                .ToList();
            
            ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Found {matchingReceiveLines.Count} matching receive line(s)");
            
            foreach (var receiveLine in matchingReceiveLines)
            {
                ReceiveLines.Add(receiveLine);
                ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Added receive line - CartonId: {receiveLine.CartonId}, ItemCode: {receiveLine.ItemCode}");
            }
            
            ErrorLogService.LogInfo($"InboundSessionDetailViewModel: Filtered Receive Lines collection now has {ReceiveLines.Count} item(s)");
        }
        
        // Update totals
        OnPropertyChanged(nameof(TotalReceivedQty));
        OnPropertyChanged(nameof(TotalExpectedQty));
    }

    [RelayCommand]
    private void AddReceiveLine()
    {
        // Get unloaded carton IDs (only cartons that have been unloaded can have receive lines)
        var unloadedCartonIds = UnloadLines
            .Where(u => u.UnitType == "Carton")
            .Select(u => u.UnitId)
            .Distinct()
            .ToList();

        if (!unloadedCartonIds.Any())
        {
            MessageBox.Show("No cartons have been unloaded yet. Please unload cartons first.", "Add Receive Line", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        // Get available cartons from ASN that have been unloaded
        var availableCartons = Asn?.Details
            .Where(d => !string.IsNullOrEmpty(d.CartonId) && unloadedCartonIds.Contains(d.CartonId!))
            .Select(d => d.CartonId!)
            .Distinct()
            .ToList() ?? new List<string>();

        if (!availableCartons.Any())
        {
            MessageBox.Show("No cartons available in ASN that have been unloaded.", "Add Receive Line", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        // Get available items from ASN for selected carton
        var firstCarton = availableCartons.First();
        var itemsForCarton = Asn?.Details
            .Where(d => d.CartonId == firstCarton)
            .ToList() ?? new List<AsnItemDetails>();

        if (!itemsForCarton.Any())
        {
            MessageBox.Show("No items found for carton.", "Add Receive Line", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var firstItem = itemsForCarton.First();
        var newLine = new InboundReceiveLineEditable
        {
            CartonId = firstCarton,
            ItemCode = firstItem.ItemCode,
            ExpectedQty = firstItem.ShippedQty,
            ReceivedQty = 0,
            Condition = "Good"
        };

        newLine.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(InboundReceiveLineEditable.ReceivedQty))
            {
                OnPropertyChanged(nameof(TotalReceivedQty));
            }
        };

        // Add to both collections
        _allReceiveLines.Add(newLine);
        ReceiveLines.Add(newLine);
        SelectedReceiveLine = newLine;
    }

    [RelayCommand]
    private void RemoveReceiveLine()
    {
        if (SelectedReceiveLine == null)
        {
            MessageBox.Show("Please select a receive line to remove.", "Remove Receive Line", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var result = MessageBox.Show(
            $"Remove receive line for {SelectedReceiveLine.ItemCode}?",
            "Confirm Removal",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result == MessageBoxResult.Yes)
        {
            // Remove from both collections
            _allReceiveLines.Remove(SelectedReceiveLine);
            ReceiveLines.Remove(SelectedReceiveLine);
            SelectedReceiveLine = null;
            OnPropertyChanged(nameof(TotalReceivedQty));
        }
    }

    [RelayCommand]
    private void IncrementReceivedQty()
    {
        if (SelectedReceiveLine != null)
        {
            SelectedReceiveLine.ReceivedQty += 1;
        }
    }

    [RelayCommand]
    private void DecrementReceivedQty()
    {
        if (SelectedReceiveLine != null && SelectedReceiveLine.ReceivedQty > 0)
        {
            SelectedReceiveLine.ReceivedQty -= 1;
        }
    }

    private async Task LoadRelatedDataAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                // Fallback to mock data
                Asn = MockDataService.GetAsnByTitle(Session.AdvanceShippingNotice);
                TransferOrder = !string.IsNullOrEmpty(Session.TransferOrder) 
                    ? MockDataService.GetTransferOrderByTitle(Session.TransferOrder)
                    : MockDataService.GetTransferOrderByAsn(Session.AdvanceShippingNotice);
                return;
            }

            Asn = await AsnDataService.GetAsnByTitleAsync(settings, Session.AdvanceShippingNotice);
            TransferOrder = !string.IsNullOrEmpty(Session.TransferOrder)
                ? await TransferOrderDataService.GetTransferOrderByTitleAsync(settings, Session.TransferOrder)
                : await TransferOrderDataService.GetTransferOrderByAsnAsync(settings, Session.AdvanceShippingNotice);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading related data in InboundSessionDetailViewModel", ex);
            // Fallback to mock data on error
            Asn = MockDataService.GetAsnByTitle(Session.AdvanceShippingNotice);
            TransferOrder = !string.IsNullOrEmpty(Session.TransferOrder) 
                ? MockDataService.GetTransferOrderByTitle(Session.TransferOrder)
                : MockDataService.GetTransferOrderByAsn(Session.AdvanceShippingNotice);
        }
    }
}

