#!/bin/sh
msg=$(cat)
first=$(printf '%s' "$msg" | head -n1)
rest=$(printf '%s' "$msg" | tail -n +2)

new_first=""
case "$first" in
  "feat(Todo-0): 实现 JSON 树渐进加载并修复虚拟文本换行重叠")
    new_first="feat(Todo-0): add progressive JSON tree loading and fix virtual text wrap overlap"
    ;;
  "fix(Todo-0): 修复 Map Remote 下 WSS 抓包上游转发与 Host/Origin 校验")
    new_first="fix(Todo-0): fix WSS upstream forwarding and Host/Origin validation under Map Remote"
    ;;
  "perf(Todo-0): Response 超 2MB 正文跳过渲染并提供复制")
    new_first="perf(Todo-0): skip rendering Response body over 2MB and offer copy"
    ;;
  "feat(Todo-0): 实现流量右键菜单并将正文查看改用 CodeMirror")
    new_first="feat(Todo-0): add traffic context menu and switch body viewer to CodeMirror"
    ;;
  "fix(Todo-0): 修复 Map Remote HTTP 映射未转发至本地上游")
    new_first="fix(Todo-0): fix Map Remote HTTP mapping not forwarding to local upstream"
    ;;
  "feat(Todo-0): 接入远端 manifest 运营通知与 GitHub Actions 校验")
    new_first="feat(Todo-0): integrate remote manifest ops notices and GitHub Actions validation"
    ;;
  "refactor(Todo-0): 设置页响应式布局并重命名 Tauri 包")
    new_first="refactor(Todo-0): responsive settings layout and rename Tauri package"
    ;;
  "feat(Todo-0): 支持 Map Local 内联响应体与响应头自动检测")
    new_first="feat(Todo-0): support Map Local inline response body and auto-detect response headers"
    ;;
  "feat(Todo-0): 支持 WSS WebSocket 会话抓包与消息展示")
    new_first="feat(Todo-0): support WSS WebSocket session capture and message display"
    ;;
  "feat: macos安装说明更新")
    new_first="feat: update macOS installation instructions"
    ;;
  "feat(Todo-0): 支持上游 HTTPS 浏览器 TLS 指纹伪装")
    new_first="feat(Todo-0): impersonate browser TLS fingerprint for upstream HTTPS"
    ;;
esac

if [ -n "$new_first" ]; then
  printf '%s\n' "$new_first"
  if [ -n "$rest" ]; then
    printf '%s' "$rest"
  fi
else
  printf '%s' "$msg"
fi
