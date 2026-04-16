#!/usr/bin/env python3
"""将happy目录中的项目移动到根目录"""

import os
import shutil
from pathlib import Path

# 设置路径
root_dir = Path(r"C:\Users\ROG\Desktop\happy_coder")
happy_dir = root_dir / "happy"

# 需要跳过的目录（保护Claude配置）
skip_dirs = {'.claude'}
skip_files = {'move_project.py'}

print("开始移动项目文件...")
print(f"从: {happy_dir}")
print(f"到: {root_dir}")
print()

# 获取happy目录中的所有项目
if not happy_dir.exists():
    print("错误: happy目录不存在!")
    exit(1)

moved_count = 0
skipped_count = 0

for item in happy_dir.iterdir():
    item_name = item.name

    # 跳过保护目录
    if item_name in skip_dirs:
        print(f"跳过保护目录: {item_name}")
        skipped_count += 1
        continue

    if item_name in skip_files:
        print(f"跳过脚本文件: {item_name}")
        skipped_count += 1
        continue

    dest = root_dir / item_name

    if dest.exists():
        print(f"警告: 目标已存在，跳过: {item_name}")
        skipped_count += 1
        continue

    try:
        if item.is_dir():
            shutil.move(str(item), str(dest))
            print(f"移动目录: {item_name}")
        else:
            shutil.move(str(item), str(dest))
            print(f"移动文件: {item_name}")
        moved_count += 1
    except Exception as e:
        print(f"错误移动 {item_name}: {e}")
        skipped_count += 1

print()
print(f"完成! 移动了 {moved_count} 个项目, 跳过了 {skipped_count} 个")

# 如果happy目录为空，尝试删除
try:
    remaining = list(happy_dir.iterdir())
    if not remaining:
        happy_dir.rmdir()
        print("已删除空的happy目录")
    else:
        print(f"happy目录还有 {len(remaining)} 个项目，保留目录")
except Exception as e:
    print(f"无法删除happy目录: {e}")
