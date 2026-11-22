# Bounded security snapshot/backup restoration for the explicitly approved new fixture.
param([ValidateSet('snapshot','inspect','restore-dacl','prepare-metadata','cleanup','resume-cleanup')][string]$Operation='inspect', [ValidatePattern('^(file-task-evidence|web-file-task-evidence|web-managed-[a-f0-9]{32})$')][string]$EvidenceSet='file-task-evidence')
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixture=Join-Path $project 'fixtures\file-task-20261031'
$tempRoot=Join-Path $project '.runtime\file-task-temp'
$journal=Join-Path $project ('.runtime\'+$EvidenceSet)
[IO.Directory]::CreateDirectory($journal)|Out-Null
Add-Type -TypeDefinition @'
using System;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Security.Principal;
public static class FileTaskLabelReader {
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern uint GetNamedSecurityInfoW(string p,int t,uint i,out IntPtr o,out IntPtr g,out IntPtr d,out IntPtr s,out IntPtr sd);
 [DllImport("advapi32.dll")]static extern bool GetAce(IntPtr a,uint n,out IntPtr e);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern uint SetNamedSecurityInfoW(string p,int t,uint i,IntPtr o,IntPtr g,IntPtr d,IntPtr s);
 [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr p);
 public static object[] Read(string p){IntPtr o,g,d,s,sd;uint code=GetNamedSecurityInfoW(p,1,16,out o,out g,out d,out s,out sd);if(code!=0)throw new Exception("Read label Win32 "+code+" "+p);try{var r=new List<object>();if(s!=IntPtr.Zero){int count=(ushort)Marshal.ReadInt16(s,4);for(uint i=0;i<count;i++){IntPtr ace;if(!GetAce(s,i,out ace))throw new Exception("GetAce failed");if(Marshal.ReadByte(ace)==17)r.Add(new{sid=new SecurityIdentifier(IntPtr.Add(ace,8)).Value,mask=Marshal.ReadInt32(ace,4)});}}return r.ToArray();}finally{LocalFree(sd);}}
 public static void Clear(string p){uint code=SetNamedSecurityInfoW(p,1,16,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);if(code!=0)throw new Exception("Clear label Win32 "+code+" "+p);}
}
'@
$access=[Security.AccessControl.AccessControlSections]::Access
function Observe($item){
 $p=[IO.Path]::GetFullPath($item.FullName)
 if($p -ne $fixture -and !$p.StartsWith($fixture+'\',[StringComparison]::OrdinalIgnoreCase) -and $p -ne $tempRoot -and !$p.StartsWith($tempRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Outside approved fixture/temp'}
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point refused'}
 $a=Get-Acl -LiteralPath $p
 [ordered]@{path=$p;directory=$item.PSIsContainer;owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;dacl=$a.GetSecurityDescriptorSddlForm($access);labels=@([FileTaskLabelReader]::Read($p));sha256=if($item.PSIsContainer){$null}else{(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}}
}
function Collect { $items=@(Get-Item -LiteralPath $fixture -Force)+@(Get-ChildItem -LiteralPath $fixture -Recurse -Force);if(Test-Path -LiteralPath $tempRoot){$items+=@(Get-Item -LiteralPath $tempRoot -Force)+@(Get-ChildItem -LiteralPath $tempRoot -Recurse -Force)};@($items|ForEach-Object{Observe $_}) }
$baseline=Join-Path $journal 'security-baseline.json'
if($Operation -eq 'cleanup' -or $Operation -eq 'resume-cleanup'){
 $saved=@(Get-Content -LiteralPath $baseline -Raw|ConvertFrom-Json);$before=@(Collect);$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $recordFile=Join-Path $journal 'cleanup-before.json'
 if($Operation -eq 'cleanup'){if(Test-Path -LiteralPath $recordFile){throw 'Cleanup already attempted; inspect recovery record before repeating'};$before|ConvertTo-Json -Depth 15|Set-Content -LiteralPath $recordFile -Encoding utf8}
 else{if(!(Test-Path -LiteralPath $recordFile)){throw 'Missing original cleanup record'};$before=@(Get-Content -LiteralPath $recordFile -Raw|ConvertFrom-Json)}
 foreach($r in $before){if($r.owner -ne $sid){throw 'Unexpected object owner; stop'};foreach($label in $r.labels){if($label.sid -ne 'S-1-16-4096' -or $label.mask -ne 1){throw 'Unexpected label; stop'}}}
 # Same narrowly authorized label clearing used by the existing Managed Shell.
 foreach($r in $before){if($r.labels.Count){[FileTaskLabelReader]::Clear($r.path)}}
 # Only fresh objects inside the authorized temp subtree: restore inheritance,
 # retaining owner/content. Restore baseline fixture/temp-root DACLs last.
 $known=@{};foreach($r in $saved){$known[$r.path]=$r}
 foreach($r in @($before|Where-Object{!$known.ContainsKey($_.path)}|Sort-Object{ $_.path.Length } -Descending)){
  if(!$r.path.StartsWith($tempRoot+'\',[StringComparison]::OrdinalIgnoreCase) -and !$r.path.StartsWith($fixture+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected new object outside approved fixture/temp subtree'}
  $a=if($r.directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()};$a.SetAccessRuleProtection($false,$false);Set-Acl -LiteralPath $r.path -AclObject $a
 }
 $disappearedTemp=@()
 foreach($r in @($saved|Sort-Object{ $_.path.Length } -Descending)){
  if(!(Test-Path -LiteralPath $r.path)){
   if($r.path.StartsWith((Join-Path $tempRoot 'dsh-task-20261031')+'\dsh-',[StringComparison]::OrdinalIgnoreCase)){$disappearedTemp+=$r.path;continue}
   throw ('Non-disposable baseline object missing: '+$r.path)
  }
  $a=if($r.directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()};$a.SetSecurityDescriptorSddlForm($r.dacl,$access);Set-Acl -LiteralPath $r.path -AclObject $a
 }
 $after=@(Collect);$errors=@();foreach($r in $after){$old=$saved|Where-Object path -eq $r.path;$prior=$before|Where-Object path -eq $r.path;if($r.labels.Count -or $r.owner -ne $prior.owner -or $r.sha256 -ne $prior.sha256){$errors+=('label/owner/content drift: '+$r.path)};if($old -and $r.dacl -ne $old.dacl){$errors+=('baseline DACL mismatch: '+$r.path)};if(!$old){$acl=Get-Acl -LiteralPath $r.path;if(@($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])).Count){$errors+=('fresh temp explicit DACL remains: '+$r.path)}}}
 @{objects=$after.Count;errors=$errors;security=$after;disappearedDisposableTemp=$disappearedTemp}|ConvertTo-Json -Depth 15|Set-Content -LiteralPath (Join-Path $journal 'cleanup-verified.json') -Encoding utf8
 if($errors.Count){throw ($errors -join '; ')}
 Write-Output ('CLEANUP_VERIFIED objects='+$after.Count);exit 0
}
if($Operation -eq 'prepare-metadata'){
 $targetTemp=Join-Path $tempRoot 'dsh-task-20261031'
 $backup=Join-Path $journal 'before-metadata.json';if(Test-Path -LiteralPath $backup){throw 'Metadata preparation already attempted; inspect before repeating'}
 @((Observe (Get-Item -LiteralPath $fixture)),(Observe (Get-Item -LiteralPath $targetTemp)))|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $backup -Encoding utf8
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 foreach($p in @($fixture,$targetTemp)){$a=Get-Acl -LiteralPath $p;if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Unexpected owner'};$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::TakeOwnership,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $p -AclObject $a}
 Write-Output 'LIMITED_METADATA_READY';exit 0
}
if($Operation -eq 'snapshot'){
 if(Test-Path -LiteralPath $baseline){throw 'Baseline exists; never overwrite'}
 [IO.Directory]::CreateDirectory($tempRoot)|Out-Null
 $records=@(Collect);if(@($records|Where-Object{$_.labels.Count}).Count){throw 'Unexpected pre-existing integrity label'}
 $records|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $baseline -Encoding utf8
 Write-Output ('BASELINE_SAVED objects='+$records.Count);exit 0
}
if($Operation -eq 'restore-dacl'){
 $saved=Get-Content -LiteralPath $baseline -Raw|ConvertFrom-Json
 foreach($r in $saved){if(!(Test-Path -LiteralPath $r.path)){throw 'Baseline object missing'};$now=Observe (Get-Item -LiteralPath $r.path -Force);if($now.owner -ne $r.owner){throw 'Owner changed; stop'};if($now.labels.Count){throw 'Native labels remain; do not hide by DACL restoration'};$a=if($r.directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()};$a.SetSecurityDescriptorSddlForm($r.dacl,$access);Set-Acl -LiteralPath $r.path -AclObject $a}
}
$records=@(Collect);$records|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $journal 'security-current.json') -Encoding utf8
$diff=@();if(Test-Path -LiteralPath $baseline){$saved=Get-Content -LiteralPath $baseline -Raw|ConvertFrom-Json;foreach($r in $records){$old=$saved|Where-Object path -eq $r.path;if(!$old){$diff+=@{path=$r.path;newObject=$true;labels=$r.labels}}elseif($old.dacl -ne $r.dacl -or $old.owner -ne $r.owner -or ($r.labels|ConvertTo-Json -Compress) -ne ($old.labels|ConvertTo-Json -Compress)){$diff+=@{path=$r.path;securityChanged=$true;labels=$r.labels}}}}
@{objects=$records.Count;securityDifferences=$diff}|ConvertTo-Json -Depth 12
