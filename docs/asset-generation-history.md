# 角色与素材来源

## v1.2 连续帧素材

当前使用 `assets/animations/` 下的 walk.png、stretch.png、wings.png、relax.png、read.png。五张均由内置 image_gen 依据同一原立绘制作，未使用 CLI 或用户 API Key。

统一生成要求为：4列×2行、8个全身顺序帧，透明底、固定镜头和相同身体比例、脚底基线、白发紫眼白礼服成年龙娘；每帧必须是同一连续动作的不同阶段，而非无关姿势合集。具体动作提示为：

- walk：面朝右的8阶段迈步循环，交替前后脚、经过位、重心和摆臂；左行由程序镜像。
- stretch：放松→耸肩屈肘→双臂平举→上举→过头伸展→屈肘放松→下放→回到自然站立。
- wings：半收拢→抬起→半展开→高位完全展开→下拍→低位展开→收回→回到半收拢。
- relax：上排站立→屈膝下降→接近坐下→闭眼坐稳；下排自然→手近嘴→闭眼哈欠→放下手睁眼。
- read：上排捧书→低头看页→抬手翻页→页落定抬头；下排无书倾听→半闭眼→眨眼闭合→睁眼微笑。

每张1536×1024 RGBA PNG。运行时按四列两行切分，透明蒙版去掉导出噪点，并用同一片段的固定画布对齐人物脚底和中心。动画由 src/animation.cjs 的时间轴驱动；真实播放换帧由桌面检查验证。

## v1.1 当前素材

当前角色使用 `assets/motions.png`，由内置 image_gen 根据同一原立绘制作九姿势，再修订留白排版。顺序：站立、伸懒腰、打哈欠、坐下、阅读、向左走、向右走、展翅、倾听。原始导出 1254 × 1254，完整保留；程序按实际留白分格并使用运行时透明蒙版过滤导出噪点、对齐脚底，不改变身体比例。旧六格仅保留用于历史记录及托盘图标。

生成要求：同一成年白发紫眼龙娘、白色礼服、龙角与龙翼龙尾，正常七头身，九格透明图；不含饼干、花束或摸头戳脸姿势。排版修订提示词：

> Fix the packing of this sprite atlas only. Keep all nine adult normal-proportion dragon woman poses, identity, dress and style unchanged. Output a square transparent 3x3 grid of nine EQUAL SQUARE CELLS. CRITICAL: shrink each entire pose by 30 percent relative to its cell, preserve anatomical scale between standing poses, center in cell with same foot baseline. Every pose including stretched overhead arms, full spread wings, tail and long dress must be entirely inside its own cell with at least 12% EMPTY TRANSPARENT MARGIN on each of all four sides. Restore the currently clipped hand tips at top and wings crossing cell boundaries. Do not let any content cross between cells. Nine SMALL full body figures, with wide empty transparent gutters. True transparent background, no shadows, no glow, no labels, no frames, no grid lines, no decorations. Smaller figures with empty space are essential for independent cropping.

## v1.0 历史素材记录

角色设计：ZipZipPipe 版 GPT 白发龙娘，非 OpenAI 官方角色。

- 原帖：https://www.bilibili.com/opus/1233069202138464289
- 三视图：https://www.bilibili.com/opus/1238613841710940181
- 本次使用的参考图：https://genderswapai.com/images/ai-gijinka/gpt.webp
- 素材收集索引与哈希：同级目录 ../dragon-pet-materials/sources.json

本程序 `assets/character-sheet.png` 是根据上述形象参考，使用 Codex 内置 image_gen 工具制作并修订的六格差分。没有使用收集到的 Q 版精灵图，也没有集成第三方 Live2D 项目代码。角色相关权利仍归原权利人；本次交付用于用户本地非商业使用，不作原角色完整授权声明。

## 生成记录

使用内置图像生成工具，未使用 API 密钥或 CLI。参考角色原图，先生成中性、闭眼、鼓脸、挥手、饼干、花束六格透明差分；第二次修复裁切；第三次改为方格宽幅排版，作为最终素材。

最终修订提示词（输入为前一版六格差分，transparent_background=true）：

> Production sprite atlas REPACKING FIX. Input: same six full-body adult dragon woman images. Output must be WIDE LANDSCAPE, aspect ratio 3:2, e.g. 3072x2048 or 1536x1024. Exactly 3 columns x 2 rows of SQUARE cells, on TRUE transparent background. Each individual whole character occupies only 60% of cell WIDTH, 80% of cell HEIGHT; all six have the same scale and identical centered baseline and head position per cell. THERE MUST BE LARGE EMPTY TRANSPARENT GAPS BETWEEN CHARACTERS. Keep all six figures fully contained inside their respective square cells, 10% transparent padding above and below, 20% empty transparent padding to either side. Restore all clipped wing edges, horn tips, tail edges and dress hems. Absolutely no character part may cross its cell boundary. Preserve all six exact adult character designs, 7-head adult proportions (not chibi), white hair, horns, purple eyes, white lavender dragon wings and tail and white dress, same six expressions in same order: neutral / closed-eye happy / puffed cheeks / waving / eating cookie / holding flowers. Clean alpha edges, no labels no frames no background no shadows. Key priority: landscape 3:2 canvas, six square cells, small full figures with broad empty transparent gutters.

输出 1536 × 1024 RGBA PNG。程序加载时按 3 × 2 分格，按透明边界对齐，保持正常身体比例；正常运行不访问互联网。

v1.3 assets/motion/*.bin 为既有40张源帧之间的 RGBA16F 双向运动向量，不是新角色素材；DIS 光流离线计算，伸展手臂加入局部控制点约束，运行时由 WebGL2 插值。原图和源帧保持原文件。重建脚本：scripts/export-motion.cjs 与 scripts/build-motion-fields.py。

v1.5 已移除展翅、伸懒腰和单独坐下动作。运行只加载walk/read/relax三组原有素材及对应运动场。旧素材保留作为生成过程记录；不通过运行入口、托盘、自动动作或IPC执行。透明纹理使用预乘Alpha采样；未改写原图文件。
