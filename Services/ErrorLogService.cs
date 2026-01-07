using System;
using System.IO;
using System.Threading.Tasks;

namespace Wms.Desktop.Services;

public static class ErrorLogService
{
    private static readonly object _lockObject = new object();
    private static string? _logDirectory;
    private static string? _logFilePath;

    /// <summary>
    /// Initialize log directory and file path
    /// </summary>
    private static void InitializeLogPath()
    {
        if (_logDirectory != null)
            return;

        try
        {
            // Get application directory
            var appPath = AppDomain.CurrentDomain.BaseDirectory;
            _logDirectory = Path.Combine(appPath, "ErrorLogs");
            
            // Create directory if it doesn't exist
            if (!Directory.Exists(_logDirectory))
            {
                Directory.CreateDirectory(_logDirectory);
            }

            // Create log file path with date
            var dateStamp = DateTime.Now.ToString("yyyy-MM-dd");
            _logFilePath = Path.Combine(_logDirectory, $"error_{dateStamp}.log");
        }
        catch
        {
            // If we can't create logs, use temp directory as fallback
            _logDirectory = Path.GetTempPath();
            var dateStamp = DateTime.Now.ToString("yyyy-MM-dd");
            _logFilePath = Path.Combine(_logDirectory, $"wms_error_{dateStamp}.log");
        }
    }

    /// <summary>
    /// Write error message to log file
    /// </summary>
    public static void LogError(string errorMessage, Exception? exception = null)
    {
        try
        {
            InitializeLogPath();

            var logEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ERROR: {errorMessage}";
            
            if (exception != null)
            {
                logEntry += $"\nException Type: {exception.GetType().Name}";
                logEntry += $"\nException Message: {exception.Message}";
                logEntry += $"\nStack Trace: {exception.StackTrace}";
                
                if (exception.InnerException != null)
                {
                    logEntry += $"\nInner Exception: {exception.InnerException.Message}";
                }
            }
            
            logEntry += "\n" + new string('-', 80) + "\n";

            lock (_lockObject)
            {
                File.AppendAllText(_logFilePath!, logEntry);
            }
        }
        catch
        {
            // Silently fail if logging fails to avoid breaking the application
        }
    }

    /// <summary>
    /// Write error message to log file asynchronously
    /// </summary>
    public static async Task LogErrorAsync(string errorMessage, Exception? exception = null)
    {
        try
        {
            InitializeLogPath();

            var logEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ERROR: {errorMessage}";
            
            if (exception != null)
            {
                logEntry += $"\nException Type: {exception.GetType().Name}";
                logEntry += $"\nException Message: {exception.Message}";
                logEntry += $"\nStack Trace: {exception.StackTrace}";
                
                if (exception.InnerException != null)
                {
                    logEntry += $"\nInner Exception: {exception.InnerException.Message}";
                }
            }
            
            logEntry += "\n" + new string('-', 80) + "\n";

            await Task.Run(() =>
            {
                lock (_lockObject)
                {
                    File.AppendAllText(_logFilePath!, logEntry);
                }
            });
        }
        catch
        {
            // Silently fail if logging fails to avoid breaking the application
        }
    }

    /// <summary>
    /// Write informational message to log file
    /// </summary>
    public static void LogInfo(string message)
    {
        try
        {
            InitializeLogPath();

            var logEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] INFO: {message}\n";

            lock (_lockObject)
            {
                File.AppendAllText(_logFilePath!, logEntry);
            }
        }
        catch
        {
            // Silently fail if logging fails to avoid breaking the application
        }
    }

    /// <summary>
    /// Get the current log file path
    /// </summary>
    public static string GetLogFilePath()
    {
        InitializeLogPath();
        return _logFilePath ?? string.Empty;
    }
}

