' Start WMS API Server in hidden window
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get script directory
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if .env exists
envPath = scriptPath & "\.env"
If Not fso.FileExists(envPath) Then
    MsgBox "ERROR: .env file not found!" & vbCrLf & vbCrLf & _
           "Please copy .env.template to .env and configure it.", vbCritical, "WMS API Server"
    WScript.Quit
End If

' Check if executable exists
exePath = scriptPath & "\wms-api.exe"
If Not fso.FileExists(exePath) Then
    MsgBox "ERROR: wms-api.exe not found!" & vbCrLf & vbCrLf & _
           "Expected location: " & exePath, vbCritical, "WMS API Server"
    WScript.Quit
End If

' Start process hidden
WshShell.Run """" & exePath & """", 0, False

' Optional: Show notification
' WshShell.Popup "WMS API Server started in background." & vbCrLf & vbCrLf & _
'                "Check http://localhost:3000/health to verify.", 3, "WMS API Server", vbInformation
