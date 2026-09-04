; =====================================================
; ClaudeInstall 安装器（Inno Setup）· v0.2
; 给国内小白：向导收 DeepSeek Key → 调 ClaudeInstall一键安装.bat
;   自动装 Node + Git + Claude Code + 写配置（跳过登录）
; 编译：ISCC.exe "ClaudeInstall安装器.iss"
; =====================================================

#define AppName "ClaudeInstall"
#define AppVersion "0.2"
#define AppExeName "ClaudeInstall一键安装.bat"
#define BatchCmd "ClaudeInstall一键安装.bat"

[Setup]
AppId={{2F8C1A56-7D9B-4E3A-9C05-1B6D2F8A4E71}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=ClaudeInstall
DefaultDirName={localappdata}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
OutputDir=dist_installer
OutputBaseFilename=ClaudeInstall安装器_v{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; 需管理员：npm 全局装 claude-code 要写系统目录；向导提权一次，bat 继承 admin 不再二次弹
PrivilegesRequired=admin
ShowLanguageDialog=no
Uninstallable=no
; 全中文向导
[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Files]
; 只打包运行必需：启动器 bat + 核心脚本（排除文档/排雷记录）
Source: "{#BatchCmd}"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs

[Code]
var
  KeyPage: TInputQueryWizardPage;

// 建"填 API Key"页（在欢迎页之后）
procedure InitializeWizard;
begin
  KeyPage := CreateInputQueryPage(wpWelcome,
    'DeepSeek API Key',
    '请粘贴你的 DeepSeek API Key',
    'Key 只用于写入本地配置（~/.claude/settings.json），不会上传。' + #13#10 +
    '还没有？去 platform.deepseek.com 创建（Key 只显示一次，记得复制）。' + #13#10 +
    '提示：粘贴时按 Ctrl+V，或用右键粘贴。');
  KeyPage.Add('API Key：', False);
  KeyPage.Values[0] := '';
end;

// 校验：空 key 不给过（防止一路点下一步白装）
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = KeyPage.ID then
    if Trim(KeyPage.Values[0]) = '' then begin
      MsgBox('请先粘贴你的 DeepSeek API Key（在输入框里 Ctrl+V）。', mbError, MB_OK);
      Result := False;
    end;
end;

// 安装完成后：调 bat 执行真实安装（下载 Node/Git、npm 装 claude、写配置）
// 冒烟测试开关：设环境变量 CI_SMOKE=1 时跳过真实安装（只验证打包落盘结构）
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  CmdLine: String;
  Smoke: String;
begin
  if CurStep = ssPostInstall then begin
    Smoke := GetEnv('CI_SMOKE');
    if Smoke = '1' then begin
      MsgBox('【冒烟测试】文件已解压到 ' + ExpandConstant('{app}') + '，跳过真实安装。', mbInformation, MB_OK);
      exit;
    end;
    // 命令行方式传 key（--silent 让 bat 不 pause，装完自动关）
    CmdLine := '"{app}\{#BatchCmd}" --silent --key ' + Trim(KeyPage.Values[0]);
    if Exec(ExpandConstant('cmd.exe'), '/c ' + ExpandConstant(CmdLine), '',
            SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode) then begin
      if ResultCode <> 0 then
        MsgBox('安装过程中出现问题（退出码 ' + IntToStr(ResultCode) + '）。' + #13#10 +
               '常见原因：Key 无效 / 网络不通 / 账户余额不足。' + #13#10 +
               '可重新运行本安装器再试一次。', mbError, MB_OK)
      else
        MsgBox('安装完成！' + #13#10 +
               '打开命令行输入 claude 即可开始使用。' + #13#10 +
               '（若提示「是否信任此文件夹」，选择「信任」即可。）', mbInformation, MB_OK);
    end else
      MsgBox('无法启动安装程序，请重试或右键本文件「以管理员身份运行」。', mbError, MB_OK);
  end;
end;
