# 交叉 Review 审计记录：Gas 预估、Coin Info 与靓地址生成器

- **日期**：2026-11-27
- **实现方**：Gemini
- **独立 Reviewer**：Codex CLI (`codex exec --sandbox read-only`)
- **请求模型 / Effort**：`gpt-6.1-sol` / `high`（`codex-cli 0.172.0`）
- **审查会话 ID**：`01a21b3f-dee7-7ca3-adf1-0c082cf99ef9`（3 轮均精确续接同一会话）
- **基线 HEAD SHA**：`d81ad65ee880f53d5a2c030f9c00d48e0226aa44`
- **完成状态**：`complete`（全部 7 项 findings 已修复并经复审关闭，无新回归）

## 审查范围

- 交易预估 Gas 费用：`packages/client/src/utils/gasEstimate.ts`、`packages/client/src/utils/gasEstimate.test.ts`、`packages/client/src/components/GasEstimatePanel.tsx`、`packages/client/src/components/BulkTransfer/BulkTransfer.tsx`、`packages/client/src/components/CoinManager/CoinManager.tsx`、`packages/client/src/components/CoinManager/CoinOperationDialog.tsx`、`packages/client/src/components/CoinManager/BurnConfirmationDialog.tsx`
- Coin Info 查询页：`packages/client/src/components/CoinInfo/CoinInfo.tsx`、`packages/client/src/components/CoinInfo/coinInfoUtils.ts`、`packages/client/src/components/CoinInfo/coinInfoUtils.test.ts`、`packages/client/src/utils/explorer.ts`
- Sui 靓地址生成器：`packages/client/src/components/VanityAddress/VanityAddress.tsx`、`packages/client/src/components/VanityAddress/vanityUtils.ts`、`packages/client/src/components/VanityAddress/vanityUtils.test.ts`、`packages/client/src/components/VanityAddress/vanityWorker.ts`
- 路由、导航、多语言与日志：`packages/client/src/App.tsx`、`packages/client/src/components/Layout/Layout.tsx`、`packages/client/src/components/ToolList/ToolList.tsx`、`packages/client/src/i18n/locales/zh.json`、`packages/client/src/i18n/locales/en.json`、`packages/client/CHANGELOG.md`

## Findings 与处理闭环

| #   | 严重度 | 问题摘要                                                                             | 首轮核实 | 修复措施                                                                                                                                                                                                                            | 复审结果    |
| --- | ------ | ------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | P2     | Gas 预估未启用真实 Gas selection（SDK 默认发 `doGasSelection=false`）                | 成立     | `packages/client/src/utils/gasEstimate.ts` 显式传 `doGasSelection: true`，单测断言该参数                                                                                                                                            | 第 2 轮关闭 |
| 2   | P2     | 输入变化、弹窗切换或切网/切号后旧预估请求可能竞态覆盖新结果                          | 成立     | `BulkTransfer.tsx` 与 `CoinOperationDialog.tsx` 引入 `estimateRequestIdRef`；第 2 轮补查出 `CoinManager.tsx` 销毁确认框切网/切号同类遗漏，第 3 轮在切换 `useEffect` 同步递增 `burnEstimateRequestIdRef` 并关闭清空所有操作/确认弹窗 | 第 3 轮关闭 |
| 3   | P2     | Coin Info 切网/切号时若输入非法则残留旧上下文数据与新网络链接                        | 成立     | `CoinInfo.tsx` 切网/切号/client 变化时先递增 `requestIdRef` 并清空状态，再视输入合法性决定查询                                                                                                                                      | 第 2 轮关闭 |
| 4   | P2     | `formatCoinAmountWithDecimals` 将 `decimals` 截断到 18，超过 18 位精度代币金额被放大 | 成立     | 按 Sui `u8` 真实精度（`0..255`）计算除数，非法精度抛 `RangeError`，补 19 位与越界单测                                                                                                                                               | 第 2 轮关闭 |
| 5   | P2     | `isValidCoinType` 正则拒绝合法泛型 CoinType（如 `0x1::lp::LP<0x2::sui::SUI>`）       | 成立     | 改用 `@mysten/sui/utils` 的 `isValidStructTag` 并补充嵌套泛型单测                                                                                                                                                                   | 第 2 轮关闭 |
| 6   | P2     | 私钥/ID 复制未等待 `clipboard.writeText` 完成且未捕获失败，失败时误报成功            | 成立     | `VanityAddress.tsx` 与 `CoinInfo.tsx` 改为 `async/await` + `try/catch`，失败提示 `common.copyFailed`                                                                                                                                | 第 2 轮关闭 |
| 7   | P3     | 靓地址多 Worker 启动中途抛错会遗漏清理已启动线程与计时器                             | 成立     | `VanityAddress.tsx` 逐个登记 `workersRef.current.push(worker)` 并统一 `try/catch` 调用 `stopWorkers()`                                                                                                                              | 第 2 轮关闭 |

## 验证记录

- **实现方本地全量验证（最终代码）**：
  - `pnpm lint`：通过（0 errors / 0 warnings）
  - `pnpm format:check`：通过
  - `pnpm test`：通过（7 test files / 32 tests）
  - `pnpm build`：通过（`tsc --noEmit && vite build`，独立输出 `build/assets/vanityWorker-*.js`）
- **Codex 只读复审验证（各轮）**：
  - TypeScript、ESLint、`git diff --check` 均通过；并对 `doGasSelection`、竞态失效、超 18 位精度、泛型 StructTag、剪贴板失败与 Worker 异常清理做了针对性复现验证。
  - 限制：Codex 只读沙箱因无法创建临时目录未执行完整 Vitest 套件与产物构建，该部分由实现方本地完整验证补齐。
