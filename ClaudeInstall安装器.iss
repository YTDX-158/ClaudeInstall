; =====================================================
; ClaudeInstall 安装器（Inno Setup）· v0.2
; 给国内小白：向导收 DeepSeek Key → 调 ClaudeInstall一键安装.bat
;   自动装 Node + Git + Claude Code + 写配置（跳过登录）
; 编译：ISCC.exe "ClaudeInstall安装器.iss"
; =====================================================

#define AppName "ClaudeInstall"
#define AppVersion "0.4.1"
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
; v0.3 新手引导页配图（dontcopy：不进安装目录，只在向导页显示）
Source: "assets\guide_cmd.bmp";      Flags: dontcopy
Source: "assets\guide_register.bmp"; Flags: dontcopy
Source: "assets\guide_key.bmp";      Flags: dontcopy
Source: "assets\guide_claude.bmp";   Flags: dontcopy

[Code]
var
  KeyPage: TInputQueryWizardPage;
  PageA, PageB, PageC: TWizardPage;
  BmpA, BmpA2, BmpB, BmpC: TBitmapImage;
  LblA, LblB, LblC: TNewStaticText;
  NekoBtn: TNewButton;
  NekoTip: TNewStaticText;

// v0.3：在自定义页上放一张引导图（新建控件，宽度撑满可用区，高 190）
procedure SetupGuideImage(Page: TWizardPage; const FileName: String; ALeft, ATop, AWidth, AHeight: Integer; var Img: TBitmapImage);
begin
  ExtractTemporaryFile(FileName);
  Img := TBitmapImage.Create(Page);
  Img.Parent := Page.Surface;
  Img.Bitmap.LoadFromFile(ExpandConstant('{tmp}\') + FileName);
  Img.Stretch := True;
  Img.SetBounds(ALeft, ATop, AWidth, AHeight);
end;

// v0.3：在自定义页上放一段要点文字（新建控件，自动换行，占满图下方剩余空间）
procedure SetupGuideText(Page: TWizardPage; const Text: String; TopPos: Integer; var Lbl: TNewStaticText);
begin
  Lbl := TNewStaticText.Create(Page);
  Lbl.Parent := Page.Surface;
  Lbl.Caption := Text;
  Lbl.AutoSize := False;
  Lbl.WordWrap := True;
  Lbl.SetBounds(0, TopPos, Page.Surface.Width, Page.Surface.Height - TopPos);
end;

// v0.4 推广：点「获取 ClaudeNeko」按钮 → 用默认浏览器打开下载页
procedure OpenNekoPage(Sender: TObject);
var
  ResultCode: Integer;
begin
  ShellExec('open', 'https://wwbkn.lanzoum.com/b01giav0pi',
            '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
end;

// 建 v0.3 三个新手引导页 + "填 API Key"页
procedure InitializeWizard;
var
  W: Integer;
begin
  // 【页A】怎么打开 Claude（普通权限，非管理员）：cmd 搜索 + 输入 claude 并排
  PageA := CreateCustomPage(wpWelcome, '开始之前 · 先看这一页', '怎么打开 Claude');
  W := PageA.Surface.Width;
  SetupGuideImage(PageA, 'guide_cmd.bmp', (W - 800) div 2, 8, 400, 200, BmpA);
  SetupGuideImage(PageA, 'guide_claude.bmp', (W - 800) div 2 + 400, 8, 400, 200, BmpA2);
  SetupGuideText(PageA,
    '· 按 Win 键 → 搜索 cmd → 直接打开（普通权限即可）' + #13#10 +
    '· 在 cmd 输入 claude 并回车' + #13#10 +
    '· 别用「以管理员身份运行」打开 Claude——界面会错位乱' + #13#10 +
    '· 万一界面乱了 → 关掉，用普通方式重开就好', 222, LblA);

  // 【页B】接 DeepSeek ①：注册 + 登录 + 实名
  PageB := CreateCustomPage(PageA.ID, '接 DeepSeek ①', '注册并登录开放平台');
  W := PageB.Surface.Width;
  SetupGuideImage(PageB, 'guide_register.bmp', (W - 460) div 2, 8, 460, 325, BmpB);
  SetupGuideText(PageB,
    '· 浏览器打开 platform.deepseek.com' + #13#10 +
    '· 手机号或微信登录（新号=自动注册，无需填资料）' + #13#10 +
    '· 需实名认证（传身份证 · 几分钟通过）', 347, LblB);

  // 【页C】接 DeepSeek ②：充值 + 建 key
  PageC := CreateCustomPage(PageB.ID, '接 DeepSeek ②', '充值 + 拿 Key');
  W := PageC.Surface.Width;
  SetupGuideImage(PageC, 'guide_key.bmp', (W - 460) div 2, 8, 460, 325, BmpC);
  SetupGuideText(PageC,
    '· 「充值」→ 支付宝/微信 → 先充 ¥10-20，够用很久' + #13#10 +
    '· 「API keys」→「创建 API key」→ 名字随意' + #13#10 +
    '· 复制 sk- 开头的 Key（⚠ 只显示一次，关窗即失）', 347, LblC);

  // 填 Key 页（接在页C之后）
  KeyPage := CreateInputQueryPage(PageC.ID,
    'DeepSeek API Key',
    '照着前面两页注册好，把 Key 粘贴这里',
    'Key 只用于写入本地配置（~/.claude/settings.json），不会上传。' + #13#10 +
    'Key 只显示一次，如果忘了可以回 platform 重新创建一个。' + #13#10 +
    '提示：粘贴时按 Ctrl+V，或用右键粘贴。');
  KeyPage.Add('API Key：', False);
  KeyPage.Values[0] := '';

  // 【v0.4 推广】完成页放「获取 ClaudeNeko」按钮（可点击 → 打开下载页）
  // 位置跟完成文字左对齐、宽度占满文字区（不压左侧插图、不截断文字）
  NekoBtn := TNewButton.Create(WizardForm.FinishedPage);
  NekoBtn.Parent := WizardForm.FinishedPage;
  NekoBtn.Caption := '获取 ClaudeNeko（图形界面版）';
  NekoBtn.Height := 32;
  NekoBtn.Left := WizardForm.FinishedLabel.Left;
  NekoBtn.Top := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + 14;
  NekoBtn.Width := WizardForm.FinishedPage.ClientWidth - NekoBtn.Left - 20;
  NekoBtn.OnClick := @OpenNekoPage;

  // 网盘下载密码提示（按钮下方一行小字）
  NekoTip := TNewStaticText.Create(WizardForm.FinishedPage);
  NekoTip.Parent := WizardForm.FinishedPage;
  NekoTip.Caption := '下载密码：YTDX666';
  NekoTip.Left := NekoBtn.Left + 4;
  NekoTip.Top := NekoBtn.Top + NekoBtn.Height + 6;
end;

// R2a：key 白名单校验——只许字母数字 + 下划线/点/连字符（Inno Pascal 无正则，手写字符循环）。
// 拦掉空格/引号/& | < > 等 cmd 危险字符（防命令行注入 + 防粘贴带多余内容）；宽容不强制 sk- 前缀
function KeyHasBadChars(const S: String): Boolean;
var
  i: Integer;
  ch: Char;
begin
  Result := False;
  for i := 1 to Length(S) do begin
    ch := S[i];
    if not (((ch >= 'a') and (ch <= 'z')) or ((ch >= 'A') and (ch <= 'Z')) or
            ((ch >= '0') and (ch <= '9')) or (ch = '_') or (ch = '.') or (ch = '-')) then begin
      Result := True;
      Exit;
    end;
  end;
end;

// 校验：空 key 不给过；含非法字符不给过（防止一路点下一步白装 / key 被截断 / cmd 注入）
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = KeyPage.ID then begin
    // 冒烟测试模式（CI_SMOKE=1）跳过 key 校验——方便自动化验证向导全流程
    if GetEnv('CI_SMOKE') = '1' then Exit;
    if Trim(KeyPage.Values[0]) = '' then begin
      MsgBox('请先粘贴你的 DeepSeek API Key（在输入框里 Ctrl+V）。', mbError, MB_OK);
      Result := False;
    end else if KeyHasBadChars(KeyPage.Values[0]) then begin
      MsgBox('Key 里含有不支持的字符（空格、引号或 & | < > 等）。' + #13#10 +
             '请只粘贴 Key 本身（形如 sk-xxxx…），不要带多余空格或文字。', mbError, MB_OK);
      Result := False;
    end;
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
