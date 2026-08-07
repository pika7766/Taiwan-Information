$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot

function Test-Java21([string]$javaHome) {
  if (-not $javaHome) { return $false }
  $java = Join-Path $javaHome 'bin\java.exe'
  if (-not (Test-Path -LiteralPath $java)) { return $false }
  $releaseFile = Join-Path $javaHome 'release'
  if (-not (Test-Path -LiteralPath $releaseFile)) { return $false }
  return [bool](Select-String -LiteralPath $releaseFile -Pattern '^JAVA_VERSION="21\.' -Quiet)
}

$jdkCandidates = @(
  $env:JAVA_HOME,
  (Get-ChildItem "$env:LOCALAPPDATA\Programs\Java\temurin-21" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName),
  'C:\Program Files\Eclipse Adoptium\jdk-21'
) | Where-Object { $_ }
$jdk21 = $jdkCandidates | Where-Object { Test-Java21 $_ } | Select-Object -First 1
if (-not $jdk21) {
  throw 'JDK 21 was not found. Install Temurin 21 or point JAVA_HOME to JDK 21.'
}

$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path -LiteralPath (Join-Path $androidSdk 'platforms\android-36'))) {
  throw 'Android SDK 36 was not found. Install Android 16 / API 36 from Android Studio SDK Manager.'
}

$env:JAVA_HOME = $jdk21
$env:ANDROID_HOME = $androidSdk
Push-Location $projectDir
try {
  & npm.cmd run prepare:native
  if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
  Push-Location (Join-Path $projectDir 'android')
  try {
    & .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw 'Android APK build failed.' }
  } finally {
    Pop-Location
  }
  & node scripts/collect-apk.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Unable to collect the generated APK.' }
} finally {
  Pop-Location
}
