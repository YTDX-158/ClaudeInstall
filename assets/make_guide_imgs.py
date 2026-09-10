# -*- coding: utf-8 -*-
"""ClaudeInstall v0.3 引导图 v6：全部用【完整未裁】原图，仅按比例缩放
- 页A 两图并排各 400x200；页B/C 完整图 460x325
- C3 仅打码 API Key（不裁）
"""
import os, glob
from PIL import Image, ImageDraw

SRC = r'C:\Users\仰天大笑\Desktop\待处理\新建文件夹 (3)'
DST = r'D:\Claude_Files\002_项目\ClaudeInstall\dist_installer\img'
os.makedirs(DST, exist_ok=True)

CAN_A  = (400, 200)   # 页A 并排两图
CAN_BC = (460, 325)   # 页B/C 完整图

def fit(im, canvas, name):
    CW, CH = canvas
    s = min(CW / im.width, CH / im.height)
    im2 = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    c = Image.new('RGB', (CW, CH), (255, 255, 255))
    c.paste(im2, ((CW - im2.width) // 2, (CH - im2.height) // 2))
    c.save(os.path.join(DST, name), 'BMP')
    print(f'{name}: 内容{im2.size} @ {CW}x{CH}')

for p in glob.glob(os.path.join(DST, 'guide_*.bmp')):
    os.remove(p)

# 页A 图1：cmd 搜索（原图）
fit(Image.open(os.path.join(SRC, 'A.png')).convert('RGB'), CAN_A, 'guide_cmd.bmp')

# 页A 图2：cmd 输入 claude —— 完整原图，保留"管理员"标题栏
fit(Image.open(os.path.join(SRC, '屏幕截图 2026-09-10 182110.png')).convert('RGB'), CAN_A, 'guide_claude.bmp')

# 页B：deepseek —— 完整原图（不裁浏览器栏）
fit(Image.open(os.path.join(SRC, 'B1.png')).convert('RGB'), CAN_BC, 'guide_register.bmp')

# 页C：创建 key —— 完整原图（不裁），仅打码 API Key 那行
c3 = Image.open(os.path.join(SRC, 'C3.png')).convert('RGB')
ImageDraw.Draw(c3).rectangle([660, 590, 1180, 675], fill=(190, 190, 190))
fit(c3, CAN_BC, 'guide_key.bmp')

print('完成:', DST)
