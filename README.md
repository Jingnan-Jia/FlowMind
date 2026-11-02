# FlowMind

> 打开就能用的思维导图 —— 无需注册、无限节点、数据留在本地。

FlowMind 是一个纯前端（local-first）的 Web 思维导图工具，MVP 阶段零后端、零账号。

## 快速开始

```bash
npm install
npm run dev      # 开发：http://localhost:5173
npm run build    # 类型检查 + 生产构建（输出 dist/）
npm run preview  # 预览生产构建
```

## MVP 功能清单（已实现）

- **即开即画**：打开首页即画布，光标直接输入；数据存 IndexedDB（localStorage 兜底），刷新/关闭不丢
- **键盘心流**：`Tab` 子节点 / `Enter` 同级 / `Shift+Enter` 换行 / 直接打字即编辑 / 方向键移动 / `⌘Z` `⇧⌘Z` 撤销重做（无上限快照）
- **自动布局**：思维导图（左右辐射）/ 逻辑图 / 结构图，一键切换；画布无限平移缩放（⌘+滚轮）
- **节点管理**：拖拽换父级、折叠/展开（数字小球显示隐藏数量）、优先级标记（红/黄/绿）
- **大纲 ↔ 导图双向**：左侧大纲实时同步，双击可直接改文字，点击定位画布节点
- **导图库**：多张导图管理（新建/切换/删除），自动保存
- **导入导出**：Markdown 大纲导入；导出 PNG / SVG / Markdown / OPML / JSON
- **亮 / 暗主题**

## 技术栈

- React 18 + TypeScript + Vite + Zustand
- 渲染：SVG + 自研布局引擎（列宽取同层最大值 + 纵向堆叠带居中，支持左右分侧）
- 持久化：IndexedDB，localStorage 兜底，250ms 防抖自动保存
- 数据模型：扁平 `nodes` 记录 + 父子引用，为后续接入 Yjs（CRDT 实时协作）预留

## 目录结构

```
src/
  types.ts            # 数据模型（Doc / MindNode）
  store.ts            # 全局状态与全部业务动作（zustand）
  lib/
    layout.ts         # 自动布局引擎（水平/垂直、左右分侧）
    text.ts           # 文本测量与换行
    storage.ts        # IndexedDB / localStorage 持久化
    markdown.ts       # Markdown / OPML 解析与序列化
    export.ts         # SVG/PNG 导出
    theme.ts          # 配色与节点样式
  components/
    Canvas.tsx        # 画布：渲染、平移缩放、拖拽、快捷键
    NodeEditor.tsx    # 节点行内编辑器
    Outline.tsx       # 大纲视图
    MapList.tsx       # 导图库
    Sidebar.tsx / Toolbar.tsx / Modal.tsx
```

## Roadmap（对应 PRD）

- **M3**：账号与云同步、AI 生成初稿/扩写分支/长文转导图、分享链接、模板库、演示模式
- **M4**：Yjs 实时协作、历史版本、跨分支关联线、团队空间

## 已知边界

- 单画布节点建议 < 2000（SVG 渲染），超出后再评估 Canvas 渲染
- 空节点失焦自动删除；根节点不可删除、不可拖拽
