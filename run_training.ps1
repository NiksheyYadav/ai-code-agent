# Run the training script and capture output
$ErrorActionPreference = "Stop"

Write-Host "Starting training script..."

# Activate the virtual environment
& .\venv\Scripts\Activate.ps1

# Run the training script and capture output
try {
    $output = & python -u train.py 2>&1
    $output | Out-File -FilePath "training_output.txt" -Encoding utf8
    Write-Host "Training script completed. Check training_output.txt for details."
} catch {
    $errorMessage = $_.Exception.Message
    Write-Host "Error running training script: $errorMessage"
    $errorMessage | Out-File -FilePath "training_error.txt" -Encoding utf8
}

Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
