param(
    [string]$PremiereExePath = '',
    [string]$ProjectPath = '',
    [string]$TempDir = $env:PREMIERE_TEMP_DIR,
    [int]$PremiereLaunchWaitSeconds = 25,
    [int]$BridgeWarmupSeconds = 8
)

$ErrorActionPreference = 'Stop'

function Resolve-TrimmedString {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ''
    }

    return $Value.Trim()
}

function Resolve-BridgeDirectory {
    param([string]$ConfiguredTempDir)

    $candidate = Resolve-TrimmedString $ConfiguredTempDir
    if ($candidate) {
        return $candidate
    }

    if (-not [string]::IsNullOrWhiteSpace($env:PREMIERE_MCP_COMMAND_FILE)) {
        return Split-Path -Path $env:PREMIERE_MCP_COMMAND_FILE -Parent
    }

    return ''
}

function Resolve-PremiereExecutablePath {
    param([string]$ConfiguredPath)

    $candidate = Resolve-TrimmedString $ConfiguredPath
    if (-not $candidate) {
        $candidate = Resolve-TrimmedString $env:PREMIERE_EXE_PATH
    }

    if ($candidate -and (Test-Path $candidate)) {
        return $candidate
    }

    return ''
}

function Resolve-RecoveryProjectPath {
    param(
        [string]$ConfiguredProjectPath,
        [string]$BridgeDirectory
    )

    $candidate = Resolve-TrimmedString $ConfiguredProjectPath
    if ($candidate) {
        return $candidate
    }

    if (-not $BridgeDirectory) {
        return ''
    }

    $contextPath = Join-Path $BridgeDirectory 'bridge-recovery-context.json'
    if (-not (Test-Path $contextPath)) {
        return ''
    }

    try {
        $context = Get-Content -Path $contextPath -Raw | ConvertFrom-Json
        if ($context -and -not [string]::IsNullOrWhiteSpace($context.projectPath)) {
            return [string]$context.projectPath
        }
    } catch {
        return ''
    }

    return ''
}

function Write-BridgeBootstrapConfig {
    param([string]$BridgeDirectory)

    if (-not $BridgeDirectory) {
        return
    }

    $tempRoot = Resolve-TrimmedString $env:TEMP
    if (-not $tempRoot) {
        $tempRoot = 'C:\Temp'
    }

    $defaultBridgeRoot = Join-Path $tempRoot 'premiere-mcp-bridge'
    New-Item -ItemType Directory -Path $defaultBridgeRoot -Force | Out-Null

    $configPath = Join-Path $defaultBridgeRoot 'config.json'
    $payload = @{
        tempDirectory = $BridgeDirectory
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        source = 'recover-windows-cep-bridge.ps1'
    } | ConvertTo-Json

    Set-Content -Path $configPath -Value $payload -Encoding UTF8
}

function Stop-RecoveryProcesses {
    $targets = @(
        'Adobe Media Encoder',
        'dynamiclinkmanager',
        'TeamProjectsLocalHub',
        'CEPHtmlEngine',
        'Adobe Premiere Pro'
    )

    Get-Process -Name $targets -ErrorAction SilentlyContinue | Stop-Process -Force
}

function Start-PremiereRecovery {
    param(
        [string]$ExecutablePath,
        [string]$RecoveredProjectPath
    )

    if ($ExecutablePath) {
        if ($RecoveredProjectPath -and (Test-Path $RecoveredProjectPath)) {
            Start-Process -FilePath $ExecutablePath -ArgumentList ('"' + $RecoveredProjectPath + '"')
        } else {
            Start-Process -FilePath $ExecutablePath
        }
        return
    }

    if ($RecoveredProjectPath -and (Test-Path $RecoveredProjectPath)) {
        Start-Process -FilePath $RecoveredProjectPath
        return
    }

    throw 'Premiere recovery requires a valid Premiere executable path or project path.'
}

$BridgeDirectory = Resolve-BridgeDirectory -ConfiguredTempDir $TempDir
$ResolvedPremiereExe = Resolve-PremiereExecutablePath -ConfiguredPath $PremiereExePath
$ResolvedProjectPath = Resolve-RecoveryProjectPath -ConfiguredProjectPath $ProjectPath -BridgeDirectory $BridgeDirectory

Write-BridgeBootstrapConfig -BridgeDirectory $BridgeDirectory
Stop-RecoveryProcesses
Start-Sleep -Seconds 3
Start-PremiereRecovery -ExecutablePath $ResolvedPremiereExe -RecoveredProjectPath $ResolvedProjectPath
Start-Sleep -Seconds $PremiereLaunchWaitSeconds

if ($ResolvedProjectPath -and $ResolvedPremiereExe -and (Test-Path $ResolvedProjectPath)) {
    Start-Process -FilePath $ResolvedProjectPath
}

Start-Sleep -Seconds $BridgeWarmupSeconds
Write-Output 'Premiere MCP bridge recovery completed.'
