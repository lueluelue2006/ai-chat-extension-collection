# 致谢（Credits）

GitHub 首页里的 `Contributors` 只会统计这个仓库默认分支上的实际提交作者，**不会**自动展示那些被移植、引用、补丁化或集成进来的上游作者。

这个文件用于长期维护 AI捷径 的外部来源与致谢信息。这里只记录当前仓库里**能够明确确认**的外部作者、上游实现、补丁来源或移植链；如果未来补充了更准确的许可证、上游链接或作者信息，应在这里继续更新。

## 当前致谢名单

| 模块 | 致谢对象 | 说明 | 上游 / 来源 | 许可证 |
| --- | --- | --- | --- | --- |
| `quicknav` | `LinuxDO loongphy` | 提供暗色模式与回弹相关补丁 | 当前注册表注明补丁来源；主脚本由 `lueluelue2006` 持续演进 | `MIT（上游脚本声明）` |
| `grok_rate_limit_display` | `Blankspeaker`、`CursedAtom` | 当前实现说明里注明：原始脚本来自 `Blankspeaker`，并提到其移植自 `CursedAtom` 的 Chrome 扩展 | 来源链已在模块元数据保留 | `未标注（内部脚本）` |
| `chatgpt_usage_monitor` | `tizee@Github` | 用量统计能力基于其实现思路和代码链路移植，并在当前仓库中持续演进 | <https://github.com/tizee-tampermonkey-scripts/tampermonkey-chatgpt-model-usage-monitor> | `MIT` |
| `chatgpt_download_file_fix` | `LinuxDO pengzhile` | ChatGPT 下载修复模块来源署名 | 当前注册表注明作者为 `pengzhile(linux.do)` | `未标注（内部脚本）` |
| `chatgpt_hide_feedback_buttons` | `LinuxDO zhong_little` | ChatGPT 隐藏点赞/点踩模块来源署名 | 当前注册表注明作者为 `zhong_little(linux.do)` | `未标注（内部脚本）` |
| `genspark_credit_balance` | `LinuxDO 悟空` | Genspark 积分余量模块来源署名 | 当前注册表注明其为原始脚本作者；现仓库为 MV3 集成版 | `未标注（内部脚本）` |

## 维护规则

- 当某个模块明确来源于外部脚本、补丁、移植链或作者贡献时，优先在注册表元数据里补全 `authors / upstream / license`，再同步到这里。
- 当上游链接、许可证或作者标识发生变化时，以**可验证证据**更新，不凭记忆补写。
- 这个文件是“致谢名单”，不是 GitHub 自动 Contributors 的替代品；不要为了让某人出现在 GitHub Contributors 里而伪造 commit 作者。
