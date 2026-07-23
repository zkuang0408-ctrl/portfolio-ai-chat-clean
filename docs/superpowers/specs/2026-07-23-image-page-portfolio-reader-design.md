# 高清分页作品阅读器设计

## 目标

将六份作品从浏览器端 PDF.js 整份解析改为逐页高清图片展示，在保留完整页序、左右翻页、页码和原始 PDF 下载的同时，显著降低首屏等待和单次翻页网络成本。

## 当前问题与证据

- 六份 PDF 合计约 41.4MB，单份约 4–11MB。
- PDF.js Worker 额外约 1.25MB。
- Cloudflare Pages 对当前 PDF Range 请求返回完整 `200` 文件，未提供局部 `206` 响应。
- `vercel.json` 中的缓存规则不会被 Cloudflare Pages 读取；当前 PDF 响应为 `max-age=0, must-revalidate`。
- 阅读器进入预加载边界后会加载整份 PDF，并在第一页后预取相邻 PDF 页面对象。

参考：

- <https://developers.cloudflare.com/pages/configuration/headers/>
- <https://developers.cloudflare.com/pages/configuration/serving-pages/>

## 方案选择

### 已选：预渲染分页图片

- 每页生成移动端和桌面端两种 WebP。
- 当前页按需加载，完成后仅预加载下一页。
- 原始 PDF 保留为完整下载和独立打开来源。
- 浏览器不再导入或执行 PDF.js。

### 未选方案

- 继续 PDF.js，仅增加首图：首次翻页仍需下载整份 PDF。
- 将 PDF 搬到 R2 并依赖 Range：需要额外存储、域名和缓存配置，且仍保留客户端 PDF 解析成本。

## 资产生成

### 来源

严格使用以下六份已确认 PDF，顺序不变：

1. INKSeat
2. EMOVUE
3. Fruit & Evolution
4. Atempo
5. UroSense
6. First Fly

### 输出

每个项目生成：

- `960px` 宽 WebP：移动设备
- `1800px` 宽 WebP：高密度桌面设备

文件按稳定的项目 ID、源 PDF 内容哈希和两位页码组织，例如：

```text
public/projects/pages/inkseat/a1b2c3d4/01-960.webp
public/projects/pages/inkseat/a1b2c3d4/01-1800.webp
```

生成清单记录：

- 项目 ID
- 原始 PDF 路径
- 页数
- 每页两种图片路径
- 宽高比例

图片使用适合文字和作品图的高质量 WebP 参数；不得裁剪页面、改变页序或遗漏页面。

## 阅读器

### 初始状态

- HTML 中输出第一页图片信息与完整页数。
- 图片使用 `loading="lazy"`、`decoding="async"`。
- 进入项目附近时只请求第一页的合适尺寸。
- 加载期间保留现有黑色舞台和低干扰状态文字。

### 翻页

- 保留现有 `<` 与 `>` 控件、键盘方向键、触摸滑动、页码格式和无障碍标签。
- 点击翻页只替换当前图片的 `src`/`srcset`。
- 当前页加载完成后，仅预加载下一页；返回上一页使用浏览器缓存。
- 快速连续翻页时，只允许最后一次请求更新可见页面，防止旧图片覆盖新页面。

### 原始 PDF

- 每个项目提供“打开完整 PDF”入口。
- 点击该入口才请求原始 PDF。
- 原始 PDF 仍保留全部页，并继续作为 AI 引用来源。

## 缓存

新增 `public/_headers`：

- Vite 哈希资源 `/assets/*`：一年 immutable。
- 分页图片 `/projects/pages/*`：一年 immutable；源 PDF 内容哈希是路径的一部分，内容更新必然生成新路径。
- 原始 PDF `/projects/pdfs/*`：较短浏览器缓存和较长边缘缓存，允许后续替换。
- 保留现有安全响应头。

## 构建边界

- 高清分页图片与清单在本地生成并提交 GitHub。
- Cloudflare 构建只验证资产，不依赖构建机安装 Poppler 或 Python 图像库。
- `prebuild` 检查每个项目的清单页数、文件存在性和连续页码。
- 删除客户端对 `pdfjs-dist` 与 PDF Worker 的引用；如果没有其他用途，再从运行时依赖中移除。

## 性能验收

- 首页加载不请求任何原始作品 PDF。
- 浏览到第一个项目时只加载该项目当前页的图片，不加载另外五份 PDF。
- 未点击“打开完整 PDF”时，网络面板中不存在 `/projects/pdfs/*.pdf` 请求。
- 网络面板中不存在 `pdf.worker` 请求。
- 当前页成功后最多主动预加载下一页。
- 移动端优先选择 `960px` 资源，桌面高密度屏可选择 `1800px` 资源。

## 完整性与视觉验收

- 六个项目顺序保持不变。
- 每份图片页数与原 PDF 页数完全一致。
- 每页首尾、文字、图像和页边界均完整，无裁切、空白错页或旋转错误。
- 页码、左右翻页、键盘、触控与 AI 引用跳转均继续工作。
- 代表性页面在桌面和移动端无肉眼可见的文字模糊。

## 发布

1. 完成全部页面渲染与自动完整性检查。
2. 运行单元测试、生产构建和浏览器网络测试。
3. 提交生成资产、清单、阅读器代码与 Cloudflare 头配置。
4. 推送 GitHub，由 Cloudflare Pages 自动部署。
5. 对线上首页、六个项目和原始 PDF 下载进行抽样验收。
