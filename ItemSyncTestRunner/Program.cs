using Wms.Desktop.Services;

namespace Wms.Desktop.ItemSyncTestRunner;

/// <summary>
/// CLI auto-test for item sync (same steps as Items → Test Sync).
/// Usage:
///   dotnet run --project ItemSyncTestRunner
///   dotnet run --project ItemSyncTestRunner -- "D:\path\to\wms_settings.json"
/// </summary>
internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        Console.WriteLine("WMS Item Sync Auto Test");
        Console.WriteLine("=======================");
        Console.WriteLine();

        var settingsPath = ResolveSettingsPath(args);
        if (settingsPath == null)
        {
            Console.WriteLine("ERROR: wms_settings.json not found.");
            Console.WriteLine("Pass the full path as the first argument, or run from a folder that contains wms_settings.json.");
            return 1;
        }

        Console.WriteLine($"Settings file: {Path.GetFullPath(settingsPath)}");
        var settings = SettingsService.LoadSettingsFromFile(settingsPath);
        if (settings == null)
        {
            Console.WriteLine("ERROR: Could not parse settings.");
            return 1;
        }

        Console.WriteLine($"ERPNext URL: {settings.ErpNextApiUrl}");
        Console.WriteLine("Running ItemSyncTestService.TestErpNextConnectionAsync ...");
        Console.WriteLine();

        var result = await ItemSyncTestService.TestErpNextConnectionAsync(settings);

        foreach (var step in result.Steps)
        {
            var icon = step.Status switch
            {
                "Passed" => "[OK]",
                "Failed" => "[XX]",
                "Warning" => "[!!]",
                _ => "[--]"
            };
            Console.WriteLine($"{icon} {step.Name}: {step.Status}");
            if (!string.IsNullOrWhiteSpace(step.Message))
                Console.WriteLine($"    {step.Message}");
        }

        Console.WriteLine();
        if (result.Success)
        {
            Console.WriteLine("RESULT: SUCCESS");
            if (!string.IsNullOrWhiteSpace(result.Message))
                Console.WriteLine(result.Message);
            return 0;
        }

        Console.WriteLine("RESULT: FAILED — see steps above and ErrorLogs.");
        return 2;
    }

    private static string? ResolveSettingsPath(string[] args)
    {
        if (args.Length > 0 && File.Exists(args[0]))
            return args[0];

        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "wms_settings.json"),
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "bin", "Debug", "net8.0-windows", "wms_settings.json"),
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "bin", "Release", "net8.0-windows", "wms_settings.json"),
        };

        foreach (var c in candidates)
        {
            try
            {
                var full = Path.GetFullPath(c);
                if (File.Exists(full))
                    return full;
            }
            catch { /* ignore */ }
        }

        return null;
    }
}
