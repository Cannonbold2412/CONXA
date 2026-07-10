<#
.SYNOPSIS
  Launch Build Studio in Dev mode. Thin, discoverable wrapper.

.DESCRIPTION
  Equivalent to `.\scripts\conxa.ps1 dev studio` — kept as its own named script
  so "launch Build Studio in Dev mode" doesn't require remembering conxa.ps1's
  <env> <target> argument shape. Dev-only; never touches the Prod tree.

.EXAMPLE
  .\scripts\dev-studio.ps1
#>
param()

& "$PSScriptRoot\conxa.ps1" dev studio
